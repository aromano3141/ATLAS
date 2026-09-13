import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash,now } from './util.ts';

export interface Job {id:string;kind:string;payload:string;state:string;attempts:number;due:number;lease:number;error:string|null;}
export interface Effect {id:string;kind:string;state:string;request:any;reference?:any;observations:any[];error?:string;attempts:number;updatedAt:string;}
export class Store {
  db:DatabaseSync;
  constructor(path:string){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    if(!this.db.prepare('SELECT version FROM schema_migrations WHERE version=1').get())this.transaction(()=>{
      this.db.exec(`CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(kind,id));
        CREATE INDEX records_kind_updated ON records(kind,updated_at DESC);
        CREATE TABLE jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,due INTEGER NOT NULL,lease INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,error TEXT);
        CREATE INDEX jobs_due ON jobs(state,due);
        CREATE TABLE effects(id TEXT PRIMARY KEY,kind TEXT NOT NULL,body TEXT NOT NULL);
        CREATE TABLE events(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,body TEXT NOT NULL,at TEXT NOT NULL);`);
      this.db.prepare('INSERT INTO schema_migrations VALUES(1,?)').run(now());
    });
  }
  transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  get<T=any>(kind:string,id:string):T|undefined{const row=this.db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind,id) as any;return row?JSON.parse(row.body):undefined;}
  all<T=any>(kind:string):T[]{return(this.db.prepare('SELECT body FROM records WHERE kind=? ORDER BY updated_at DESC').all(kind) as any[]).map(x=>JSON.parse(x.body));}
  put(kind:string,id:string,value:unknown){this.db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(kind,id,JSON.stringify(value),now());}
  immutable(kind:string,id:string,value:unknown){this.db.prepare('INSERT OR IGNORE INTO records VALUES(?,?,?,?)').run(kind,id,JSON.stringify(value),now());}
  log(kind:string,body:unknown){this.db.prepare('INSERT INTO events(kind,body,at) VALUES(?,?,?)').run(kind,JSON.stringify(body),now());}
  history(){return(this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 250').all() as any[]).map(x=>({...x,body:JSON.parse(x.body)}));}
  enqueue(kind:string,key:string,payload:unknown,due=Date.now()){const jobId=hash([kind,key]);this.db.prepare("INSERT OR IGNORE INTO jobs(id,kind,payload,state,due) VALUES(?,?,?,'queued',?)").run(jobId,kind,JSON.stringify(payload),due);return jobId;}
  claim(time=Date.now()):Job|undefined{return this.transaction(()=>this.db.prepare("UPDATE jobs SET state='running',lease=?,attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE (state='queued' AND due<=?) OR (state='running' AND lease<?) ORDER BY due LIMIT 1) RETURNING *").get(time+120000,time,time) as unknown as Job|undefined);}
  finish(job:Job){this.db.prepare("UPDATE jobs SET state='done',lease=0,error=NULL WHERE id=? AND lease=?").run(job.id,job.lease);}
  fail(job:Job,error:string){this.db.prepare("UPDATE jobs SET state='failed',lease=0,error=? WHERE id=? AND lease=?").run(error,job.id,job.lease);this.log('job_failed',{id:job.id,kind:job.kind,error});}
  jobs(){return this.db.prepare('SELECT id,kind,state,due,attempts,error FROM jobs ORDER BY due DESC LIMIT 100').all();}
  retry(jobId:string){this.db.prepare("UPDATE jobs SET state='queued',due=?,lease=0,error=NULL WHERE id=? AND state='failed'").run(Date.now(),jobId);}
  effect(id:string):Effect|undefined{const row=this.db.prepare('SELECT body FROM effects WHERE id=?').get(id) as any;return row?JSON.parse(row.body):undefined;}
  effects():Effect[]{return(this.db.prepare('SELECT body FROM effects').all() as any[]).map(x=>JSON.parse(x.body));}
  putEffect(value:Effect){value.updatedAt=now();this.db.prepare('INSERT INTO effects VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(value.id,value.kind,JSON.stringify(value));}
  close(){this.db.close();}
}

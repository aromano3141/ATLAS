import type {CalendarEvent,ConfigT,EntityT,Snapshot} from './contracts.ts';
import {Config} from './contracts.ts';
import type {Providers} from './providers.ts';
import {ProviderError} from './providers.ts';
import type {Store} from './db.ts';
import {hash,now,id} from './util.ts';
import {localInstant,dayAt,addDays} from './time.ts';
export function fixtureConfig():ConfigT{return Config.parse({operatorSlackId:'operator',approverSlackIds:['operator'],calendarIds:['demo-calendar'],slackChannelIds:['demo-team'],entities:[
  {id:'launch',title:'Atlas launch',kind:'launch',calendarId:'demo-calendar',eventId:'launch-event',slackChannelId:'demo-team',threadTs:'1',authorityUserIds:['owner'],jiraVersionId:'demo-version',jiraProjectId:'demo-project'},
  {id:'meeting',title:'North Office client meeting',kind:'meeting',calendarId:'demo-calendar',eventId:'meeting-event',slackChannelId:'demo-team',threadTs:'2',authorityUserIds:['owner'],issueKey:'DEMO-42',clientMeeting:true}],sharingRules:[{entityId:'launch',audience:'demo-team',allowJira:true},{entityId:'meeting',audience:'demo-team',allowJira:true}],places:{'North Office':{label:'North Office (fixture)',address:'Synthetic demo destination',confirmed:true}},model:'fixture'});}
export class FixtureProviders implements Providers {
  mode='fixture' as const;timeoutAfterWrite=false;writeCount=0;
  constructor(public store:Store){if(!store.get('remote','seed'))this.seed();}
  seed(){const day=addDays(dayAt(now(),'America/Chicago'),2);this.store.put('remote','seed',{day});
    this.store.put('remote','launch-event',{id:'launch-event',etag:'v1',summary:'Atlas launch',start:{date:'2026-09-30'},end:{date:'2026-10-01'},description:'Preserve this launch note.',reminders:{useDefault:true}});
    this.store.put('remote','meeting-event',{id:'meeting-event',etag:'v1',summary:'Client meeting',start:{dateTime:localInstant(day,'14:00','America/Chicago'),timeZone:'America/Chicago'},end:{dateTime:localInstant(day,'15:00','America/Chicago'),timeZone:'America/Chicago'},location:'Downtown Office',description:'Preparation issue: DEMO-42. Preserve this note.',reminders:{useDefault:false,overrides:[{method:'popup',minutes:30}]}});
    this.store.put('remote','demo-version',{id:'demo-version',projectId:'demo-project',releaseDate:'2026-09-30',name:'Atlas 1.0',description:'Preserve version description.'});
    this.store.put('remote','DEMO-42',{key:'DEMO-42',fields:{summary:'Finish client presentation',status:{name:'In Progress',statusCategory:{key:'indeterminate'}},duedate:day,description:'Presentation is needed before the client meeting.'},comments:[]});
  }
  async snapshot(entity:EntityT):Promise<Snapshot>{const day=this.store.get('remote','seed').day;const texts=entity.kind==='launch'?['Approved: launch = launchDate=2026-10-08','Proposal: launch = launchDate=2026-10-15']:[`Approved: meeting = start=${localInstant(day,'15:00','America/Chicago')}; location=North Office`];
    const evidence=texts.map((text,i)=>({id:`fixture:${entity.id}:${i}`,source:'slack' as const,entityId:entity.id,authorId:i?'teammate':'owner',at:new Date(Date.now()-86400000+i*60000).toISOString(),retrievedAt:now(),text,url:'',channelId:'demo-team',threadTs:entity.threadTs,private:true}));
    // Stable fixture evidence times allow recovery tests to distinguish real drift.
    evidence.forEach((e,i)=>{e.at=`2026-09-12T1${i}:00:00Z`;});
    const calendar=await this.calendarGet(entity.calendarId,entity.eventId),jira=entity.jiraVersionId?await this.jiraGet(entity.jiraVersionId):undefined,issue=entity.issueKey?await this.issue(entity.issueKey):undefined;
    return{id:hash({entity,evidence:evidence.map(({retrievedAt,...e})=>e),calendar,jira,issue}),entity,evidence,calendar,jira,issue,defaults:[{method:'popup',minutes:30}],retrievedAt:now(),complete:true,warnings:['Synthetic fixture workspace. No external services are called.']};
  }
  async calendarGet(c:string,e:string):Promise<CalendarEvent>{const event=this.store.get('remote',e);if(!event)throw new ProviderError('calendar',404,'not_found');return structuredClone(event);}
  async calendarPatch(c:string,e:string,patch:Record<string,unknown>,etag:string){const event=await this.calendarGet(c,e);if(event.etag!==etag)throw new ProviderError('calendar',412,'precondition_failed');const updated={...event,...patch,etag:id()};this.store.put('remote',e,updated);this.writeCount++;if(this.timeoutAfterWrite){this.timeoutAfterWrite=false;throw new ProviderError('calendar',0,'injected_timeout_after_success',true);}return updated;}
  async calendarList(){return this.store.all<CalendarEvent>('remote').filter(e=>e.start&&e.id);}
  async calendarDefaults(){return[{method:'popup',minutes:30}];}
  async freebusy(c:string,start:string,end:string){return !(await this.calendarList()).some(e=>e.start.dateTime&&Date.parse(e.start.dateTime)<Date.parse(end)&&Date.parse(e.end.dateTime!)>Date.parse(start));}
  async createBlock(c:string,event:Record<string,unknown>){const data={...event,etag:id()} as CalendarEvent;this.store.put('remote',data.id,data);return data;}
  async jiraGet(id:string){return structuredClone(this.store.get('remote',id));}
  async jiraPatch(id:string,patch:Record<string,unknown>){const data={...await this.jiraGet(id),...patch};this.store.put('remote',id,data);this.writeCount++;return data;}
  async issue(key:string){return this.store.get('remote',key);}
  async comments(key:string){return this.store.all<any>('remoteComment').filter(c=>c.issueKey===key);}
  async comment(key:string,text:string,actionId:string,visibility?:unknown){const data={id:id(),issueKey:key,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]},properties:[{key:'realitySyncAction',value:actionId}],visibility};this.store.put('remoteComment',data.id,data);return data;}
  async slack(method:string,p:Record<string,any>={}){if(method==='conversations.members')return{members:['operator','owner','teammate'],response_metadata:{}};
    if(method==='conversations.open')return{channel:{id:'demo-dm'}};
    if(method==='chat.scheduleMessage'){const value={id:id(),channel_id:p.channel,post_at:p.post_at,text:p.text};this.store.put('remoteSchedule',value.id,value);return{scheduled_message_id:value.id,channel:p.channel};}
    if(method==='chat.scheduledMessages.list')return{scheduled_messages:this.store.all('remoteSchedule').filter(s=>!s.deleted),response_metadata:{}};
    if(method==='chat.deleteScheduledMessage'){const value=this.store.get('remoteSchedule',p.scheduled_message_id);if(value.post_at*1000-Date.now()<60000)throw new ProviderError('slack',400,'invalid_scheduled_message_id');this.store.put('remoteSchedule',value.id,{...value,deleted:true});return{ok:true};}
    if(method==='chat.postMessage'){const value={...p,ts:String(Date.now()/1000),user:'fixture-bot'};this.store.put('remoteMessage',value.ts,value);return value;}
    if(method==='conversations.history'||method==='conversations.replies')return{messages:this.store.all('remoteMessage').filter(m=>m.channel===p.channel),response_metadata:{}};
    if(method==='users.info')return{user:{id:p.user,profile:{email:`${p.user}@example.invalid`}}};return{ok:true};}
  async health(){return['Slack','Google Calendar','Jira'].map(name=>({name,connected:false,fixture:true,checkedAt:now()}));}
}

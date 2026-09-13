import type {Store,Effect} from './db.ts';
import type {Providers} from './providers.ts';
import {ProviderError} from './providers.ts';
import type {ConfigT,EntityT,Snapshot,RepairPlan,RepairAction,Approval,EventRevision} from './contracts.ts';
import type {ReconciliationEngine} from './engine.ts';
import {investigate,planRevision} from './engine.ts';
import {eventStart,moveEvent,occurrenceKey} from './time.ts';
import {assert,hash,id,now,pick,equal,safeError} from './util.ts';

export function sourceDigest(s:Snapshot){return hash(s.evidence.map(({retrievedAt,...e})=>e).sort((a,b)=>a.id.localeCompare(b.id)));}
export function patchMatches(actual:Record<string,any>,patch:Record<string,any>):boolean{return Object.entries(patch).every(([k,v])=>{
  if(k==='start'||k==='end'){const a=actual[k];if(!a)return false;return Object.entries(v).every(([field,value])=>field==='dateTime'?Date.parse(a.dateTime)===Date.parse(value as string):equal(a[field],value));}
  return equal(actual[k]??null,v);
});}
export class RealityService {
  onDependency?:(eventId:string)=>Promise<void>;
  constructor(public store:Store,public providers:Providers,public engine:ReconciliationEngine,public config:()=>ConfigT){}
  entity(id:string){const e=this.config().entities.find(e=>e.id===id);assert(e,'Select a configured entity.');return e;}
  currentEvent(id:string){const event=this.store.get<EventRevision>('event',id);assert(event,'Scan the event before using Adapt.');return event;}
  plan(id:string){const plan=this.store.get<RepairPlan>('plan',id);assert(plan,'Repair revision not found.');return plan;}
  events(){return this.store.all<EventRevision>('event');}
  async scan(){const results=[];for(const e of this.config().entities){try{results.push(await this.scanEntity(e));}catch(error){this.store.put('scanError',e.id,{entityId:e.id,error:safeError(error),at:now()});this.store.log('scan_failed',{entityId:e.id,error:safeError(error)});}}
    await this.refreshOtherEvents();this.store.put('meta','lastScan',{at:now(),results});return results;}
  async scanEntity(entity:EntityT){const s=await this.providers.snapshot(entity);this.store.immutable('snapshot',s.id,s);
    const old=this.store.get<{snapshotId:string;planId:string}>('current',entity.id);if(old?.snapshotId===s.id)return{entityId:entity.id,planId:old.planId,unchanged:true};
    const result=await investigate(this.engine,s,a=>this.store.immutable('assessment',s.id,{snapshotId:s.id,initial:a,committedAt:now()}));
    const {canonical,unresolved}=result;const planId=planRevision(s.id,canonical);const actions:RepairAction[]=[];
    if(!unresolved.length){const patch:Record<string,unknown>={};
      if(entity.kind==='launch'){Object.assign(patch,moveEvent(s.calendar,canonical.launchDate,this.config().preferences.timezone));
        if(s.jira&&!equal(s.jira.releaseDate,canonical.launchDate))actions.push({id:hash([planId,'jira']),provider:'jira',target:entity.jiraVersionId!,before:{releaseDate:s.jira.releaseDate??null},patch:{releaseDate:canonical.launchDate},description:'Correct Jira release date'});
      }else{Object.assign(patch,moveEvent(s.calendar,canonical.start,this.config().preferences.timezone));patch.location=canonical.location;}
      for(const key of Object.keys(patch))if(patchMatches(s.calendar,{[key]:patch[key]}))delete patch[key];
      if(Object.keys(patch).length)actions.unshift({id:hash([planId,'calendar']),provider:'calendar',target:entity.eventId,before:pick(s.calendar,Object.keys(patch)),patch,etag:s.calendar.etag,description:'Correct Calendar event'});
    }
    const plan:RepairPlan={id:planId,entityId:entity.id,snapshotId:s.id,createdAt:now(),claims:result.claims,assessments:result.initial,followup:result.followup,actions,
      status:unresolved.length?'abstained':actions.length?'review':'unchanged',explanation:unresolved.length?'The available authorized evidence does not establish every required fact. Clarification is needed.':actions.length?'The configured decision owner approved this fact. Later suggestions do not supersede it. Review the exact changes below.':'The selected records already match the supported decision.',unresolved,canonical,mode:this.providers.mode};
    this.store.transaction(()=>{this.store.immutable('plan',plan.id,plan);this.store.put('current',entity.id,{snapshotId:s.id,planId:plan.id});this.store.put('scanError',entity.id,{entityId:entity.id,at:now()});
      this.store.log('investigated',{entityId:entity.id,planId:plan.id,status:plan.status});
      this.saveEvent(s,plan.unresolved.length?plan.unresolved:actions.some(a=>a.provider==='calendar')?Object.keys(canonical):[],plan.id);
    });return{entityId:entity.id,planId:plan.id,status:plan.status};
  }
  saveEvent(s:Snapshot,unresolved:string[],planId?:string){const occurrence=occurrenceKey(s.entity.calendarId,s.calendar);const revision=hash([s.calendar,unresolved,s.defaults]);const old=this.store.get<EventRevision>('event',s.entity.id);
    const event:EventRevision={id:s.entity.id,entityId:s.entity.id,occurrenceKey:occurrence,revision,calendarId:s.entity.calendarId,event:s.calendar,unresolved,verifiedAt:now(),planId,defaults:s.defaults,issue:s.issue,clientMeeting:s.entity.clientMeeting};
    this.store.put('event',event.id,event);this.store.immutable('eventRevision',revision,event);
    if(old?.revision!==revision||hash(old?.issue)!==hash(s.issue))this.store.enqueue('dependency',hash([event.id,revision,s.issue]),{eventId:event.id});
  }
  async refreshOtherEvents(){const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+30*86400000).toISOString();for(const calendarId of new Set([...this.config().calendarIds,...this.config().entities.map(e=>e.calendarId)])){
    try{const [events,defaults]=await Promise.all([this.providers.calendarList(calendarId,from,to),this.providers.calendarDefaults(calendarId)]);for(const event of events){if(this.config().entities.some(e=>e.calendarId===calendarId&&e.eventId===event.id))continue;
      const key=occurrenceKey(calendarId,event);const old=this.store.get<EventRevision>('event',key);const revision=hash([event,defaults]);const row:EventRevision={id:key,entityId:key,occurrenceKey:key,revision,calendarId,event,unresolved:[],verifiedAt:now(),defaults,clientMeeting:false};
      this.store.put('event',key,row);if(old?.revision!==revision)this.store.enqueue('dependency',hash([key,revision]),{eventId:key});}
    }catch(error){this.store.log('calendar_scan_incomplete',{calendarId,error:safeError(error)});}}
  }
  approve(planId:string,actor:string,decision:Approval['decision']='approved'){
    const p=this.plan(planId);assert(actor==='operator'||this.config().approverSlackIds.includes(actor),'This user cannot approve repairs.');
    assert(this.store.get('current',p.entityId)?.planId===p.id,'This repair was superseded. Review the current revision.');
    assert(p.status==='review'&&p.actions.length>0,'There is no supported repair to approve.');
    const existing=this.store.get<Approval>('approval',planId);if(existing){assert(existing.decision===decision,'This revision already has a different decision. Scan again to prepare a new review.');return existing;}
    const approval:Approval={id:id(),planId,actor,decision,at:now()};this.store.transaction(()=>{this.store.immutable('approval',planId,approval);this.store.log('approval',approval);if(decision==='approved'){this.store.put('run',planId,{planId,state:'approved'});this.store.enqueue('repair',planId,{planId});}});return approval;
  }
  async sourceUnchanged(p:RepairPlan){const snapshot=this.store.get<Snapshot>('snapshot',p.snapshotId)!;const fresh=await this.providers.snapshot(this.entity(p.entityId));assert(fresh.complete&&sourceDigest(snapshot)===sourceDigest(fresh),'Decision evidence changed. Scan and review a new revision.');return fresh;}
  authorized(p:RepairPlan){assert(this.store.get<Approval>('approval',p.id)?.decision==='approved','A matching human approval is required.');assert(this.store.get('current',p.entityId)?.planId===p.id,'Repair revision was superseded.');}
  async execute(planId:string){const p=this.plan(planId);this.authorized(p);const entity=this.entity(p.entityId);this.store.put('run',planId,{planId,state:'executing'});
    try{for(const action of p.actions){this.authorized(p);const fresh=await this.sourceUnchanged(p);await this.executeAction(p,action,fresh);}
      const final=await this.sourceUnchanged(p);assert(p.actions.every(a=>patchMatches(a.provider==='calendar'?final.calendar:final.jira!,a.patch)),'Final verification found provider drift.');
      this.store.transaction(()=>{this.saveEvent(final,[],p.id);this.store.put('run',planId,{planId,state:'verified',verifiedAt:now(),observations:{calendar:final.calendar,jira:final.jira},approval:this.store.get('approval',planId)});this.store.log('verified',{planId,entityId:entity.id,mode:this.providers.mode});});
    }catch(error){const effects=p.actions.map(a=>this.store.effect(a.id));const state=effects.some(e=>e?.state==='verified')?'partial':effects.some(e=>e?.state==='uncertain')?'uncertain':'failed';
      this.store.put('run',planId,{planId,state,error:safeError(error),at:now()});
      // A verified Calendar effect is its own outcome, even if a later Jira write fails.
      if(p.actions.some(a=>a.provider==='calendar'&&this.store.effect(a.id)?.state==='verified'))try{const latest=await this.sourceUnchanged(p);const a=p.actions.find(a=>a.provider==='calendar')!;if(patchMatches(latest.calendar,a.patch))this.store.transaction(()=>this.saveEvent(latest,[],p.id));}catch{}
      this.store.log('repair_incomplete',{planId,state,error:safeError(error)});throw error;
    }
  }
  async executeAction(p:RepairPlan,a:RepairAction,fresh:Snapshot){const actual=a.provider==='calendar'?fresh.calendar:fresh.jira!;
    let effect=this.store.effect(a.id);if(!effect){effect={id:a.id,kind:'repair',state:'prepared',request:{planId:p.id,action:a},observations:[],attempts:0,updatedAt:now()};this.store.putEffect(effect);}
    assert(equal(effect.request.action,a),'Stored action does not match the approved revision.');
    effect.observations.push({at:now(),phase:'preflight',value:actual});
    if(patchMatches(actual,a.patch)){effect.state='verified';effect.reference={recovered:effect.attempts>0,alreadyPresent:effect.attempts===0};this.store.putEffect(effect);return;}
    assert(effect.state!=='verified','A previously verified target changed. A new approval is required.');
    assert(patchMatches(actual,a.before),'The target changed since review. Scan again before repair.');
    if(a.provider==='calendar')assert(actual.etag===a.etag,'Calendar ETag changed. Scan again before repair.');
    this.authorized(p);effect.state='sending';effect.attempts++;this.store.putEffect(effect);
    try{if(a.provider==='calendar')await this.providers.calendarPatch(fresh.entity.calendarId,a.target,a.patch,a.etag!);else await this.providers.jiraPatch(a.target,a.patch);
      const observed=a.provider==='calendar'?await this.providers.calendarGet(fresh.entity.calendarId,a.target):await this.providers.jiraGet(a.target);effect.observations.push({at:now(),phase:'readback',value:observed});assert(patchMatches(observed,a.patch),'Provider did not retain the approved result.');effect.state='verified';effect.error=undefined;this.store.putEffect(effect);
    }catch(error){effect.state=error instanceof ProviderError&&!error.uncertain?'failed':'uncertain';effect.error=safeError(error);this.store.putEffect(effect);throw error;}
  }
  resume(planId:string){const p=this.plan(planId);this.authorized(p);assert(this.store.get('run',planId)?.state!=='verified','Already verified.');return this.store.enqueue('repair',`${planId}:resume:${id()}`,{planId});}
  overview(){return{mode:this.providers.mode,config:this.config(),events:this.events(),plans:this.store.all<RepairPlan>('plan').filter(p=>this.store.get('current',p.entityId)?.planId===p.id),runs:this.store.all('run'),approvals:this.store.all('approval'),scanErrors:this.store.all('scanError'),lastScan:this.store.get('meta','lastScan'),jobs:this.store.jobs(),inbox:this.store.all('inbox'),reminders:this.store.all('reminder'),drafts:this.store.all('draft'),effects:this.store.effects()};}
}

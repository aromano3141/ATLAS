import { z } from 'zod';

export const Provider = z.enum(['slack','calendar','jira']);
export const Preferences = z.object({
  timezone:z.string().default('America/Chicago'), morningHour:z.number().int().min(0).max(23).default(9),
  afternoonHour:z.number().int().min(0).max(23).default(15), arrivalBuffer:z.number().int().min(0).max(120).default(10),
  prepMinutes:z.number().int().min(5).max(240).default(30), maintainRelative:z.boolean().default(true),
  autoDeparture:z.boolean().default(false), defaultChannel:z.enum(['calendar','slack','app']).default('calendar'),
  scanPaused:z.boolean().default(false),
});
export const Entity = z.object({id:z.string().min(1),title:z.string().min(1),kind:z.enum(['launch','meeting']),
  calendarId:z.string().min(1),eventId:z.string().min(1),slackChannelId:z.string().min(1),threadTs:z.string().optional(),
  authorityUserIds:z.array(z.string()).min(1),jiraVersionId:z.string().optional(),jiraProjectId:z.string().optional(),
  issueKey:z.string().optional(),clientMeeting:z.boolean().default(false),
});
export const Place = z.object({label:z.string().min(1),placeId:z.string().optional(),address:z.string().optional(),
  lat:z.number().min(-90).max(90).optional(),lng:z.number().min(-180).max(180).optional(),confirmed:z.literal(true)}).refine(p=>!!p.placeId||!!p.address||(p.lat!==undefined&&p.lng!==undefined),'Choose an address, place ID, or coordinates.');
export const Config = z.object({
  operatorSlackId:z.string().default(''),approverSlackIds:z.array(z.string()).default([]),
  entities:z.array(Entity).default([]),calendarIds:z.array(z.string()).default([]),slackChannelIds:z.array(z.string()).default([]),
  jiraBaseUrl:z.string().default(''),jiraEmail:z.string().default(''),jiraDatetimeField:z.string().default(''),
  places:z.record(Place).default({}),savedOrigin:Place.optional(),
  attendeeMappings:z.array(z.object({email:z.string().email(),slackId:z.string(),verified:z.boolean()})).default([]),
  sharingRules:z.array(z.object({entityId:z.string(),audience:z.string(),allowJira:z.boolean().default(false)})).default([]),
  preferences:Preferences.default({}),policyUrl:z.string().default(''),model:z.string().default('gpt-5.6-sol'),
  maxMapsRequestsPerDay:z.number().int().min(1).max(10000).default(100),
});
export type ConfigT=z.infer<typeof Config>; export type EntityT=z.infer<typeof Entity>; export type PlaceT=z.infer<typeof Place>;
export type PreferencesT=z.infer<typeof Preferences>;
export const Evidence=z.object({id:z.string(),source:Provider,entityId:z.string(),authorId:z.string(),at:z.string(),retrievedAt:z.string(),
  text:z.string(),url:z.string(),channelId:z.string().optional(),threadTs:z.string().optional(),private:z.boolean().default(true)});
export type EvidenceT=z.infer<typeof Evidence>;
export const Claim=z.object({evidenceId:z.string(),entityId:z.string(),field:z.enum(['launchDate','start','location']),value:z.string(),
  statement:z.enum(['approved','proposal','historical','uncertain']),quote:z.string(),validAt:z.string().nullable()});
export type ClaimT=z.infer<typeof Claim>;
export const Assessment=z.object({role:z.enum(['temporal','authority','skeptic']),supported:z.array(z.string()),
  concerns:z.array(z.string()),explanation:z.string(),confidence:z.number().min(0).max(1),needsFollowup:z.boolean()});
export type AssessmentT=z.infer<typeof Assessment>;
export interface CalendarEvent { id:string; etag:string; summary?:string; description?:string; status?:string; location?:string;
  start:{date?:string;dateTime?:string;timeZone?:string}; end:{date?:string;dateTime?:string;timeZone?:string};
  recurringEventId?:string;originalStartTime?:{date?:string;dateTime?:string};recurrence?:string[];
  attendees?:{email:string;self?:boolean;responseStatus?:string}[];hangoutLink?:string;conferenceData?:unknown;
  reminders?:{useDefault:boolean;overrides?:{method:string;minutes:number}[]};updated?:string;[key:string]:unknown; }
export interface Snapshot {id:string;entity:EntityT;evidence:EvidenceT[];calendar:CalendarEvent;jira?:Record<string,unknown>;
  issue?:Record<string,any>;retrievedAt:string;complete:boolean;warnings:string[];defaults:{method:string;minutes:number}[];}
export interface RepairAction {id:string;provider:'calendar'|'jira';target:string;before:Record<string,unknown>;
  patch:Record<string,unknown>;etag?:string;description:string;}
export interface RepairPlan {id:string;entityId:string;snapshotId:string;createdAt:string;claims:ClaimT[];assessments:AssessmentT[];
  followup:AssessmentT[];actions:RepairAction[];status:'review'|'abstained'|'unchanged';explanation:string;unresolved:string[];
  canonical:Record<string,string>;mode:'fixture'|'live';}
export interface Approval {id:string;planId:string;actor:string;at:string;decision:'approved'|'rejected'|'unresolved';}
export interface EventRevision {id:string;entityId:string;occurrenceKey:string;revision:string;calendarId:string;event:CalendarEvent;
  unresolved:string[];verifiedAt:string;planId?:string;defaults:{method:string;minutes:number}[];issue?:Record<string,any>;clientMeeting:boolean;}
export const ReminderInput=z.object({eventId:z.string(),purpose:z.enum(['meeting','preparation','departure']),
  rule:z.enum(['relative','absolute','departure']),minutes:z.number().int().min(0).max(40320).default(30),
  at:z.string().optional(),channel:z.enum(['calendar','slack','app']),tripId:z.string().optional()});
export type ReminderInputT=z.infer<typeof ReminderInput>;
export interface Reminder extends ReminderInputT {id:string;owner:string;revision:string;eventRevision:string;triggerAt:string;
  state:string;providerId?:string;providerChannel?:string;lastError?:string;approvedAt:string;calendarMinutes?:number;}
export const Audience=z.object({kind:z.enum(['slack','jira','manual']),target:z.string().min(1),threadTs:z.string().optional(),
  visibility:z.object({type:z.enum(['group','role']),value:z.string()}).optional()});
export type AudienceT=z.infer<typeof Audience>;
export interface MessageDraft {id:string;revision:string;entityId:string;eventRevision:string;planId?:string;category:'clarification'|'update'|'consequence';
  audience:AudienceT;text:string;facts:string[];evidenceIds:string[];state:string;createdAt:string;receipt?:unknown;}
export interface TripQuote {id:string;eventId:string;eventRevision:string;origin:PlaceT;destination:PlaceT;stop?:PlaceT;category?:string;
  dwellMinutes:number;bufferMinutes:number;driveSeconds:number;addedSeconds:number;departureAt:string;arrivalAt:string;calculatedAt:string;
  trafficAvailable:boolean;warnings:string[];fits:boolean;mode:'fixture'|'live';mapsUrl:string;availability?:unknown;}
export const TripInput=z.object({eventId:z.string(),origin:Place,destination:Place.optional(),stop:z.enum(['gas','coffee','pharmacy','ev']).optional(),
  dwellMinutes:z.number().int().min(0).max(240).optional(),bufferMinutes:z.number().int().min(0).max(120).optional(),
  maxAddedMinutes:z.number().int().min(0).max(240).default(30),connector:z.string().optional()});
export const Intent=z.object({kind:z.enum(['reminder','trip','preparation','message','unknown']),selection:z.enum(['next','today','explicit']),
  eventQuery:z.string().nullable(),clientOnly:z.boolean(),minutes:z.number().int().min(0).max(40320).nullable(),
  absoluteTime:z.string().nullable(),day:z.enum(['today','tomorrow','unspecified']),period:z.enum(['morning','afternoon','unspecified']),
  channel:z.enum(['calendar','slack','app']).nullable(),stop:z.enum(['gas','coffee','pharmacy','ev']).nullable(),
  maxAddedMinutes:z.number().nullable(),needsClarification:z.string().nullable()});
export type IntentT=z.infer<typeof Intent>;

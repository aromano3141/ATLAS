# Reality Sync setup

The application runs on your computer. The public site contains Terms and Privacy
documents only. Keep ATLAS private and use dedicated demo resources.

## Start locally

Install Node 24 or later. In the repository root:

```powershell
npm install
npm --prefix web run install:ci
npm run setup
npm run dev
```

Open http://localhost:5173. The API listens only on 127.0.0.1:4318; the UI proxies
same-origin API requests. The local session has an HttpOnly SameSite cookie and
CSRF token. This is a single-operator localhost app, not a hosted multi-user server.
Do not expose either port to the internet.

`npm run setup` prints the actual data folder. It defaults to
`%LOCALAPPDATA%\RealitySync` (the Codex desktop runtime may redirect LOCALAPPDATA
under its package directory). Connections also shows the exact folder. Both SQLite
databases and secrets stay there, outside OneDrive. The fixture database is separate
from the live database. `REALITY_SYNC_DATA_DIR` can select another local folder.

Edit `secrets.env` there in a local editor. Add only credentials you created for
this application; don't extract credentials from Codex connectors or paste them in
chat. Restart the backend after changing secrets or Slack Socket Mode settings.

```dotenv
OPENAI_API_KEY=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_USER_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
JIRA_API_TOKEN=
GOOGLE_MAPS_API_KEY=
```

Use Connections to save resource bindings. `config.example.json` documents the full
shape; replace every REPLACE value before saving it. This file contains no secrets.
Authority and sharing boundaries are explicit operator configuration. Do not grant
authority based on text inside a Slack message or a user's display name.

## Slack

1. Create a Slack app in your dedicated workspace using `slack-manifest.json`.
2. Install it and store the bot OAuth token in `SLACK_BOT_TOKEN`.
3. Create an app-level token with `connections:write`; store it in `SLACK_APP_TOKEN`.
   Socket Mode needs no public application URL. Enable the manifest's interactivity
   and message subscriptions.
4. Invite the app to the selected demo channel. Set `slackChannelIds` and each
   entity's exact `slackChannelId` and thread timestamp.
5. Channel thread reads can require a user token with channel/group history access.
   Store the dedicated operator's token in `SLACK_USER_TOKEN`. Inaccessible replies
   fail the scan rather than disappearing from evidence. The app does not write
   using this token.
6. Configure `operatorSlackId`, `approverSlackIds`, and each entity's
   `authorityUserIds`. Use real Slack member IDs, not display names.
7. The human decision owner posts the demo approval text. Do not have the app
   impersonate an authority account by posting that message for them.

Remove private-channel scopes if your selected channel is public and you don't
need private evidence. `users:read.email` is used only for verifying attendee
mappings. A saved mapping alone isn't evidence that two identities match; sends
recheck Slack's user profile. Personal schedules use a DM to the configured
operator. Shared messages and comments always pass review.

The Connections sharing rules separately authorize redistribution of Jira facts.
For a Jira comment target use an audience such as `jira:DEMO-42` with `allowJira:true`.
Preserve restrictive source comment visibility when posting to an issue. A rule
such as `audience:C0123456` authorizes the chosen entity's facts in that exact
channel; configure it deliberately.

Prepare a Slack review from the repair panel, then review/send its draft from
Adapt → Messages. The resulting private control message offers evidence review
and repair approval. Message drafts can similarly prepare Slack editing/sending
controls. All callbacks validate the Slack actor and current revision. A reply to
a clarification is new evidence and does not authorize a write.

References: [Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/),
[scheduling](https://docs.slack.dev/reference/methods/chat.scheduleMessage),
[cancellation](https://docs.slack.dev/reference/methods/chat.deleteScheduledMessage/).

## Google Calendar OAuth

1. Create a Google Cloud project, enable the Google Calendar API, and configure the
   OAuth consent screen for your dedicated test user.
2. Create a Desktop OAuth client. Use Google's OAuth tooling or an authorized local
   OAuth flow to obtain a refresh token with offline access for that user. Store
   the client ID, client secret, and refresh token only in `secrets.env`.
3. Request `https://www.googleapis.com/auth/calendar.events`,
   `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, and
   `https://www.googleapis.com/auth/calendar.freebusy`. If using a broader Calendar
   scope during setup, restrict it when no longer needed. Consent-screen testing
   policies may limit token lifetime; reauthorize if the provider requires it.
4. Create a dedicated calendar yourself and include its exact calendar ID in
   `calendarIds`. Create the selected demo events and record their API event IDs.
   Use Google's API Explorer to list them if the UI's link uses a different ID.
5. Launch scenario: one non-recurring all-day event. Meeting scenario: one timed
   event, real office location, 30-minute popup reminder, no outside attendees.

The app expands occurrences when scanning the calendar. A series master is never
patched as though it were one occurrence. To reconcile a recurring meeting,
configure the instance event ID; originalStartTime preserves the occurrence key.
The demo does not send Calendar attendee email updates (`sendUpdates=none`).
Conference and unrelated fields survive targeted patches. Conditional Calendar
updates fail when the ETag changes, including reminder-only edits.

Native Calendar offsets are preserved. Absolute and departure reminders use Slack
or the app inbox because Calendar offsets follow event time. A preparation block
is a separate personal Calendar event with a stable application ID and a busy check.

References: [OAuth desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app),
[Calendar scopes](https://developers.google.com/workspace/calendar/api/auth),
[reminders](https://developers.google.com/workspace/calendar/api/concepts/reminders).

## Jira Cloud

1. Use a dedicated Jira Cloud project on your `tenant.atlassian.net` site.
2. Create an API token for the demo operator. Set `jiraBaseUrl`, `jiraEmail`, and
   `JIRA_API_TOKEN`. The prototype uses basic authentication against the tenant API;
   use a token compatible with that endpoint, not a scoped gateway token requiring
   a different URL layout.
3. Create a release version with the stale demo release date. Configure both its
   numeric version ID and project ID. Version editing requires project permission.
4. Create an in-progress presentation issue. Add its key to the meeting entity.
   Browse project/issue and Add Comments permissions are needed for comments.
5. A date-only `duedate` is not a 2 PM cutoff. Put any time-specific preparation
   requirement in the issue description, or configure a genuine datetime field in
   `jiraDatetimeField`. The UI preserves and displays the sourced task context.

Only releaseDate is writable by reconciliation. The app never changes preparation
issue status or due date because a meeting moved. Jira's immediate preflight and
readback do not provide an atomic cross-system transaction or compare-and-swap.

## OpenAI

Create a project API key and configure provider budget/rate limits. The default
model is `gpt-5.6-sol`; change `model` in Connections only to a model your project
can access that supports Responses Structured Outputs. The app does not silently
fall back to fixtures or another model. It records usage and latency, not secrets.
Relevant evidence goes to the API for extraction and independent assessments;
review your organizational policy before connecting real workspace data.

Reference: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Google Maps

Enable Routes API and Places API (New) in a billed Google Cloud project. Restrict
the server-side API key to these APIs and, where possible, the machine's egress IP.
Set provider quotas/budgets and the app's `maxMapsRequestsPerDay` (default 100).
One trip can make several requests because candidates and future departures are
compared. The local counter is request count, not a billing-price estimate.

Set `policyUrl` to the published policy site listed in `docs/VALIDATION.md`.
Configure actual confirmed addresses/place IDs for office names in `places`.
Manual origins or permitted geolocation are supported; permission denial leaves
address entry available. Ambiguous place searches require a specific selection.

Navigation supports driving and one stop. For EV, supply connector and planned
duration; unavailable connector data can yield no suitable stop. Stop hours are
current/unknown, not a guarantee for a future visit. Do not use fixture route times
for travel. Quotes expire in five minutes; provider data stays transient. Accepted
trips keep permitted IDs and user decisions for bounded departure refresh.

References: [Routes billing](https://developers.google.com/maps/documentation/routes/usage-and-billing),
[Places policies](https://developers.google.com/maps/documentation/places/web-service/policies),
[driving departure behavior](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes).

## Verification and recovery

```powershell
npm run check
npm test
npm run build
npm run demo:recovery
npm run live:check
```

`live:check` is read-only and returns a nonzero exit status until configured. Its report stays in the
local data folder. It is not a substitute for approved write/readback acceptance.
`demo:recovery` explicitly uses a synthetic fixture database and demonstrates a
successful Calendar write followed by timeout and reopen, without a repeated write.

After an uncertain live repair, use Reread and resume approved repair. For an
uncertain send, use Check message presence. If presence cannot be established,
the app will not resend. If source/target/configuration changed, scan and review a
new revision. Calendar success remains visible when a later Jira operation fails.
Slack schedules inside the 60-second cutoff may still fire and cannot be reported
as successfully replaced. When the backend was off, missed local reminders become
an inbox summary. Provider schedules may still have executed independently.

Do not delete the database to clear an uncertain operation. First inspect the
provider and resolve remaining schedules. Repeatedly pressing Send or rebuilding
an action does not establish whether an earlier request took effect.

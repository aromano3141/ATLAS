# Demonstrations

## Explore without accounts

Start `npm run dev`, open http://localhost:5173, choose **Fixture workspace**, and
run **Scan now**. This workspace never calls external services or OpenAI. It stores
synthetic provider state in a separate fixture database.

1. Select Atlas launch. Read the approved Oct 8 decision and later Oct 15 proposal.
   Inspect all three initial Blackboard assessments.
2. Review the Calendar and Jira date patches, approve, and open Receipt to inspect
   preflight/readback observations and exact attempt counts.
3. Select the North Office client meeting. Approve its time/location correction.
4. In Adapt, select that meeting. The native 30-minute reminder now corresponds to
   2:30 PM America/Chicago on the future fixture day. Jira remains In Progress.
5. Preview and approve a prep reminder or free-slot preparation block.
6. Draft an update to demo-team, save an edit, review/send, and inspect presence.
7. Run `npm run demo:recovery` to demonstrate journal recovery across a database
   reopen with one Calendar mutation and only the remaining Jira write afterward.

The fixture grammar is deliberately deterministic and is not the live AI engine.
Tests and fixture timing are never presented as proof of live acceptance.

## Original live launch repair

Complete SETUP.md. Use dedicated selected resources without outside attendees.
Choose future dates if the example dates have passed. The configured human decision
owner posts this in the selected Slack thread:

> Atlas launch is approved for October 8, 2026. This is the final launch-date decision.

A different person subsequently posts:

> Proposal: could we move Atlas launch to October 15, 2026? This is only a suggestion.

Set the selected all-day Calendar event and Jira release version to September 30.
Scan live connections, review original evidence and independent assessments, then
approve the exact two patches. Inspect the receipt and both provider UIs/API reads.
Calendar/Jira original descriptions and unrelated fields must remain unchanged.

For a live successful-write timeout demonstration, add these temporary settings to
the local secrets.env, only with dedicated selected demo resources:

```dotenv
REALITY_SYNC_ALLOW_LIVE_TEST_HOOK=1
REALITY_SYNC_DEMO_TIMEOUT_AFTER_WRITE=calendar
```

Restart, scan, and approve the immutable repair. The hook throws once after the
Calendar write returns, before its readback. The journal records uncertainty.
Restart and resume by rereading. Remove both test settings after the demonstration.
The app must recognize the already-applied result without repeating it. Do not
claim the synthetic recovery command is the live recovery acceptance result.

## Unified live meeting

On a future day, create a timed Calendar event at 2 PM in a confirmed Downtown
Office address, with a 30-minute popup reminder. Explicitly link an in-progress
Jira presentation issue. The approved location is read directly from Slack.

The configured owner posts in the selected meeting thread:

> Client meeting is confirmed for [full future date] at 3 PM America/Chicago at
> North Office. This replaces the 2 PM Downtown Office plan.

1. Scan, inspect independent findings, review/approve the time and location patch.
2. Reread Calendar: 3 PM at North Office; original duration/conference details
   retained. The existing 30-minute offset now triggers at 2:30 PM.
3. Offer an explicitly approved 1 PM prep reminder on that future day. Preserve
   the Jira issue's deadline and status. Use a fixed timestamp with timezone.
4. Prepare a factual Slack update. Review the exact audience/text, edit if wanted,
   approve sending, and reread the destination to verify message presence.
5. Change a relevant fact. Confirm the old draft becomes stale and requires
   a new review before it can be sent.

Record provider reminder configuration, message
presence, and any uncertainty. Device delivery and readership are not
guaranteed. Actual account configuration and these live runs are still required
before marking the full release's live acceptance complete.

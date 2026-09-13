# Validation record

Updated September 13, 2026, on Windows with Node 24.19.0. Navigation and Maps have
been removed from the application, configuration, API, preferences, and reminders.

## Live read-only launch diagnosis

The running application's selected channel and string-valued thread timestamp
matched the operator's configuration. Reproducing the existing request showed
`conversations.info` sent as a JSON POST; Slack returned `invalid_arguments` with
`missing required field: channel`. Sending the same parameters as GET query
arguments succeeded. The fix uses GET for Slack reads, preserves timestamp strings
and pagination cursors, and retains JSON POST for approved writes. Error messages
now identify the failing Slack API method.

The configured live launch scan passed at 2026-09-13T21:58:50Z:

- One original Slack evidence item; all three independent assessments completed.
- No unresolved facts or proposed changes: the selected Calendar event and Jira
  version already matched the supported decision.
- Independent rereads confirmed Calendar and Jira were unchanged.
- Zero approved actions, provider writes, or messages sent.

The app was restarted with the corrected adapter against its original data folder.
Its launch scan now reports `unchanged`, without the Slack error. The running and
saved configuration match. No Maps settings or credentials appear in app state,
removed endpoints return 404, and no navigation service can be invoked.

Windows application virtualization exposed a different copy of LOCALAPPDATA to the
shell. The original folder was addressed through its local Windows share for this
session; its database and resource bindings were preserved. The diagnostic command
compares disk configuration with the running app and refuses a mismatch rather than
silently using another installation's data.

`npm run scan:read-only -- --entity YOUR_ENTITY_ID` uses the running app's actual
configuration and an isolated in-memory journal. Its provider adapter rejects
writes, never runs a worker, and saves only the diagnostic report in the local
application data folder. Real resource identifiers and evidence stay outside Git.

## Automated checks

- TypeScript checks for backend and frontend pass.
- All 41 deterministic fixture and mocked contract tests pass. Tests cover Slack
  GET parameter encoding, POST preservation, timestamp precision, pagination,
  removed endpoints and settings, and unsupported intents.
- The Vinext production build and local HTTP smoke test pass.
- The fixture recovery demonstration uses two separate processes: one Calendar
  mutation followed by timeout, then a reread and only the remaining Jira mutation.

The retained suite covers authority/proposals, explicit supersession, confidence,
independent assessments, timezones/DST, recurrence, canceled/declined/virtual events,
concurrency, partial results, unrelated-field preservation, reminder ownership,
provider schedule recovery, cutoff handling, preparation availability, sharing
boundaries, clarification replies, stale drafts, and uncertain sends.

Fixture results do not establish real notification delivery or message readership.
Browser layout and optional WebMCP tools have not been exercised by browser
automation in this task.

## Remaining live acceptance

Follow [SETUP.md](SETUP.md) and [DEMO.md](DEMO.md). Approved live Calendar/Jira
repairs, a successful-write timeout recovery, the meeting reminder/preparation
workflow, reviewed Slack/Jira sending, and actual Socket Mode interactions remain
to be demonstrated. This diagnostic did not authorize any of those writes.

Keep reconciliation, reminder, and communication outcomes separate. Verify
notification settings and message presence; do not promise device alerts or reading.

The application and ATLAS repository remain private/local. The separate static
policy documents contain no application code, credentials, or evidence. Their
last public deployment is recorded in `policies/DEPLOYMENT.json`.

Policy sources have been updated for the scope removal. The previously published
policy site was left unchanged during this provider read-only task.

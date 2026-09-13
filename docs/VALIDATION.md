# Validation record

Verified on September 13, 2026, on Windows with Node 24.19.0. The application and
setup guide are ready for account configuration. The release's live acceptance
remains pending, as requested when dedicated provider accounts were not ready.

## Automated and local checks

| Check                   | Result              | What it establishes                                                                                                         |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`         | Passed              | Backend and frontend TypeScript checks                                                                                      |
| `npm test`              | 41 passed, 0 failed | Deterministic stateful fixtures and mocked provider contracts                                                               |
| `npm run build`         | Passed              | Vinext production build, including client, server, and SSR output                                                           |
| `npm run demo:recovery` | Passed              | Two separate fixture processes; one successful Calendar mutation, timeout, then reread and only the remaining Jira mutation |
| `npm run test:http`     | Passed              | Running UI-to-API proxy, local cookie/CSRF, fixture meeting approval/readback, and separation from live state               |
| Local application HTTP  | 200                 | The running localhost application responds                                                                                  |
| `npm run live:check`    | Not configured      | All five provider credential groups are absent; no live acceptance is claimed                                               |

The fixture suite covers approval versus newer proposals, explicit same-author
supersession, conflicting authority, low confidence, incomplete evidence, entity
ambiguity, independent assessment commits, timezones/DST, occurrence identity,
canceled/declined/virtual meetings, uncertain ordering, concurrent edits, partial
failure, and preservation of unrelated fields.

Adapt checks cover relative and absolute timing, default Calendar reminders,
managed offset replacement and shared ownership, schedule recovery after timeout,
Slack's cancellation cutoff, task completion, missed local notifications, prep-block
availability and deduplication, message audiences and visibility, recipient mapping,
stale drafts, clarification replies, partial-result wording, and uncertain sends.
Maps contracts cover routed legs, dwell, detours, future departures, traffic
fallback, closed/unknown stops, EV compatibility/unknown availability, ambiguous
destinations, missing origins, stale quotes, and unavailable services.

These are fixtures and mocked API responses. They are not real travel estimates,
provider deliveries, or evidence that the live model interprets the scenario
correctly. Browser geolocation permission handling is implemented; browser layout,
permission prompts, and the optional WebMCP tools have not been exercised in a
browser automation session.

## Public policy documents

Only the separate policy-document site was deployed:

- [Policy index](https://reality-sync-policies-atlas.zen-monk.chatgpt.site/)
- [Terms of Use](https://reality-sync-policies-atlas.zen-monk.chatgpt.site/terms.html)
- [Privacy Policy](https://reality-sync-policies-atlas.zen-monk.chatgpt.site/privacy.html)

Deployment status is succeeded, public access is enabled, and all three URLs
returned HTTP 200 without authentication. The isolated upload contains only four
static files and hosting metadata. It includes no application code, credentials,
databases, or user evidence. Source and deployment IDs are in `policies/`.
GitHub confirmed `aromano3141/ATLAS` is private.

## Live acceptance still required

Follow [SETUP.md](SETUP.md) and [DEMO.md](DEMO.md), then record actual provider
identifiers and receipts in the local data folder, never in this repository.

- Configure the dedicated Slack, Calendar, Jira, OpenAI, and Maps services and
  confirm read access, exact resource bindings, authority, and sharing rules.
- Pass the original launch repair using real approved Calendar/Jira writes and
  independent rereads. Preserve unrelated fields.
- Pass a real successful-write timeout and process-restart recovery, showing no
  repeated mutation.
- Pass the future meeting demonstration: time/location repair, preserved native
  reminder, explicit preparation reminder, unchanged Jira task, real routed gas
  stop comparison, approved departure reminder, Maps handoff, and a reviewed
  message whose presence is verified.
- Exercise Socket Mode with actual authorized and unauthorized users, clarification
  replies, provider permissions/rate limits, and provider schedule cancellation.

Record notification configuration rather than guaranteed device delivery; message
presence rather than readership; and route estimates with calculation timestamps
rather than guaranteed arrival. Keep reconciliation, reminder, trip, and message
outcomes separate when any part fails.

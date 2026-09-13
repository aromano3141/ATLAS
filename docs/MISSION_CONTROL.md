# Demo Mission Control

Start the existing local application, then choose **Demo Mission Control** in
the workspace sidebar. The route is `/mission-control` in the same application.
Configuration and the original workspace remain intact.

## Present in 2–3 minutes

1. Choose **Demo Replay**, leave **Presentation layout** enabled, and optionally
   enable presenter notes or full screen. Press **Play walkthrough**.
2. Show the September 30 baseline. The owner reply replaces it with October 2.
3. Temporal visibly orders the source events; Authority attaches the owner check;
   Skeptic examines the apparent contradiction. Initial conclusions stay sealed
   until all assessments commit. One follow-up resolves the illustrated concern.
4. Reconcile shows exact Calendar start/end and Jira releaseDate changes.
5. The story pauses. Press **Approve replay repair** to continue. Next/Play cannot
   cross this boundary. Approval is associated with the displayed revision.
6. Watch separate operation states and readback values. Both resources receive
   verified badges only when compared values match; Adapt explains reminder,
   preparation, and reviewed-message implications.

**Pause**, **Next step**, **Reset replay**, and **Replay story** control pacing.
Space toggles playback and Right Arrow advances when page focus is outside a
control or dialog. Switching the recovery option resets the story. Enable
**Recovery branch** to illustrate a Calendar write with a lost response. At the
recovery pause, choose **Simulate restart & reread**: Calendar is found already
correct, with one write attempt; only Jira needs its remaining write.

Replay operations and identities are simulated. The fixture contains no actual
resource IDs, tokens, or fetched private evidence. Replay never opens a backend
stream or sends a request to execute, approve, schedule, or message a provider.
The supplied scenario text is presentation material, not a claim that a reply exists.

## Live behavior

The main app also has a direct **Atlas Demo Launch / Date repair** card. Per the
operator's updated demo request, this card records October 2 as an explicit
operator instruction, reads Calendar/Jira, and shows a timing issue when they
do not match. **Change Calendar & Jira to October 2** is the approval/execution
button. Agent panels are UI-only for this path; it does not require a Slack
reply or model assessment. Its persisted override also applies to later scans
of this entity. It still uses the normal effect journal, preflights, partial
outcomes, recovery, and independent rereads. Other entities retain the original
evidence-based reconciliation flow described below.

Live queues a fresh, entity-specific read-only scan for configured `atlas-launch`.
It reads Slack, Calendar, and Jira before showing current source values. It checks
whether the requested October 2 reply actually appears in the bound Slack thread;
author matching is a separate check. The actual validated assessments and plans
determine outcomes. Missing evidence, model errors, abstention, unchanged records,
and incomplete execution remain visible. It never falls back to Replay.

The local backend emits durable lifecycle events. An authenticated SSE stream
delivers changed projections (800 ms checks) and heartbeats. Three initial model
contexts use the configured model and the same retrieved evidence; they do not
retrieve independently. Initial conclusions commit before any peer comparison.
If the snapshot is unchanged, prior assessments are explicitly labeled reused.

Technical details expose configured bindings, timestamps, original source links,
claims, initial/follow-up structured assessments, immutable plan and snapshot IDs,
approval, effect journal, observations, and comparison results. Credential presence
is separate from dated provider connection checks.

**Review live approval** opens the exact plan revision. Its final approval button
uses the existing authorization/execution service and causes real provider writes.
Do not press it during a read-only demo. Recovery likewise uses the existing
approved-revision service, preflights, and rereads. No message is sent by this screen;
shared messages still require audience policy checks and their own reviewed send.

Calendar all-day end dates are exclusive: start October 2, end October 3 is a
one-day milestone. The launch repair preserves unrelated event fields and Jira
release name/status. A native relative reminder follows the event; its effective
setting is distinct from device notification delivery. This launch has no assumed
preparation issue link. Navigation and Maps are excluded.

## Validation boundary

Replay is presentation evidence, not proof of live writes or recovery. Read-only
scans may invoke the configured model but do not approve a repair or enqueue
downstream reminder maintenance. See VALIDATION.md for actual checks and remaining
live acceptance. Keep all source evidence and configuration outside Git.

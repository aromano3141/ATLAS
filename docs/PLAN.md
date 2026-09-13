# Reality Sync: first-run implementation plan

## 1. Goal and scope

Deliver a working local prototype for a single internal launch-date reconciliation
across **Slack, Google Calendar, and Jira Cloud**:

**Detect -> Investigate -> Reconcile -> Approve -> Act -> Verify.**

Slack supplies evidence. Jira and Calendar contain operational records that the
application can update after approval. Completion requires actual external writes
and independent rereads; fixture playback does not satisfy live acceptance.

Use dedicated demo accounts and resources, the OpenAI API, and one local operator.
Keep temporal and authority-aware evidence, independent agent assessments,
human approval, durable recovery, and receipts in the first run.

Defer the business website, public listings, special/holiday hours, publication
workflows, additional integrations, and hosted deployment. Do not build their
routes, services, adapters, or sample dashboards in this phase. The optional
LatentMAS research path remains future work after this three-app flow passes;
it is not a dependency or a first-run completion requirement.

## 2. Runtime and interfaces

Use the Sites React/Vinext starter with TypeScript, Tailwind, and its accessible
components for the interface. Preserve the existing Git history and project
documentation when preparing the starter; do not initialize over existing files.
Add a local Node.js/Hono backend for APIs, model calls, connector operations,
and persistent jobs. Use the installed Node 24 runtime's SQLite support with
numbered migrations and prepared queries.

One development command starts the interface and backend. Bind them to localhost.
Store durable databases under a project-specific directory in LOCALAPPDATA,
outside the OneDrive checkout. Keep server credentials in ignored configuration.
Persist work independently of the browser so closing a tab does not lose a run.

Provide these views:

- Reality Health: real connection health, scan controls, conflicts, and verified
  reconciliation counts. Do not populate fictitious connected-system totals.
- Conflict detail: competing claims, supporting and opposing evidence, recommended
  fact or abstention, uncertainty, and exact before/after repair preview.
- Evidence Blackboard: initial committed assessments, agreed facts, unresolved
  questions, and targeted follow-up findings.
- History: approval, execution attempts, partial failures, rereads, and receipts.
- Connections: preflight checks, allowlisted resource IDs, authority assignments,
  and instructions for supplying credentials locally.

Use a compact slate-and-white interface, blue actions, amber uncertainty, and
green for verified outcomes. Center the interface on reviewing a conflict and
its proposed correction. Include loading, empty, disconnected, and error states.

Define validated TypeScript/Zod contracts for Evidence, Assessment, Decision,
RepairPlan, RepairAction, Approval, and VerificationObservation. Connector
interfaces expose capabilities, health checks, evidence reads, target rereads,
and narrowly typed updates. Keep reasoning behind a ReconciliationEngine
interface so later research modes do not change approval or execution behavior.

Expose same-origin APIs for connection checks, starting scans, reading conflicts
and evidence, approving/rejecting a specific plan revision, marking unresolved,
resuming eligible actions, and reading receipts. State-changing requests require
the local operator session and CSRF protection. Return durable run IDs for jobs.

## 3. Three real integrations

| Application | Read | Approved write |
| --- | --- | --- |
| Slack | Allowlisted channel messages, relevant replies, authors, timestamps, and permalinks | None |
| Jira Cloud | The selected project release version and release date | Update that version's releaseDate |
| Google Calendar | The selected demo event and its ETag | Update dates on the existing event |

Supply a read-only Slack app manifest and installation instructions, Jira token
instructions, Google OAuth setup instructions, and a connection checker. Use the
application's own API credentials, not credentials extracted from Codex tools.
Slack requires channel history/read and user-read permissions for the selected
demo channel. Verify thread access rather than silently omitting inaccessible
replies. Honor provider pagination and Retry-After responses.

Bind entities to exact Slack channel/user IDs, Jira project/version IDs, and
Calendar/calendar-event IDs during setup. A trusted authority registry assigns
specific people permission to establish the launch date. Display names and
statements inside source text cannot grant authority.

Supply copyable Slack messages for the operator to post. Setup utilities create
or reuse only the selected demo records, save their IDs, and avoid duplicate
resources. Use a dedicated calendar with no external attendees and a non-recurring
all-day launch event for the live demo. Other event forms that the adapter cannot
safely preserve must be marked unsupported instead of being edited approximately.

After configuration, run an initial scan and poll every five minutes while the
backend runs. Include Scan now and Pause. Persist scan cursors and source snapshots,
deduplicate unchanged evidence, and report incomplete coverage. Missing required
evidence blocks a repair recommendation rather than implying agreement.

## 4. Evidence and independent reasoning

Persist original source snapshots separately from extracted claims. Evidence
records retain entity, field, value, source reference and excerpt, actual author,
source and retrieval timestamps, valid interval, timezone, scope, statement type,
uncertainty, and provenance. Preserve superseded claims instead of overwriting
history. Compare contradictions only for matching entities, fields, and scopes.

Normalize dates deterministically where possible. Interpret relative dates using
the original source timestamp and configured timezone. Separate proposed changes,
approved decisions, current operational values, and historical facts. Neither
recency nor repeated agreement is sufficient to establish the canonical date.

Default engine:

1. Collect and freeze an evidence snapshot.
2. Extract candidate claims using OpenAI Structured Outputs; validate source
   references and excerpts against the stored originals.
3. Run temporal, authority, and skeptical assessments in separate request contexts.
   Give each access to relevant originals, but no peer conclusions.
4. Commit immutable structured initial assessments before revealing any of them
   to other agents. Record incomplete/failed assessments explicitly.
5. Reconcile the committed findings on the Evidence Blackboard.
6. If necessary, request additional evidence only for disputed facts; allow one
   bounded targeted follow-up round.
7. Return a grounded canonical fact and minimal repair, or explicit abstention.

Use configurable gpt-5.6-sol through the OpenAI Responses API as the default.
Keep model calls server-side with time/token limits and recorded usage. Surface
API errors and unavailable models instead of silently switching to fixtures.
Show concise evidence-based explanations, not hidden chain-of-thought transcripts.
Label confidence as model-reported; it never grants permission to act.

Temporal representation draws on [Zep](https://arxiv.org/abs/2501.13956), without
adopting an automatic newest-value invalidation rule. The shared contribution
model draws on the [Blackboard paper](https://arxiv.org/abs/2510.01285).
Independent initial commitments are an explicit product requirement. Distinct
perspectives using one model must not be advertised as proven model diversity.

## 5. Approval, execution, and recovery

Every external repair requires approval. Show the exact target, field, old value,
new value, scope, and evidence before approval. Bind approval to an immutable plan
revision, evidence snapshot, and target preconditions. Persist Reject and Mark
unresolved decisions. New relevant evidence or target drift requires a new review.

Application code enforces these rules at the connector boundary:

- Only allowlisted records and supported fields may change.
- Ambiguous entities, missing authority, unsupported operations, and insufficient
  evidence block execution, regardless of model confidence.
- Source content is evidence, never instructions that can change policy or access.
- Reasoning agents cannot call write tools directly.
- Customer commitments and other unsupported facts remain review-only.

Use a persistent job queue and effect journal with atomic job claims, leases,
stable action IDs, exact stored requests, and uniqueness constraints. Keep the
effect journal independent of reasoning checkpoints. Expose planned, approved,
executing, partially completed, pending, failed, and verified run states.

Before each write, reread the target and relevant decision evidence, recheck
policy/approval, compare preconditions, and persist the outgoing operation.
Use Calendar's If-Match/ETag conditional update. For Jira, compare immediately
before writing and reread afterward; record the limitation that this is not an
atomic remote compare-and-swap. Modify only the release date and the event's
date boundaries, preserving duration and unrelated fields.

After timeout or restart, inspect remote state before retrying. If the approved
result already exists, verify it without repeating the write. Retry only the same
stored authorized operation when preconditions still hold. If the outcome remains
unknown, keep it pending. Never regenerate a different action during recovery.

On partial failure, retain completed effects and stop. Resume only eligible
remaining actions after rereads; do not automatically roll back another service.
These boundaries adapt the principles of
[AgentSpec](https://arxiv.org/abs/2503.18666) and
[ACRFence](https://arxiv.org/abs/2603.20625).

The final receipt includes original snapshots, canonical fact, approver, exact
changes, attempts, timestamps, remote reread observations, unresolved items, and
final status. API success alone cannot mark a run verified. Verify both Jira and
Calendar, and reconfirm the supporting Slack evidence before closing the conflict.

Add only a small optional WebMCP surface for inspecting conflicts, starting scans,
opening repair reviews, and reading receipts. It must share application policy and
cannot bypass approval. Unsupported browser tooling must not block the core flow.

## 6. Acceptance and implementation order

### Live demo

Slack contains an approved October 8, 2026 launch decision followed by a newer
October 15 suggestion. Jira and Calendar still contain September 30.

Reality Sync must recommend October 8, explain why the suggestion does not
supersede approval, preview only the two necessary corrections, await approval,
update the existing Jira version and Calendar event, reread both services, and
produce a verified receipt.

Run a second pass with an injected timeout after a successful write. Restart the
backend and show that it reads the external state, recognizes the completed effect,
and finishes without a duplicate event or repeated correction.

### Automated verification

Use deterministic tests and stateful connector doubles for stale evidence, newer
unauthorized proposals, repeated stale claims, conflicting authorized decisions,
temporal scope, similar project names, incomplete evidence, invalid model output,
source prompt injection, rejected/stale/duplicate approvals, partial failure,
successful-write timeouts, process restart, and concurrent remote changes.

Assert both intended final state and preservation of unrelated fields. Report
live checks separately from fixture tests. Keep actual evidence and API credentials
out of committed test data. A small repeated-run harness should record correctness,
abstention, blocked unsafe actions, final state, token usage, latency, and failures;
broader multi-engine comparisons follow the first working run.

### Delivery checkpoints

1. Project setup, local persistence, connection instructions, and real reads from
   Slack, Calendar, and Jira.
2. Evidence normalization, conflict detection, independent Blackboard assessments,
   and the review interface.
3. Enforced approval, minimal real writes, and verification receipts.
4. Durable recovery and timeout-after-success demonstration.
5. Focused automated checks, actual live results, UI polish, and demo instructions.

Push each meaningful checkpoint to the private ATLAS repository after relevant
verification. The first run is complete only when the live launch-date scenario
and recovery demonstration pass. If account configuration blocks a live check,
state exactly what is missing rather than claiming a simulated run is live.

## 7. Repository workflow

Repository: <https://github.com/aromano3141/ATLAS> (private).

Use origin for this repository and track its main branch in this checkout. Keep
the user's initial commit and existing history. Make small coherent commits and
push them as work progresses, with a short explanation of each checkpoint.
Inspect staged changes before committing. Never force-push or overwrite remote
work; fetch and reconcile divergence first. Verify pushed commits against the
remote branch. Do not commit secrets, OAuth tokens, real source snapshots, local
databases, or generated dependency/build directories.

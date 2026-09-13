# Reality Sync · ATLAS

A local application that finds conflicting project facts across Slack, Google
Calendar, and Jira, proposes an evidence-supported repair, applies approved
changes, and verifies the result.

**Detect → Investigate → Reconcile → Approve → Act → Verify → Adapt**

## Run the prototype

For the presentation, open **Demo Mission Control** in the workspace sidebar,
or [open the walkthrough](http://localhost:5173/mission-control). **Demo Replay**
plays the complete launch story without credentials or provider activity. It
pauses for replay approval and includes an optional timeout/recovery branch.
**Live** reads the configured `atlas-launch` resources and streams real backend
events. See [Mission Control demo instructions](docs/MISSION_CONTROL.md).

Requires Node 24 or later.

```powershell
npm install
npm --prefix web run install:ci
npm run setup
npm run dev
```

Open [Reality Sync locally](http://localhost:5173). Choose **Fixture workspace**
and **Scan now** to explore without provider accounts. The fixture workspace uses
synthetic data in a separate database; it never calls the live integrations.

[Setup guide](docs/SETUP.md) · [Demo walkthrough](docs/DEMO.md) ·
[Validation record](docs/VALIDATION.md) · [Master plan](docs/PLAN.md)

## Implemented

- Reality Health, conflict review, original evidence, independent temporal,
  authority, and skeptical assessments, verification receipts, and history.
- Approved launch-date corrections in Calendar and Jira, meeting time/location
  corrections, targeted preflight checks, and durable recovery after uncertain
  writes. A newer proposal cannot silently replace an approved decision.
- An Adapt panel for occurrence-bound reminders, explicit Jira preparation links,
  availability-checked preparation blocks, and a durable in-app inbox.
- Calendar offset preservation and maintenance, personal scheduled Slack messages,
  cancellation cutoff handling, and provider schedule reconciliation on restart.
- Reviewed Slack messages and Jira comments, exact audience previews, disclosure
  checks, clarification replies as evidence, and revision-checked Socket Mode controls.
- Natural-language intent previews, connection/resource configuration, notification
  preferences, provider usage visibility, and configurable OpenAI Responses models.

The React/Vinext UI and Hono API run on localhost. SQLite journals, evidence, and
server-side secrets live outside OneDrive in the folder printed by `npm run setup`.
The browser never receives provider credentials. Runtime jobs continue when the
browser closes, while the backend remains running.

## Verification

```powershell
npm run check
npm test
npm run build
npm run demo:recovery
# With npm run dev already running:
npm run test:http
# Read-only; returns nonzero until provider configuration is ready:
npm run live:check
npm run scan:read-only -- --entity YOUR_ENTITY_ID
```

Automated checks use deterministic fixtures and mocked provider contracts. Actual
Slack, Calendar, Jira, and OpenAI passed a live read-only launch scan. Approved
provider writes, reminders, messaging, and live recovery acceptance remain pending.
The setup and demo guides describe the required approved live writes, recovery
demonstration, notification settings, and message readbacks.

## Publication and scope

Only the separate [Terms and Privacy site](https://reality-sync-policies-atlas.zen-monk.chatgpt.site)
is public. ATLAS is public by explicit user approval; neither the application service nor its evidence is
published. Policy sources and deployment metadata are in `policies/`.

Business websites, public listings, business-hours synchronization, native phone
alarms, CRM, and automatic customer messaging are deferred.
Navigation and Maps have been removed. Slack, Calendar, and Jira are the three
business applications.

Push verified checkpoints to the [ATLAS repository](https://github.com/aromano3141/ATLAS), which the user approved keeping public. Credentials and real evidence stay outside Git.
Keep tokens, local databases, real evidence, and generated output out of Git.

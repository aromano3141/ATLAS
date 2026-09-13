# Reality Sync · ATLAS

A local application that finds conflicting project facts across Slack, Google
Calendar, and Jira, proposes an evidence-supported repair, applies approved
changes, and verifies the result.

**Detect → Investigate → Reconcile → Approve → Act → Verify → Adapt**

## Run the prototype

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
- Driving estimates using Google Routes and Places, one optional stop, dwell and
  detour comparison, destination selection, departure reminders, and Maps handoff.
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
```

Automated checks use deterministic fixtures and mocked provider contracts. Actual
Slack, Calendar, Jira, OpenAI, and Maps acceptance is **pending account setup**.
The setup and demo guides describe the required approved live writes, recovery
demonstration, notification settings, message readbacks, and real route estimates.

## Publication and scope

Only the separate [Terms and Privacy site](https://reality-sync-policies-atlas.zen-monk.chatgpt.site)
is public. ATLAS remains private; neither the application nor its evidence is
published. Policy sources and deployment metadata are in `policies/`.

Business websites, public listings, business-hours synchronization, native phone
alarms, turn-by-turn navigation, CRM, and automatic customer messaging are deferred.
Maps is a supporting service; Slack, Calendar, and Jira remain the three business
applications.

Push verified checkpoints to the private [ATLAS repository](https://github.com/aromano3141/ATLAS).
Keep tokens, local databases, real evidence, and generated output out of Git.

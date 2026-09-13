# ATLAS

Reality Sync detects conflicting project facts across Slack, Google Calendar,
and Jira, proposes an evidence-supported correction, applies approved changes,
and verifies the resulting application state.

## First run

Build one complete launch-date reconciliation across three real applications:

1. Read an approved launch decision from Slack.
2. Detect stale dates in a Jira release version and Google Calendar event.
3. Investigate the evidence and show the exact proposed corrections.
4. Require human approval before updating either application.
5. Reread both applications and produce a verification receipt.

The first run is local. Business websites, public listings, and business-hours
reconciliation are deferred to a later phase.

See [the implementation plan](docs/PLAN.md) for architecture, acceptance criteria,
and delivery order. The application has not been implemented yet.

## Development workflow

Use the private repository at <https://github.com/aromano3141/ATLAS> for incremental
commits. Push meaningful, verified checkpoints as work progresses. Keep API keys,
OAuth credentials, source evidence, and local databases out of Git.

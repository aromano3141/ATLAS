# Project instructions

- Follow docs/PLAN.md. The first run covers Slack, Google Calendar, and Jira only.
- Defer business websites, public listings, business-hours reconciliation, and
  public publication workflows until the user requests the next phase.
- Keep evidence, independent assessments, approval, real writes, recovery, and
  external-state verification in the first-run scope.
- Run locally; do not deploy or register a hosted Site for this phase.
- Preserve existing project files and Git history when adding the app scaffold.
- The user requested incremental commits and pushes to the private ATLAS repo.
  Push meaningful, verified checkpoints to the current tracked branch. Inspect
  staged files, preserve remote work, and never force-push.
- Never commit API keys, OAuth credentials, real source evidence, local databases,
  or dependency/build output. Keep credential handling server-side.
- Clearly distinguish fixture tests from live integration checks. Do not claim
  the application is complete until the plan's live acceptance criteria pass.

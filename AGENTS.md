# Test evidence retention

- Keep screenshots and reports only for the latest relevant device test and UI verification. Do not accumulate dated before/after report folders indefinitely.
- Use `scripts/windows/clean-test-artifacts.ps1` to preview cleanup, then `-Apply` to apply. Supply `-Keep` with the current artifact directories whenever the latest test output paths change.
- Never remove test source, PDF fixtures, persisted scenario checkpoints, database clusters, backups, DNS files, or deployment setup as part of screenshot cleanup.
- Some acceptance scripts consume saved JSON fixtures. Check their input dependencies before deleting reports; preserve necessary inputs separately from disposable output.
- Remove stale artifact registrations and ensure the retained report links still resolve after cleanup.

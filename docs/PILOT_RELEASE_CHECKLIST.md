# Pilot release checklist

Current decision: **NOT READY**. See [test results](FINAL_OPERATOR_TEST_RESULTS.md). Do not convert missing physical evidence into PASS.

- [x] Compare code, historical reports and operator-refinement archive.
- [x] Keep operator visual design and existing business rules.
- [x] Fix PDF definite height and zoom/refit layout loop locally.
- [x] Verify PDF on physical Android using native touch; retain six screenshots.
- [x] Reconnect physical iPhone Safari and verify normal/fullscreen PDF rendering with injected local preview and DOM controls. Native pinch/pan and deployed application acceptance remain open.
- [x] Preserve command identity and prevent refresh during pending writes; local regressions pass.
- [x] Run backend regression: 217 tests, no failures/skips.
- [x] Document current quality API and legacy compatibility fields.
- [x] Compare local/live asset bytes: mismatch confirmed and recorded.
- [ ] Establish physical iPhone Safari interaction; normal/fullscreen PDF, page change, pinch, pan and fit.
- [ ] Complete T01–T07 using actual touch/keyboard, with device version, screenshot and same-job API evidence.
- [ ] Validate redesigned login/logout/reset/invitation flows on Android and iPhone.
- [ ] Validate keyboard-open pause/production submission and modal recovery; preserve text on failure.
- [ ] Confirm new assignment notification and five-job switching without losing current state.
- [ ] Capture first visible job-card timing separately from data-ready; test Safari background and lock/unlock.
- [ ] Test real Wi-Fi loss separately from controlled request failure/response loss.
- [ ] Test pause save during refresh and pending request during job switch on devices.
- [ ] Obtain a customer-approved dense multi-page technical PDF and test both devices.
- [ ] Freeze a reproducible candidate commit/build, then obtain publication approval if still required. Do not publish unresolved P0 fixes as accepted.
- [ ] Deploy accepted candidate; verify public hashes and deployed commit, cache behaviour and authenticated smoke on real URL.
- [ ] Record any active-shift test limitation and agree pilot operating boundaries.

Live tests that create persistent assignments/production require explicit authorization and isolated named test records. Do not delete existing records or reset databases. Retain only latest relevant evidence; preserve fixtures and scenario checkpoints. Release is READY only after all P0 target-device checks and critical data/authorization regressions pass.

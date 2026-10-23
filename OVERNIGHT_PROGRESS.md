# Rove overnight progress log

Branch: `feature/rove-a11y-journey-20261023` (worktree `~/rove-a11y-journey`), based on `origin/integration/rove-accessible-preview` @ `03ec00c`.
Routing workstream: separate subagent worktree, branch `claude/routing-quality-20261023` (merged here only after review).

Honesty rules for this log: "verified" means a test or browser check actually ran. Nothing here has been tested on a physical iPhone or with VoiceOver/TalkBack.

## Milestones

### 1. Journey guide module (commit 963cb94)
- `site/public/js/journey-guide.js`: board / ride / transfer / walk / arrive phases built from the planned itinerary. Only an explicit rider confirmation advances a phase; GPS and time never do.
- Advance reminders (3 min, 1 min, overdue), tight-transfer warning, missed-departure and canceled-service recovery. Every message says "live" or "by the schedule".
- Verified: `test/journey-guide.test.mjs`, 19 tests, including real scheduled BART, Muni, VTA, Caltrain and AC Transit journeys and a Muni N to BART transfer from the bundled timetable.

### 2. iPhone speech reliability
Reported bug: tapping "Read route choices aloud" on an iPhone produced no sound.

Likely causes found in the old code (not confirmed on a device):
1. Every call did `speechSynthesis.cancel()` then `speak()` immediately. WebKit can drop an utterance spoken right after cancel, with no error event, so the failure was silent.
2. The same text was written to the screen-reader live region at the same moment. With VoiceOver on, VoiceOver reads the live region over Rove's voice.
3. No detection of "accepted but never started" speech, so failures were invisible.
4. Three full itineraries were read back to back (long, and over the length some engines handle).

Fix: `site/public/js/speech.js`, one speech path for the whole app:
- Speaks synchronously inside the tap when idle (the iOS gesture requirement); cancels only when something is playing, and starts the replacement on the next tick.
- Keeps references to every queued utterance; `resume()` if paused; sentence-sized chunks.
- A watchdog reports speech that never starts. "interrupted"/"canceled" are not errors.
- A fixed speech bar ("Speaking · Stop speaking", or a clear failure message) outside the re-rendered panel.
- Rove's voice and the live region are never used at once.
- Route choices are now short ("Route 1: 16 min. BART Blue line. No transfers...").

Verified:
- `test/speech.test.mjs` (10 tests) with a fake engine that mimics the WebKit drop-after-cancel and silent-engine behaviours.
- In-app Chromium browser at 390×844: the real button reached the `speaking` state with 3 chunks; Stop speaking ended it; a silent engine (stubbed) surfaced the failure message within the watchdog window.

NOT verified: audible playback on a physical iPhone. Manual check:
1. Silent switch off, volume up, VoiceOver off. Open the preview in Safari, plan any trip, tap "Read route choices aloud". Expect speech within 1 second and the dark "Speaking" bar.
2. Tap it again mid-speech: speech restarts once, no overlap.
3. Tap "Stop speaking": speech stops, bar disappears.
4. Turn VoiceOver on and repeat: Rove's voice plays; VoiceOver reads the button label first. Note whether audio overlaps.
5. Turn the silent switch on and repeat; record whether iOS mutes Web Speech on this iOS version. If it is muted, the failure bar should appear after about 2.5 s.

## Next
3. Wire the guide into voice destination entry, route choice and the navigation screen. Persist the trip for restore after a reload.
4. Clearly labeled demo journey (real Muni N → BART timetable, times shifted, nothing live).
5. Visual pass (forest green / warm neutral), accessibility audit, browser screenshots at 320–1440.
6. Merge the routing branch after review; full tests; preview deploy if credentials allow.

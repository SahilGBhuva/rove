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

### 3. Guided voice-first journey (commit dd4e545)
- Home: "Where to?" with Speak destination first, typing second; demo, nearby stops, settings and data as quiet secondary links.
- Voice entry: listening / heard / matches states, shown and announced; focus moves to the first match; choosing it goes straight to routes. Denied mic, silence, no mic, offline and unsupported browsers each get a specific next step.
- Results: at most 3 routes unless the rider asks; each card's accessible name is a spoken summary (duration, lines, transfers, walking, live vs scheduled, warnings).
- Trip screen: one instruction, one large Confirm (I'm at… / I've boarded / I've got off / Done), Repeat, Help. Focus goes to each new instruction; timers, GPS and returning to the app patch text in place.
- Bugs found and fixed in browser testing: returning to the page (unlocking a phone) re-rendered the trip screen and dropped VoiceOver focus; openPlan stole focus from the voice flow; announcements could arrive out of order; the long blurred view transition.
- Labeled demo journey (real Muni N + BART timetable shifted to now; no location; Skip ahead for reminders). Trip restored after reload.
- Verified in browser (Chromium, 390×844): whole demo journey by clicks, focus after each step, voice success and denial with simulated recognizers, resume after reload, Done clears state and stops speech.

### 4. Routing quality (subagent branch claude/routing-quality-20261023, merged)
- Root cause of the Sunnyvale → Chase Center 12:24 AM Tamien reversal: one arrival-only label per stop, trips boarded at the first reachable stop, ranking that ignored waits and direction, no overnight honesty. Full write-up in docs/ROUTING.md.
- New transfer-bounded search plus a latest-departure pass, Pareto filter, generalized cost, detour detection, minimum transfer buffers, and a service-gap response with real later departures.
- Verified by me after merge: 00:24 returns no itineraries and next practical departure 4:42 AM (arrive 6:12); 08:15 gives northbound Caltrain first. Warm p50 33 ms / p95 159 ms (45 runs, local).
- Frontend now says "The next practical trip leaves at 4:42 AM…" with a one-tap "Show the 4:42 AM trip", and shows planner warnings (long walk, leaves later).

### 5. Preview deployment
- https://rove-cac-preview-jd42rrjge-sahilgbhuva.vercel.app (Vercel **Preview**, project rove-cac-preview). Verified through `vercel curl` that it serves this branch and the fixed planner. Behind Vercel deployment protection, so judges need a share link or protection turned off (owner decision).
- Note: other sessions also deployed to this project tonight, including a Production deployment about 28 minutes before mine. That was not this session.

### 6. QA audit and fixes (commits da396b2, 6ceaf30)
- A QA subagent drove headless Chrome (puppeteer-core) at 320–1440 px, light and dark, reduced motion and zoom. Report: docs/qa/QA_REPORT.md (screenshots are a pre-fix baseline).
- P0 fixed: with Help scrolled to the end, the sticky dock covered "Close help". A tap there hit Repeat or Confirm and recorded a false "I've boarded". While Help is open, the dock now holds only Close help, and the confirm handler refuses to advance. Re-verified in the browser.
- P1 fixed: designed control heights (68/64/56 px) were overridden to 48 px; design-layer text is now rem-based and follows iOS Dynamic Type; the desktop speech bar moved to the top; the dock is not sticky on short or zoomed screens.
- P2 fixed: reminder banner restyled so it doesn't look like Confirm, results gutters and colours unified, warm theme-color.
- Passed per QA: no horizontal overflow at any width, focus moves to the instruction after each Confirm, sensible tab order, visible focus ring, all trip text ≥ 7.29:1 contrast, no console errors.
- Still open (P2): the arrival screen could show a short trip summary; 768 px has extra top space; MapLibre warnings on desktop.

### 7. Preview (current)
https://rove-cac-preview-m4au73b38-sahilgbhuva.vercel.app. Vercel target "preview", verified through `vercel curl` to serve styles v33 / app v39 with the P0 fix.

### Tests now
`npm test`: 193 tests, 188 pass, 0 fail, 5 skipped (need OTP or a 511 key).

## Merge instructions (safe, no force-push)
`feature/rove-a11y-journey-20261023` is based on `origin/integration/rove-accessible-preview` @ 03ec00c, which has not moved, so it fast-forwards.
```
git -C ~/rove-claude fetch origin
git -C ~/rove-claude worktree add ~/rove-merge-check -b merge/a11y-journey-20261023 origin/integration/rove-accessible-preview
cd ~/rove-merge-check
git merge --ff-only origin/feature/rove-a11y-journey-20261023
npm ci && npm test            # expect 0 failures
node scripts/preview-site.mjs # optional: click through the demo at http://localhost:4321
git push origin merge/a11y-journey-20261023
gh pr create --base integration/rove-accessible-preview --head merge/a11y-journey-20261023
```
Do not also merge `feature/rove-voice-first-20261023` or `chatgpt/mobile-guidance-hardening` as they are. They patch the same functions (viewNavigate, readNavInstruction, nav-board, speakText) that this branch replaces with the tested guide and speech modules, so merging them would conflict and bring back the cancel-then-speak path and the duplicate Speak buttons. Their intent (boarding confirmation, step-specific speech, platform narration, recovery) is covered here.

## Next
- Manual iPhone checks (section 2 and docs/OVERNIGHT_HANDOFF.md).
- Student-written sections and AI disclosure in docs/CAC_SUBMISSION.md.
- Decide preview access for judges (Vercel deployment protection).

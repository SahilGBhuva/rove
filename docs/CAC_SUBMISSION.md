# Rove — Congressional App Challenge 2026 submission draft

> Draft prepared on 23 October 2026 for the student team to review, correct and complete.
> Deadline (official rules): **12:00 pm EDT / 9:00 am PDT, Monday 26 October 2026**. Submissions cannot be changed afterwards.
> Sections marked **[Student]** must be written by the student(s) in their own words. Do not submit this file unedited.

## One-sentence description
Rove is a voice-first Bay Area transit guide that helps blind and visually impaired riders plan a trip and then confirm each step — reaching the stop, boarding, riding, transferring and getting off — without needing to read a map.

## Problem and intended audience
**Audience:** blind and low-vision people who ride BART, Muni, Caltrain, VTA and AC Transit, using an iPhone (VoiceOver) or Android phone (TalkBack).

**Problem:** mainstream trip planners are built around a map and a timeline that are read visually. The hardest moments for a rider who cannot see the screen are the transitions: is this the right vehicle and direction, when do I get ready to exit, what happens after a transfer, and what if I missed it. Phone GPS cannot tell which vehicle someone boarded or whether a crossing is safe, so an app that pretends to know these things can mislead.

**Rove's approach:** one instruction at a time, read aloud or by the screen reader; a single large confirmation button for each step (I'm at the stop / I've boarded / I've got off); advance reminders before the exit stop; and plain-language recovery when something goes wrong. Rove always says whether a time is live or only scheduled, and never claims to detect vehicles, obstacles or safe crossings.

**[Student]** What inspired you to build this? (Rules question 3.) Only include experiences that actually happened. Do not describe interviews or user testing that did not take place.

## What a judge can try (no bus ride needed)
1. Open the preview on a phone. Tap **Speak destination** (or **Type a destination**).
2. Or tap **Try the demo journey** → **Continue without speaking** → **Start route 1**. The demo is a real Muni N + BART timetable from Tuesday 20 October 2026, shifted to start now. It is labeled **Demo / Simulated** on every screen and uses no location or live data.
3. Use the large green button to move through: walk to the stop → board the Muni N → ride (tap **Skip ahead** to hear the "get ready to exit" reminder) → transfer → board BART → ride → arrive.
4. Tap **Repeat** to hear the current instruction, and **Help** for recovery options.

## Original technical contributions (what the code actually does)
These describe the code in this repository. **[Student]** must mark which parts they personally designed or wrote, and remove or reword anything they cannot explain.

1. **Rider-confirmed journey state machine** (`site/public/js/journey-guide.js`). Turns a planned itinerary into phases (walk, board, ride, transfer, arrive). It is a pure reducer: only an explicit `CONFIRM` event advances it. Stale double taps are ignored by phase index, and `BACK` undoes an accidental confirmation. Time and GPS can trigger reminders but can never change the phase.
2. **Honest reminders and recovery.** Exit reminders fire at about 3 minutes and 1 minute before the itinerary's arrival time, plus an "overdue" check. A tight-connection warning plays during the ride before a transfer. Missed-departure detection offers "Find another route" or "I'm still waiting" (snoozes 5 minutes). Every message says "live" or "by the schedule".
3. **Agency-aware wording.** BART lines by colour, Caltrain service and train number, Muni bus / Metro train / cable car, VTA light rail vs bus, AC Transit bus, each with an appropriate way to verify the vehicle (for example, ask the driver to confirm the route number on buses). Missing direction or platform data is stated as missing, never guessed.
4. **Reliable speech output** (`site/public/js/speech.js`). One speech path for the app that works around mobile WebKit problems: it speaks inside the tap, cancels only when busy, keeps utterances alive, chunks long text, resumes paused speech, and has a watchdog that reports speech that never starts instead of failing silently.
5. **Screen-reader-safe updates.** Live information (countdowns, reminders, GPS quality, offline state) is patched in place, because re-rendering would move VoiceOver focus. After each confirmation, focus moves to the new instruction heading. Rove's own voice and the screen-reader live region are never used at the same time.
6. **Voice destination entry** with visible and announced states (listening, what was heard, number of matches) and specific recovery for denied microphone, silence, no microphone, offline and unsupported browsers.
7. **Multi-criteria schedule planner** (`api/v2/experimental-plan.mjs`, `experiments/bay-router/route.mjs`, `rank.mjs`). Works from bundled GTFS timetables for all five agencies. It runs a transfer-bounded forward search, then a "leave as late as possible" pass, then Pareto filtering on arrival, transfers, walking and waits, then a documented generalized-cost ranking with detour detection. Transfers need a minimum buffer. When there is no practical service (for example overnight), it reports the next real departure instead of recommending an extreme trip.
8. **Realtime plumbing** (`lib/realtime/*`, local server). Server-side 511 GTFS-Realtime fetching with caching, request budgeting and strict ID matching, so a prediction is never attached to the wrong trip. Match quality varies by agency (see Limitations).

## Architecture and technologies
- **Frontend:** plain HTML, CSS and JavaScript, with no framework and no build step (`site/`). Typeface: Atkinson Hyperlegible Next. MapLibre GL JS draws the map on wider screens; phones show no map, because the core flow does not depend on one.
- **Accessibility layer:** journey guide (pure logic, unit-tested), speech module, live-region announcer, focus management.
- **Backend (preview):** Vercel serverless functions in `api/v2/` (trip planning, stop search, arrivals, status, accessibility guidance). Timetables are bundled as gzipped JSON per service day.
- **Backend (local, full):** Node HTTP server (`server.mjs`) with a 511 GTFS-Realtime proxy (`gtfs-realtime-bindings`) and an OpenTripPlanner instance for street-network routing.
- **Data:** GTFS static feeds from BART, Muni (via 511), VTA, AC Transit (via 511) and Caltrain. 511.org GTFS-Realtime. OpenStreetMap-based geocoding (Stadia Maps, Photon fallback).
- **Testing:** Node's built-in test runner (`npm test`), including real scheduled journeys for each agency and a routing regression matrix. `scripts/preview-site.mjs` runs the Vercel layout locally for browser checks. `scripts/bench-routing.mjs` measures planner speed.

## Three strongest technical challenges
**[Student]** Rewrite these in your own words, and only keep ones you worked on and can explain (rules question 4).

1. **Overnight routing detour.** A real query from Sunnyvale to Chase Center at 12:24 AM recommended riding south to Tamien, waiting three hours, then riding north (5 h 47 min). Root causes: the old search kept one arrival-time label per stop, boarded each trip at the first reachable stop, ignored waits and direction when ranking, and showed any reachable trip as "leave now". The new planner compares trade-offs (Pareto), penalises detours and long waits, and reports the gap honestly. Now: "No practical transit connection near this time. The next practical trip leaves at 4:42 AM and arrives at 6:12 AM, by the published schedule." Warm planning went from p50 735 ms / p95 2361 ms to p50 25–33 ms / p95 122–159 ms (`scripts/bench-routing.mjs`, local machine). Details are in `docs/ROUTING.md`.
2. **Silent speech on iPhone.** Tapping "Read route choices aloud" produced no sound on an iPhone. The old code cancelled and spoke in the same instant, which mobile Safari can drop with no error. It also wrote the same text to the screen-reader region, so VoiceOver talked over it. The fix was a single speech module that speaks inside the tap, cancels only when needed, keeps references to queued speech, and uses a watchdog to report failures on screen. *Status: logic tested with a simulated engine and in a desktop browser; audible playback on a physical iPhone not yet verified.*
3. **Never guessing about boarding.** Phone GPS cannot tell which vehicle a rider is on, so auto-advancing on location could tell someone they are on the right train when they are not. The journey became a state machine where only the rider's confirmation moves it forward, and GPS only gives clearly labeled estimates.

## Testing evidence (23 October 2026)
- `npm test`: 191 tests, 186 pass, 0 fail, 5 skipped. The skipped tests need a running OpenTripPlanner or live 511 key. Rerun before submitting and update these numbers.
- Journey-guide tests use real scheduled journeys from the bundled timetables for BART, Muni, VTA, Caltrain and AC Transit, plus a Muni-to-BART transfer.
- Routing regression matrix (`test/routing-quality.test.mjs`): Sunnyvale → Chase Center at 00:24 and 08:15, Sunnyvale → UC Berkeley, Powell → Oakland, single-agency trips for each agency, BART + AC Transit, cross-midnight, invalid coordinates, missing timetable day, long walk. Each itinerary is checked for time order, transfer buffers and no repeated stops.
- Browser checks (desktop Chromium emulating a 390×844 phone): the full demo journey, voice entry with a simulated recognizer (success and denied microphone), route-choice speech, Stop speaking, and the overnight service-gap message. See `OVERNIGHT_PROGRESS.md` and `docs/qa/QA_REPORT.md`.
- **Not done:** testing on a physical iPhone with VoiceOver, an Android phone with TalkBack, or with blind or low-vision riders. Do not claim these in the video or answers unless you do them before submitting.

## Honest limitations
- **Not a safety or mobility aid.** Rove does not detect obstacles, safe crossings, platform edges or which vehicle you are on. Walking distances in the preview are straight-line estimates, not verified paths.
- **Schedule-only preview.** The deployed preview plans from published timetables. Live predictions need the local server with a 511 key, and even then coverage is uneven: Muni and AC Transit matched fully in a sampled feed, while VTA, Caltrain and BART are partial.
- **Browser limits.** A web app cannot control Siri or VoiceOver, and phones may pause web apps when locked. Vibration is not supported in iPhone Safari. Speech recognition availability varies by browser.
- **Reminders are time-based.** Exit reminders use itinerary times. If a vehicle is late and there is no live data, a reminder can come early. Rove says "by the schedule" and tells riders to trust onboard announcements.
- **Timetable window.** Bundled timetables cover 19–27 October 2026 and must be refreshed for later dates. Late-evening requests cannot yet see the next morning's first trips.

## Future improvements (2.0)
**[Student]** Pick what you would really do (rules question 6). Candidates: native iOS/Android apps for background guidance and haptics; verified pedestrian routing; station entrance, elevator and platform data; BART and Caltrain realtime matching; studies with blind riders and orientation-and-mobility specialists; multilingual speech.

## AI tools and open-source disclosure
The rules allow AI tools only with full disclosure. AI may support specific parts but "must not constitute the entirety of the technical development", and students must show "significant individual contributions and technical understanding". The rules also say "all coding and technical development must be done by the student or student team". **Read this section carefully with your teacher or mentor before submitting.**

What the repository history shows (please verify and complete):
- Commits dated 17–23 October 2026. 75 commits are under the student's Git identity, 22 are authored by "Claude (Cowork)" / "Claude (Rove frontend)", and many more carry a "Co-Authored-By: Claude" line.
- AI assistants used include **Anthropic Claude** (Claude Code / Cowork sessions: journey guide, speech module, guided UI, routing rewrite, tests, this draft) and **OpenAI ChatGPT/Codex** (branches such as `chatgpt/mobile-guidance-hardening`, `chatgpt-accessibility-backend`). **[Student]** confirm the full list and what each was used for.
- **[Student]** List, specifically, the design decisions, code, data work and testing you did yourself, and be ready to explain any file you mention. If most of the code was AI-generated, say so plainly and focus on your own decisions (problem framing, safety rules such as never inferring boarding from GPS, choosing agencies and data sources, reviewing and testing). Judges may ask for the source code and an explanation.

Open-source and third-party components:
- MapLibre GL JS (BSD-3-Clause), map style and tiles from OpenFreeMap / OpenMapTiles, OpenStreetMap data (ODbL)
- `gtfs-realtime-bindings` (Apache-2.0); `graphql` (MIT, dev only)
- OpenTripPlanner (LGPL), local full planner only
- Atkinson Hyperlegible Next font (SIL Open Font License 1.1)
- Geocoding: Stadia Maps, with Photon by Komoot as a fallback
- Transit data: 511.org, BART, SFMTA, VTA, AC Transit (CC BY 3.0), Caltrain. Rove is not affiliated with or endorsed by these agencies.

## Demo video storyboard (target 2:45, rules maximum 3:00)
Required by the rules: participant name(s), app name, one-sentence purpose, target audience, tools and languages, and functionality. Upload to YouTube or Vimeo as **public**.

| Time | Screen | Narration (student's own voice) |
|---|---|---|
| 0:00–0:15 | Student on camera, Rove home screen | "I'm [name(s)]. This is Rove, a voice-first transit guide that helps blind and low-vision riders confirm every step of a Bay Area trip without reading a map." |
| 0:15–0:30 | Home screen (with VoiceOver on, only if actually tested) | Who it's for, and the problem: the hard parts are boarding, exits and transfers, and GPS can't tell which bus you're on. |
| 0:30–0:55 | Tap **Speak destination**, say "Lake Merritt", Rove shows "Heard Lake Merritt", choose the match | Voice entry, hearing what Rove understood, confirming the result. Mention typing works too. |
| 0:55–1:15 | Results, tap **Read route choices aloud** | Short spoken summaries: time, lines, transfers, walking, and "scheduled, not live". |
| 1:15–2:05 | Demo journey: walk → **I've boarded** on the Muni N → **Skip ahead** to the exit reminder → **I've got off** → transfer → board BART | "Rove never assumes I boarded. I confirm each step. Reminders come before my stop, and every time says whether it's live or scheduled." Point out the **Demo / Simulated** label. |
| 2:05–2:20 | Tap **Help**; then the 12:24 AM Sunnyvale search showing "next practical trip leaves at 4:42 AM" | Recovery options, and honest answers when service isn't running. |
| 2:20–2:45 | Code editor: `journey-guide.js` reducer, `speech.js`, test output | Tools and languages: JavaScript, HTML/CSS, Node.js, GTFS data, Vercel. One challenge you solved yourself. Close with the AI disclosure in one sentence. |

Recording tips: record on the phone (screen recording with audio), turn the volume up, and keep the "Demo" label visible during the simulated journey.

## Pre-submission checklist
- [ ] Every **[Student]** section written by the student
- [ ] AI disclosure complete and accurate in the application answers
- [ ] Test numbers rerun and updated
- [ ] Preview URL works on a phone; demo journey completes
- [ ] iPhone audio checked by hand (see `OVERNIGHT_PROGRESS.md`)
- [ ] Video 1–3 minutes, public, includes all required items

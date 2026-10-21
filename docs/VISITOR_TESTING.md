# PSU-7 — first visitor testing

This is the next decision gate for the current refinement pass. Recruit five people who have not used PSU-7. They do not need scientific or technical knowledge. Allow about 10–15 minutes each. Include two iPhone Safari users if possible, a desktop user, and someone comfortable navigating with a keyboard. Screen-reader use is valuable where a participant already uses one; do not substitute an automated accessibility scan for that experience.

Use the deployed production homepage: https://planet-survey-dusky.vercel.app/. Confirm it includes the three-world collection before starting. An old open report can be returned to the introduction with the PSU-7 masthead. Do not give an interface tour first.

## Opening words

“We’re testing the website, not you. Please say what you expect and what you’re thinking as you explore. If something is unclear, that’s useful to know.”

Ask permission before recording. Written observations are enough; names and personal data are not needed.

## Tasks, without pointing to controls

1. “Explore a world that interests you. Tell me what you think this site does.” Watch what they choose and whether they understand that the worlds and illustrations are imagined.
2. “Find out what that world might look like from the ground, then look at another world.” Watch discovery of perspectives and world navigation, image loading and orientation after the switch.
3. “Tell me one thing about its environment, and how certain you think we are about that.” Listen for confusion between calculation, assumptions, imagined life and observation. On Viridia, ask what a 100/100 Surface Environment Index means to them without teaching the answer.
4. “Try changing something about the world. What do you expect will happen?” Let them find the parameters and preview. Check whether they understand that the preview is for a new survey and does not repaint an existing illustration.
5. “Keep or share this world so you could return to it later.” Observe whether they choose a link, download or saved report; check that the result opens correctly in a fresh tab.

Do not require a paid generation to complete the first session. The three curated worlds, their two perspectives, sharing and condition previews work without AI calls. If you want to test live generation, reserve one supervised attempt separately; it may consume quota and take roughly a minute. Record actual wait, failure and recovery behavior. Do not run several simultaneous generations just to repeat these tasks.

## What to record

| Task                              | Completed without help? | First hesitation or unexpected action | Participant's words | Device/browser | Severity |
| --------------------------------- | ----------------------- | ------------------------------------- | ------------------- | -------------- | -------- |
| Open and understand a world       |                         |                                       |                     |                |          |
| Surface and another world         |                         |                                       |                     |                |          |
| Interpret science and uncertainty |                         |                                       |                     |                |          |
| Change an assumption              |                         |                                       |                     |                |          |
| Keep/share and reopen             |                         |                                       |                     |                |          |

Mark help when you explain a control or point to it. Note where they stop reading, misinterpret the pictures or expect changes that do not happen. A broken task is more important than a preference about color. Suggested severity: blocks completion, causes a wrong scientific conclusion, recoverable confusion, cosmetic preference.

Finish with: “What would you tell a friend this does?”, “What felt unclear?” and “Was anything slow or difficult to read?” Avoid leading with whether it looks award-worthy.

## How to decide the next pass

Aim for all five to open a complete world unaided and at least four to complete the remaining journey without coaching. This is an internal qualitative target, not an Awwwards rule or a statistically meaningful success rate. Any repeated scientific misunderstanding, inaccessible control or task-blocking failure deserves a fix even if the count passes. Bring back the observations before adding new features.

## Current evidence and limits

The implementation has passed automated Node tests, Chromium browser flows, narrow/landscape checks and axe audits. The suite checks all three worlds with live services both enabled and unavailable, actual bundled-image decoding, correct share links, reload, and preview isolation. Production deployment must be checked against the final commit. Physical iPhone Safari, VoiceOver/NVDA usability and first-time understanding remain unverified until people test them.

The orbital and surface illustrations share environmental art direction; they are not an exact geographical descent. The globe remains hidden. A live AI output may still contradict the specification; mocked API checks establish application behavior, not production image quality. Award submission assets and a full cross-browser/device signoff should follow this visitor round, rather than delay it with more speculative polish.

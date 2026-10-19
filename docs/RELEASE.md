# Submission rehearsal

The implementation is ready for a configured preview deployment. Local checks cannot establish live generation quality, production latency or compatibility with every browser.

## Completed locally

- Physics regressions: Earth reference, stellar mass, solar-day units, hot/frozen worlds, gas/airless cases, pressure-dependent water phase, deterministic scoring and preserved catalogue precision.
- API faults: malformed requests, upstream authorization errors, invalid/truncated narratives, timeout status, shared-store outage, quota release and prompt construction.
- Blob SDK: upload, signed image validation, report save/load, tampered image rejection and missing reports with intercepted HTTP.
- Actual Redis: simultaneous reservations, concurrency cap, hourly/global limits and recovery from abandoned leases.
- Chromium: first action in the initial viewport, responsive layouts, reference/report refresh, API retries, independent surface generation, selected-view download, full shared reports in a fresh context, NASA precision, history races, duplicate surface requests and image decode recovery.
- Axe: welcome, report, NASA, sharing and lightbox on mobile and desktop, plus dialog keyboard focus containment/restoration. Automated scans are not a complete accessibility assessment.
- Slow mobile loading: initial parameter panel stays collapsed before scripts arrive; synthetic layout-shift regression included in browser checks.
- Production build: canonical/absolute social metadata and exclusion of server-only modules from static output.

## On the configured Vercel preview

1. Verify `/api/capabilities` reports the expected enabled services. Make one full survey: interpretation, orbit, surface/cloud deck, both downloads, public link opened in another browser, local refresh and saved-file import. Verify actual Blob records and Upstash counters.
2. Review a small live image/prose set: Earth-like; dry; frozen red dwarf; hot inner edge; dense CO₂; airless; low-density super-Earth; gas envelope; one NASA world. Check water phase, sky, absence of invented moons/vegetation, consistent palettes and gas cloud decks. Compare image content with the report rather than relying on prompt text. This incurs provider charges.
3. Test missing/disabled provider credentials and an unavailable quota store in an isolated preview. The numerical report and reference world must remain usable; retries must end with a useful result or message. Keep preview limits low and separate from production.
4. Rehearse with mobile Safari, Firefox, desktop Chromium, keyboard-only navigation, a screen reader, 200% zoom, reduced motion, slow network and an interrupted image download. Include long NASA/report names and multiple quick surveys.
5. Measure initial rendering (LCP/CLS/INP where supported) separately from AI generation time on mobile hardware and a mobile connection. Local screenshots and synthetic timings are not field Core Web Vitals.
6. Confirm the canonical hostname and social preview with the target sharing platforms. The current preview card is generic; report details and imagery load in the app for recipients.
7. Verify provider account spend controls, production request ceilings, Vercel duration limits, public Blob retention and billing alerts. Then run a complete visitor journey against the final production URL before entering awards.

Live Anthropic/OpenAI output, real Vercel Blob/Upstash credentials, a deployed preview, cross-browser/device behavior, social crawler rendering and field performance still require this rehearsal. No deployment or paid generation was performed during the local implementation checks.

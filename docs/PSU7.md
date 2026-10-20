# PSU-7 targeted improvement pass

## Changes and decisions

- `lib/planet.js`: extracted `geographySpec()` using canonical validated physical parameters and deterministic compositional choices. Both perspectives share that result. Water/ice coverage includes inland basins; gas, dry and entirely ocean/ice cases retain dedicated constraints. Fictional geography is described positively, with Earth-map exclusions retained as a secondary guard.
- `lib/planet.js`: interpretation instructions explicitly separate calculations, estimates, assumptions and invented scenery, prohibit acquisition/telemetry claims, and require catalogue attribution. Separate image perspectives now use seven explicit sections. Airless and high-pressure atmosphere instructions are explicit; existing biosphere rules and single-request image flow remain intact.
- `index.html`: renamed the existing rubric Surface Environment Index, with visible exclusions and an explicit warning about 100/100. Weighting is unchanged. ESI remains separate. Water-phase corrections can remove liquid-water points where the old approximation extrapolated beyond its domain.
- `lib/planet.js`: bounded Antoine saturation inversion and added uncertainty warnings. This remains an educational phase approximation, not a climate or high-pressure ice model.
- `styles.css`: intrinsic lightbox height, bounded image height and safe-area padding reduce blank space while retaining accessible controls.
- `tests/image-prompts.test.js`: eight fixed scenarios, procedural diversity, reproducibility across object order and art mode, interpretation evidence requirements, unchanged rubric weighting, phase extremes and opt-in review checks.
- `tests/browser.mjs`: narrow landscape viewports, lightbox viewport containment and forward/reverse focus trapping, alongside existing accessibility, error recovery, request deduplication and layout-shift checks.
- `scripts/image-quality-review.js`: disabled-by-default offline manual review checklist. No production import, vision calls or automatic regeneration.
- `README.md`: model domains, score exclusions, review usage and limitations.

## Validation

- `npm test`: all six test files pass.
- `node --test --test-isolation=none tests/*.test.js`: 43 individual tests pass; one existing real-Redis integration test skipped because Redis is not configured.
- `npm run check`, `npm run build`, `git diff --check`: pass. No separate lint command is configured.
- `npm run test:browser`: passes in local Chromium at 320, 375, 390, 568, 768, 844, 1440 and 1920 pixel widths; landscape includes 568×320 and 844×390. All tested axe states have zero violations. Keyboard containment/restoration, request error/retry flows, image request deduplication and refresh persistence pass. Synthetic 390px mobile CLS 0.000, LCP 1324ms; not field performance measurements.

## Remaining limits

No paid image/vision calls were made. Prompt tests validate specification and instructions, not actual generated pixels or provider compliance. The offline checklist deliberately makes no automated quality verdict. Generated prose still requires qualitative review; existing saved prose and imagery remain unchanged. Physical iPhone Safari and hardware safe-area behavior were not tested. The geography is an artistic description rather than a coordinate map, so exact coastline continuity between independently rendered views is not guaranteed. Water phase omits salinity, regional/seasonal climates and pressure-dependent freezing.

## Follow-up: elongated geography and regional surface views

Replaced crescent, necklace, star-shaped and elongated-island recipes with broad irregular landmass groups, compact islands and short coastal features. Added positive length/width and interior guidance, with an explicit guard against ribbon shapes and paired tapering Americas-like landmasses. New `surfaceSiteSpec()` selects a deterministic named artistic region appropriate to the modeled phase and environment. The same anchor reaches both image views and the interpretation specification; surface framing explicitly depicts a local landscape, while orbital framing requests the corresponding hemisphere without labels. No terrain-map simulation, extra image call or UI dependency was added.

Added two regressions covering all sampled layouts and regional anchors across the eight fixtures. Follow-up validation: 45 individual tests pass, one existing real-Redis integration test skipped; syntax checks, build and diff checks pass. Browser results above apply to the earlier UI pass; this follow-up changes prompts only. No new generated images were evaluated, and these changes are local rather than deployed.

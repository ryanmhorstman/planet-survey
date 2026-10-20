# PSU-7 · Planetary Survey Unit

An instrument for imagined worlds: deterministic planetary estimates, NASA catalogue starting points, and speculative AI field notes and imagery. The illustrated Boreal reference survey and the numerical model work without API credentials.

## Develop

Use Node.js 24.x.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. `PORT` changes the port. The development server runs the same API handlers as Vercel; it is a small local adapter, not a full Vercel emulator. Copy `.env.example` to `.env.local` to configure optional services. Never commit credential values.

For Codex cloud's HTTPS proxy, use:

```sh
node --use-env-proxy --env-file-if-exists=.env.local scripts/dev-server.js
```

`npm run build` produces the public static files in `dist/`. Vercel separately deploys the root `api/` functions. Only browser-safe modules are copied into `dist/lib`; server credentials and storage code stay server-side.

## Vercel deployment

1. Import this repository into Vercel using Node.js 24.x. `vercel.json` supplies the build command, output directory, security headers and function durations. The selected plan must permit the 90-second image function duration.
2. Create a **public Vercel Blob store** and connect it to the project. Set its `BLOB_READ_WRITE_TOKEN` in the server environment. Generated WebP images and versioned report JSON are stored there.
3. Create an **Upstash Redis** database and connect it to this project's **Production** environment. The app accepts the integration's `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically. You can override them with `RATE_LIMIT_REDIS_REST_URL` / `RATE_LIMIT_REDIS_REST_TOKEN`. A complete pair is required; credentials from different pairs are never mixed. These are REST credentials, not a Redis TCP URL/password. Use a separate database for previews if their quotas should be independent.
4. Set `ANTHROPIC_API_KEY` for field interpretations and `OPENAI_API_KEY` for imagery. `PLANET_OPENAI_KEY` is an alternative image-key name for cloud environments that reserve `OPENAI_` names. Models currently used: `claude-sonnet-4-5` and `gpt-image-1`; the accounts must have access to them.
5. Set `SITE_URL` to the final production origin, such as `https://your-domain.example`, or enable Vercel's system environment variables. The build falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`, and emits absolute canonical/social image URLs. Shared reports currently use the site's generic social card.
6. Review `DAILY_ANALYSIS_LIMIT`, `DAILY_IMAGE_LIMIT`, and `DAILY_SHARE_LIMIT`, and configure account spending controls with the AI providers. Deploy, then complete the [release rehearsal](docs/RELEASE.md).

No credential is needed for NASA catalogue requests. Missing services are reported through `/api/capabilities`; the frontend keeps reference and model reports available. Blob is required for live imagery so every returned image has a durable reference. Shared quotas are required for all live production generation and report publication. `PSU7_ALLOW_LOCAL_QUOTAS=true` enables a simple hourly in-memory limiter only for local development; it is ignored on Vercel and in production.

After connecting storage or changing variables, **redeploy Production** so the server functions receive them. Check `/api/capabilities` before considering a live-generation rollout complete. Its `configuration` object reports only booleans: `analysisProvider`, `imageProvider`, `imageStorage`, and `sharedQuotas`. All four should be true for the full experience. False `sharedQuotas` disables both AI requests; false `imageStorage` additionally disables imagery and public sharing. Existing AI keys alone are not sufficient. Initiate Survey refreshes this check so a transient startup failure cannot disable generation for the rest of a browser session.

For restricted outbound networks allow `api.anthropic.com`, `api.openai.com`, `exoplanetarchive.ipac.caltech.edu`, `vercel.com`, the connected `*.public.blob.vercel-storage.com` store, and the exact Upstash REST hostname. Fonts are self-hosted. Blob's SDK derives the store ID from its token, and image signatures use that token locally: it requires an actual server-side token, not a placeholder intended solely for proxy substitution.

## Reports and quotas

Reports own their parameters, catalogue measurements, derived estimates, interpretation, and both image references. Asynchronous tasks update their originating report. The last five reports are kept in local storage; Save report exports portable JSON, and Open saved report imports it. Exported files contain image URLs, not embedded image bytes. Download view saves the selected image itself.

Create public link stores an immutable snapshot under a random UUID. Anyone with the link can read it and its public images. Changes made after publication require a new link. Images are verified with a server HMAC before inclusion in a newly published report. Reading an existing report does not recheck old signatures, so key rotation does not break existing links; re-publishing an old image after rotation requires re-signing it or generating a new image. Numerical fields are recalculated on load, never accepted from imported JSON or AI output. Original fragment links still open with recalculated values, but cannot recover imagery that those links never saved.

The Upstash Lua reservation atomically enforces:

| Operation      | Per IP / hour | Global / 24 hours (default) | Concurrent requests |
| -------------- | ------------: | --------------------------: | ------------------: |
| Interpretation |            20 |                         500 |                   8 |
| Image          |            12 |                         100 |                   3 |
| Public report  |            20 |                         500 |                   8 |

Windows start at the first request, rather than UTC midnight. Failed attempts consume allowance; limits count requests, not dollars. IP keys are HMAC-hashed, and shared NAT users share an allowance. Concurrency leases expire after 90 seconds even if a process disappears. A quota-store outage prevents new paid requests. The Redis integration test exercises actual concurrent Lua execution.

Public Blob objects persist until an operator deletes them. Deleting a report or its referenced image breaks the corresponding link; clearing browser history does not delete public objects. Review retention and storage costs before promoting the site. There is no automatic garbage collection in this version.

## Scientific scope

`lib/planet.js` is shared by the browser and server. It computes gravity, density, escape speed, stellar-mass-aware orbital periods, and a simplified energy-balance temperature with an assumed greenhouse offset. Rotation is an input; prograde solar-day duration is calculated relative to the orbit. Measured NASA mass, radius and orbital values retain their original precision. Atmosphere, pressure, water, rotation, tilt and terrain on catalogue worlds remain explicit scenario assumptions.

The displayed Surface Environment Index is an illustrative 100-point rubric: temperature 40, plausible exposed liquid water 25, pressure 20, atmosphere 15. Airless worlds score zero; gas envelopes have no surface rating. ESI is a separate four-variable similarity index. The Surface Environment Index excludes gravity, density, radiation, toxicity and biological viability; even 100/100 does not establish habitability or human safety. ESI remains separate. Classification and both image prompts use the same temperature/phase results and deterministic visual specification. Gas worlds offer a cloud-deck viewpoint.

Fictional geography is designed from scratch, with a parameter-derived arrangement of landmasses and water basins rather than Earth's continent map. Mild, liquid-water nitrogen-atmosphere scenarios with exposed land can include explicitly imagined vegetation. Its palette and growth forms are shared by the interpretation and both image viewpoints; these are artistic choices, not detected life or a biological prediction. Frozen, airless, very hot and gas-envelope scenarios do not receive vegetation; entirely ocean-covered scenarios do not receive land vegetation. The Imagined biosphere control offers None, Familiar and Alien. Alien mode changes pigments, growth structures and habitat patterns with stellar class, gravity, water, temperature, pressure and tilt; ocean worlds can depict floating colonies. Conditions without modeled liquid water retain mineral/ice/cloud scenery. These are constrained design choices, not a model of alien evolution. Mode selection does not change the physics, suitability score or geography, and survives saved/shared reports. Older reports without this setting default to Familiar. Existing saved images remain unchanged; initiate a new survey to use updated art direction.

This is not a climate, atmospheric escape, orbital stability, geology, tidal evolution, biosphere or seasonal simulation. Water and tilt do not change the mean energy-balance estimate. Catalogue equilibrium temperatures may use different assumptions. The water-phase approximation is illustrative, especially at high pressures. The sample illustration is an artistic reference, not a validated rendering. Prompt constraints reduce image contradictions but cannot guarantee visual compliance.

## Verification

```sh
npm run check
npm test
npm run build
npx playwright-core install chromium
npm run test:browser
```

Browser checks use a system `/usr/bin/chromium` if available; otherwise the Playwright-managed browser. `CHROMIUM_PATH` overrides it. They start an isolated local server on port 3002 (`TEST_PORT` overrides), use controlled API responses, and write screenshots and axe results to ignored `test-results/`.

To include the real Redis concurrency test, install Redis and set executable paths:

```sh
REDIS_SERVER=/usr/bin/redis-server REDIS_CLI=/usr/bin/redis-cli npm test
```

The Redis test uses a temporary Unix socket with persistence disabled; it never connects to a configured production database. Without `REDIS_SERVER`, this test is explicitly skipped. Blob tests intercept the real SDK's HTTP requests; they do not need a live store. Browser tests do not make paid generation requests. GitHub Actions runs the build, unit/API/storage tests, real Redis test, Chromium flows and automated accessibility checks.

Fonts: EB Garamond and Space Mono, self-hosted with licenses in `assets/fonts/`.

### PSU-7 prompt and model checks

`npm test` includes eight fixed image-prompt scenarios and deterministic geography checks without image API calls. Geography combines independent parameter-seeded topology, coastlines, islands, inland basins, polar distribution and tectonic motifs. Both views use the same specification; biosphere mode does not alter it. These are fictional arrangements rather than a simulated global map, so prompt consistency cannot guarantee matching rendered coastlines or prevent every Earth resemblance.

Water saturation uses Antoine coefficients in mmHg (1–100°C and 99–374°C branches), with the liquid/vapor boundary capped below water’s 373.946°C critical temperature. Saturation results outside the supported range and subcritical temperatures at/above 220.64 bar return an explicit model-range uncertainty, without liquid-water points. High-temperature, low-pressure vapor and supercritical possibilities are handled separately. Freezing below 0°C is an educational approximation; salinity, pressure-dependent melting, local climate and exotic ice phases are not modeled.

Optional offline review: `node scripts/image-quality-review.js --enable survey.json`, where the file contains `{ "params": {...}, "catalog": null }`. This outputs the shared specification and six unreviewed criteria for a developer comparing saved orbital/surface images. It is disabled unless explicitly enabled, performs no image analysis or network calls, and is excluded from the production bundle. No automatic regeneration is implemented.

`npm run test:browser` checks narrow portrait and landscape viewports, axe accessibility, modal focus containment/restoration and synthetic mobile layout shift. Chromium emulation does not replace a physical iPhone/Safari check. Interpretation prompts prohibit acquisition/observation claims and distinguish catalogue evidence from scenario assumptions; provider adherence still requires qualitative review. Existing saved prose and images are preserved.

Follow-up geography refinement favors compact irregular landmasses with substantial interiors, broad basins, short coastal protrusions and compact island groups. Long crescent/necklace/ribbon recipes were removed. Both prompts also receive the same deterministic imagined region (coastal margin, ice basin, dry basin, open ocean or upper clouds). Surface framing depicts that local region rather than squeezing the global water fraction into a landscape. The orbital prompt places the region on the facing hemisphere where applicable, without markers. These regional anchors are not coordinate maps and cannot guarantee pixel-level alignment between independently generated images. Changes affect newly generated images; saved images remain unchanged.

### Code formatting

Prettier uses its standard defaults, pinned as a development dependency. Run `npm run format` to format source, tests, markup, styles, documentation and configuration. Run `npm run lint` (or `npm run format:check`) to check formatting without changing files; CI enforces this alongside syntax checks and tests. Generated output, test evidence, environment files and the npm-generated lockfile are excluded. Prettier checks formatting; `npm run check` separately validates JavaScript syntax.

### Cartography preview

Open a report or the reference world and choose **Cartography** beside **Illustrations**. The lazy-loaded explorer offers a rotatable Three.js globe, zoom, click/tap picking, explicit latitude/longitude inspection, a selection marker and local model readout. **2D atlas** provides the same geography without 3D graphics; it is also the automatic fallback when WebGL is unavailable. Selected coordinates and up to 20 named sites are saved with the report. Save, rename, revisit and remove sites in Cartography; they survive browser history restoration, file export/import and new public-share snapshots.

A versioned, parameter-derived 512×256 atlas is generated in a worker. Its area-weighted basin threshold respects assigned water/ice coverage, and the same atlas supplies globe coloration and location classification. Atmosphere, phase and biosphere rules constrain the local proxies. Airless worlds have no atmospheric shell; gas worlds use a cloud reference sphere; dense atmospheres obscure the modeled substrate. The globe uses a fixed illustrative lighting epoch, not an observed rotational phase.

This is an independent experimental instrument: existing AI illustrations and their prompts are unchanged and may have different geography. Coordinate-based AI expeditions are available as explicit actions; terrain descent and terrain LOD are not implemented. The coarse atlas, terrain heights, moisture, local climate and geology are artistic approximations; no plate evolution or local weather is simulated. New reports use format v4 and persist a `cartography` record (schema version 1) containing algorithm version, seed, canonical resolution, physical-parameter key and a frozen environmental estimate snapshot. Legacy v2/v3 reports migrate deterministically to the unchanged v1 world. V3+ reports require their saved identity, preventing accidental loss from being treated as a new world. Older clients reject v4 rather than silently stripping expedition results. The historical localStorage key is retained to migrate existing on-device history. Selected coordinates and named sites are validated on imports and server-side sharing; sites are tied to their model identity. Unsupported versions or mismatched identities are rejected rather than silently regenerated. Do not change `cartography-1` generation semantics without introducing a new version and a migration strategy. The v1 phase approximation is retained as a versioned shared primitive.

Globe exploration and local model notes make no paid AI requests; expedition images and AI notes require separate explicit actions. Starting another survey while Cartography is selected also skips automatic image/interpretation calls. Starting a survey through the default Illustrations instrument retains the existing generation flow; switching instruments does not cancel jobs already started there. For a provider-free first visit, open the reference world, select Cartography, then adjust parameters and initiate a survey.

Three.js is the only new runtime dependency, pinned in npm. Build and development scripts copy the required ESM files and license into ignored, same-origin `assets/vendor/`; no CDN or React is used. The current unbundled vendor modules total approximately 418KiB gzip, fetched only on first 3D activation. A later focused production bundle can reduce this without changing the application architecture. A local Node measurement prepared the global atlas in approximately 228ms and colors in 145ms; these are development-machine observations, not mobile performance guarantees. Real iPhone Safari and sustained GPU/memory profiling remain necessary.

Saving, renaming or removing sites, or changing the selected location, invalidates the current public-link association. Create a new public link to include the changes; older links keep their original snapshot. Edited reference reports use a report snapshot rather than the static sample link. Site names and coordinates are public when included in a public report. Imported world snapshots contain modeled estimates, not authenticated catalogue observations; snapshots and seed checks provide reproducibility and consistency, not cryptographic scientific provenance. Atlas bytes are regenerated locally, not added to localStorage or uploads.

### Location-specific expeditions

In Cartography, select coordinates or revisit a named site, choose a camera heading, then use **Generate expedition image** or **Write AI field notes**. These are separate paid-provider operations using existing service quotas; nothing is generated just by selecting a location. The server reconstructs the pinned world and derives local constraints itself. Day/night light follows the globe's illustrative epoch. Gas worlds produce atmospheric views. Existing global orbital/surface generation is unchanged.

Results are saved by world, coordinates, heading, art mode and prompt version, with at most eight expeditions per report. Revisit them through Saved expeditions or a matching named site. Cached results survive refresh, export/import and new public links. Image load failures have a free reload; retries after provider failures remain explicit generation requests. Expand the expedition image to download that exact result. Changing the report after publication requires a new public snapshot.

Images are text-conditioned interpretations: shared model inputs do not guarantee exact coastlines, mountain silhouettes or biological appearance in the generated pixels. Reference-conditioned geographic matching is future work. The feature was verified with mocked provider responses and storage; no live output-quality claim is made. Publicly shared image references carry a signed association with their expedition key. Report JSON uses format v4; reports may be up to 100KB, while generation requests remain capped at 24KB.

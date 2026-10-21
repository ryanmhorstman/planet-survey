# Boreal — the first complete showcase

Updated 21 October 2026. Open `/?sample=boreal` to explore both bundled perspectives without an image or interpretation API call. The landing page now leads with the illustration; custom-world controls follow it in mobile visual and document order. Desktop retains the instrument sidebar.

## Scientific starting point

`sampleReport()` remains the source for the scenario and its numerical estimates. Boreal assumes a Sun-like star, outer habitable-zone orbit (1.4 AU), Earth mass and radius, 1 bar nitrogen/oxygen atmosphere, 85% water/ice inventory, 23° tilt and 24-hour rotation. The showcase now explicitly assumes no biosphere. The unchanged physics model estimates approximately −25°C mean temperature and favors ice. Local weather, glacier geometry and geological processes are not simulated.

The field note explains the roughly halved stellar flux and distinguishes modeled conditions from imagined scenery. Older saved Boreal reports with familiar-biosphere assumptions retain their parameters and cartography identity when restored; they are no longer treated as the current static showcase link.

## Illustration provenance and direction

The two illustrations were generated with the session image-generation tool on 21 October 2026. The tool did not expose a selectable model identifier; this does not change the application's production image model or pipeline.

- `assets/sample-orbital.webp`: a refinement of the previous reference artwork, replacing vegetation-like colors and ambiguous open oceans with charcoal/ochre mineral terrain, white ice sheets and blue frozen basins. The direction specified compact fictional highlands, asymmetric ice distribution, a thin atmospheric limb, warm white off-frame sunlight and no unsupported bodies or objects.
- `assets/sample-surface.webp`: generated using the revised orbital image as a visual reference. The direction specified a camera on a rocky shelf beside a frozen basin, blue glacier walls, wind-scoured snow, distant mineral highlands and a pale atmospheric sky. No liquid water, biology, buildings or celestial bodies were requested.

Both outputs were visually reviewed for phase, atmosphere, palette, lighting and unsupported features, then encoded as 1536×1024 WebP assets. No automated vision evaluation or regeneration was added. The surface is a complementary environmental interpretation, **not an exact mapped location** on the orbital image. Visible ice fractures and geological forms are artistic approximations, not resolved planetary data.

The orbital asset loads on the landing page with a 768px responsive variant for smaller displays. The surface asset is requested when its perspective is opened. Both have reserved 3:2 presentation geometry, distinct descriptive alternative text and existing lightbox/download controls. Export/import and server-side image allowlists accept only the two explicit bundled paths, not arbitrary local asset URLs.

## Remaining work

This completes the first world, not the full three-world collection or the Awwwards submission. Next: physical iPhone Safari and assistive-technology review, first-time visitor feedback, two contrasting curated worlds, and refreshed social/submission artwork. The existing social card still represents the earlier Boreal artwork. Globe exploration remains hidden by default. Production AI reliability and exact geographic continuity are not established by this showcase.

## Validation

All 14 Node test files passed, along with syntax, Prettier and build checks. The full Chromium browser suite completed 60 checks, including 34 axe audits with no violations, mobile portrait/landscape layouts, keyboard lightboxes, sharing and saved-report flows. New assertions cover both bundled views, no showcase generation calls, deferred surface downloads and preservation of older reference assumptions.

After adding the responsive orbital variant, a targeted repeat at 390px, 4× CPU slowdown, 150ms network latency and 200KB/s throughput measured LCP 1.57s and CLS 0.00065. Only the 50KB orbital preview downloaded initially; the surface decoded successfully when selected. These are local synthetic results, not real-user Core Web Vitals or physical-iPhone verification.

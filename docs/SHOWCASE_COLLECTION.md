# Curated field collection

The public collection now contains three complete worlds: `/?sample=boreal`, `/?sample=cinder` and `/?sample=viridia`. All use `sampleReport(key)`, the existing calculation engine, and the normal report, lightbox, export/import and sharing UI. `showcaseKey()` identifies a canonical world. The shared explicit `REFERENCE_ASSETS` registry supplies safe bundled image paths and descriptive alternative text to the client and storage validators.

| World        | Assumptions and estimate                                                                  | Visual direction                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Boreal / 07  | 1.4 AU, 1 bar N₂/O₂, 85% inventory, approximately −25°C, no biosphere                     | White ice, blue frozen basins, charcoal/ochre mineral terrain                                        |
| Cinder / 08  | 1.4 AU, vacuum, zero water inventory, approximately −44°C global mean, no biosphere       | Dry basalt basins, impact terrain, black sky and crisp shadows without atmospheric haze              |
| Viridia / 09 | 1 AU, 1 bar N₂/O₂, 60% inventory, approximately 15°C, explicitly imagined alien biosphere | Compact fictional continents, blue liquid-water bays and patchy copper/plum ribbon fans and rosettes |

All three retain Earth mass/radius and the standard Sun-like star assumption. Means do not resolve regional conditions or local extremes. Viridia's life is a creative assumption, not a consequence predicted by its index or temperature. Cinder demonstrates why familiar gravity and a numerical similarity to Earth do not imply a safe environment.

## Artwork and delivery

The four Cinder/Viridia illustrations were generated with the session image-generation tool on 21 October 2026. The tool did not expose a model selector. Each orbital image was generated from a physically constrained positive description of original geography/materials, and each surface image used its own orbital image as a visual reference. Manual review covered water phase, sky, cloud presence, material/light palette, invented biology and unsupported objects. Cinder has neither atmospheric limb nor atmospheric surface haze. Viridia uses the existing G-star alien morphology/palette direction. Exact coastlines and local landmarks remain unverified artistic interpretations, not shared terrain data. The hidden cartography experiment is not claimed to match these artworks.

The original Cinder orbital brief loosely described a mean near −41°C; the actual model estimates −43.9°C, used in the report and surface direction. This difference has no resolved regional-weather interpretation. No formula was adjusted to fit an image.

The outputs are encoded as 1536×1024 WebP assets. The landing loads only Boreal's responsive preview. The collection choices are text, so the four additional full-resolution images download only when visited; surface assets are not prefetched. Existing generated image URLs, signatures, physics and paid image requests are unchanged. Modified/older reference reports keep their assumptions and geography identities and lose the static showcase link when appropriate.

The small conditions preview reuses `calculate()` when parameters change, including catalogue assumptions. It describes the next survey; it never alters the current report or imagery. Empty numeric fields remain incomplete rather than silently becoming zero. No climate model, new dependency or additional production service was introduced.

`og-image.png` is a refreshed 1200×630 brand preview using the current Boreal artwork. Its reproducible source is `scripts/social-card.html`; run `node scripts/social-card.mjs` with the same Chromium setup as the browser tests. This is social artwork, not an Awwwards submission thumbnail or a screenshot claiming an unimplemented feature.

## Next gate

Use [the visitor test brief](VISITOR_TESTING.md). Pause feature work for that feedback. Physical iPhone Safari and assistive-technology use, actual paid generation quality and the complete submission media package remain separate work. The current automated checks do not establish an accessibility certification or real-user Core Web Vitals.

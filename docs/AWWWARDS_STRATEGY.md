# PSU-7 — Awwwards submission strategy

Research checked 21 October 2026. This supplements the [application review](AWWWARDS_REVIEW.md). It separates published award rules from recommendations for PSU-7. This research pass changes documentation only; it does not submit the site, purchase a plan or generate new images.

## Recommendation

Finish the core experience before entering. Position PSU-7 as **an interactive scientific field journal for possible worlds**. Its advantage is the connection between physical assumptions, understandable science and art-directed illustrations. The strongest next investment is an immediate, complete experience of that connection. Keep Cartography paused.

There is no defensible percentage estimate of our chances. Honorable Mention is a sensible first recognition to pursue; Site of the Day is a competitive stretch goal. Passing technical checks establishes a foundation, not sufficient visual distinction for an award.

## What the official material establishes

### Evaluation and recognition

The [evaluation system](https://www.awwwards.com/about-evaluation/) weights design 40%, usability 30%, creativity 20% and content 10%. Approved entries go to at least 18 jurors; three scores furthest from the average are excluded. Voting normally lasts five days. SOTD is competitive rather than a guaranteed numerical threshold. Developer Award consideration follows SOTD and requires a developer-jury score above 7.

The [FAQ](https://www.awwwards.com/faqs/) adds an important qualification: Honorable Mention needs **both** jury and eligible-user scores of at least 6.5. The evaluation overview mentions only the jury threshold. Use the more specific FAQ when planning. Ordinary new-account votes do not substitute for qualified community votes; the evaluation page describes validated professional voters.

Implication for PSU-7: design and usability account for 70% of the weighting. Improve illustration presentation, hierarchy, discoverability and reliability before adding another subsystem. This is our prioritization judgment, not a claim that the award mandates a particular visual style.

### Entry logistics

As retrieved, [Standard Submission](https://www.awwwards.com/submit/) displays **US$65 for one website**. Confirm currency, tax and final price at checkout. A paid membership is not necessary for that route; the page describes membership discounts and visibility benefits, not a judging advantage. For this single project, start with Standard unless the membership has a separate practical value.

The [FAQ](https://www.awwwards.com/faqs/) specifies a **1600×1200** main thumbnail and recommends additional imagery/video. Approval can take up to a week; SOTD eligibility lasts up to three months after approval. Entry details can be edited while in draft, but not once under review or approved. Those editing restrictions concern the submission record; they are not permission to let the deployed product deteriorate during judging. Do not treat the fee as a guaranteed critique: jury scores are only disclosed to SOTD winners.

### Originality, AI and rights

The FAQ excludes websites built from pre-made templates, with a distinction for original template-demo work. PSU-7 should present its own instrument design and interaction, not adopt a generic “award-winning” template.

The [terms](https://www.awwwards.com/terms/) require the submitter to be entitled to submit the work and grant Awwwards permission to promote it. I found no explicit AI-imagery eligibility rule in the evaluation page, FAQ or terms reviewed. That absence is **not** an assurance of eligibility or a prediction of jury preference. Clearly disclose the use of AI illustrations and retain source/licensing records. Confirm with Awwwards if an AI-specific eligibility question remains before payment. Do not imply NASA endorsement or genuine planetary observation.

### Technical guidance needs judgment

The [Developer Award page](https://www.awwwards.com/developer-award/) emphasizes cross-browser, inclusive implementation. Its linked [developer guidelines](https://docs.google.com/document/d/1Gvmg6Z60UQ-4BOM3XyUcBKvq2shd4J-l_MoXT26JFEg/) contain an update notice but still list revision v0.7 from December 2016 and several old techniques/tools. Use its goals—fast delivery, meaningful markup, usable mobile interactions and accessibility—without implementing every historical checklist item. The earlier mobile-excellence PDF has similar limitations.

Use current [WCAG 2.2 guidance](https://www.w3.org/WAI/WCAG22/quickref/) for accessibility targets. For performance, Google's [Core Web Vitals guidance](https://web.dev/articles/vitals) defines good thresholds of LCP ≤2.5s, INP ≤200ms and CLS ≤0.1, assessed at the 75th percentile and segmented by device class. These are useful engineering targets, not published automatic Awwwards pass marks. Our prior local LCP/CLS result does not establish real-user performance or cover AI waiting time.

## A relevant precedent, with limits

Awwwards' [NASA SPACECRAFTS entry](https://www.awwwards.com/sites/nasa-spacecrafts) demonstrates that an educational space instrument can receive SOTD. Its listed overall score is 7.3; creativity is 7.76, while the developer evaluation lists responsive design at 5.71 and an overall 6.48. This is a historical example, not a current benchmark or evidence that 3D is necessary. Our takeaway: a memorable concept and strong visual interaction can coexist with technical weaknesses. We should preserve the concept while removing those weaknesses, rather than copy its technology.

## Prioritized work for PSU-7

The estimates below are planning ranges for one experienced engineer/designer, assuming approved artwork can be obtained without many regeneration rounds. They exclude waiting for external/device feedback and are not additive delivery guarantees.

| Order | Work                                     | Why it helps                                                                                                                       | Concrete acceptance                                                                                                                                                                                                                                                                      | Rough effort                       |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1     | Curated complete worlds                  | Gives visitors a finished visual payoff without provider delays; strengthens design and content together.                          | Three contrasting worlds, each with approved orbital and surface images, frozen parameters and field notes; both views available without paid calls. Begin by completing one pair.                                                                                                       | 2–4 days, artwork review dependent |
| 2     | First-visit hierarchy                    | The mobile illustration still begins around 616px down the page in the audited fixture. Controls consume much of the first screen. | Put a compelling world and an obvious “Explore a world” action in the initial mobile view; make custom creation a clear secondary path; keep visual and keyboard order aligned.                                                                                                          | 1–2 days                           |
| 3     | One distinctive interaction              | Makes the scientific premise understandable through use.                                                                           | On curated worlds, an immediate orbital-to-surface switch with restrained motion; when adjusting assumptions, show calculated temperature/gravity/water-phase feedback promptly. Never change a finished AI image as if it had been regenerated, or claim a seamless geographic descent. | 1–2 days                           |
| 4     | Real visitor rehearsal                   | Automated mocks cannot validate provider reliability or final imagery.                                                             | Full production journey succeeds: generation, interpretation, both views, download, share in a fresh browser, reload, export/import; record latency and visual failures. Quota exhaustion still leaves a complete curated experience.                                                    | 1–2 days plus fixes                |
| 5     | Physical-device and accessibility review | Removes failures automated Chromium/axe checks cannot establish.                                                                   | iPhone Safari, desktop Firefox and Chromium; keyboard, VoiceOver/NVDA, zoom/reflow, reduced motion, focus order, slow/interrupted network; fix critical failures.                                                                                                                        | 1–2 days plus fixes                |
| 6     | Submission package                       | Helps reviewers understand the real project and choose representative entry media.                                                 | Approved thumbnail, desktop/mobile screenshots, short capture, description, credits, final hostname and social preview; all match the deployed version.                                                                                                                                  | About 1 day                        |

### What “curated” means here

Use a frozen mineral world, an airless rocky world and a temperate world with explicitly imagined biology. Retain the existing understated palette and scientific framing. Review every image pair for fictional land shapes, phase/coverage, atmospheric visibility, illumination, biological morphology and absence of unsupported objects. Verify the prose against the same parameters. Reject images with attractive but contradictory details.

The existing Boreal illustration is visually useful but ambiguous: blue/green regions can suggest liquid water and biology despite its frozen scenario. Its surface view is also missing from the bundled reference. Replacing or completing that example should be deliberate art direction, not a change to the physics formula to fit the picture.

The primary flow should work as: **open a complete world → switch perspectives → understand its conditions → optionally create a variation**. This is a recommended evolution, not functionality already implemented. Live generation remains available, but an unknown provider wait should not be the only route to the best experience.

### What would improve the craft

- Preserve the serif/monospace contrast, restrained gold, parchment and dark image stage. Tighten optical spacing, responsive line lengths and small labels across every state rather than replace the visual identity.
- Make the initial illustration feel integral to the instrument. Avoid a generic gallery bolted onto a form.
- Use a brief image reveal and coordinated viewpoint transition only after assets are decoded. Reduced-motion users should get the same content immediately.
- Make controls explain consequences: changing a star or pressure should help a visitor learn something before spending a generation request. Reuse the existing deterministic calculations; do not simulate a new climate system.
- Give each curated report one memorable physical insight in clear language. Keep calculated, estimated, assumed and imagined claims distinguishable.

These are design recommendations, not claims about secret jury preferences. A strong image collection alone will not compensate for confusing interaction; conversely, perfect tests will not create memorable art direction.

## Acceptance rehearsal before paying

Use five people unfamiliar with the project as a small qualitative check. This is a proposed internal gate, not an Awwwards rule or statistical experiment. Ask them to open a world, find its surface, explain one condition, create a variation and share it. Aim for all five to reach a complete world unaided and at least four to complete the rest without coaching. Note confusion and errors rather than merely asking whether they like the design.

Also verify:

- Both curated views remain available with live services disabled and after a quota limit.
- Slow image generation communicates state and does not block reading, navigation or another existing report.
- No live outputs present detected biology, acquired telemetry or speculative NASA environments as observed facts.
- Long catalogue names, invalid inputs, failed images and shared-report errors retain the same visual quality as the happy path.
- Initial rendering and responsiveness are measured separately from generation latency; a Lighthouse score is not the sole criterion.
- Desktop/mobile screenshots, social card and page title represent the final experience. No unverified real-device or accessibility certification claim is included.

## Entry materials and positioning

Suggested title: **PSU-7 — An instrument for possible worlds**.

Suggested description: “An interactive scientific field journal for fictional exoplanets. Explore curated worlds, shape planetary assumptions, and discover calculated conditions alongside AI-illustrated orbital and surface views.” Use this only after the curated experience exists; otherwise retain the current truthful description.

Prepare a 1600×1200 cover that shows the actual instrument and one strong planet, plus a short capture of opening a world, switching perspective, reading a condition and adjusting an assumption. A roughly 20–30-second capture is our recommendation, not an official required duration. Show actual interaction; do not edit out a slow request in a way that falsely implies instant live generation. Include mobile framing and credits for design/development, NASA data, fonts and AI illustrations.

Suggested descriptive categories, if offered by the form: Experimental, Culture & Education, Web & Interactive. These are positioning choices, not a separate easier judging pool. [Awwwards Honors](https://www.awwwards.com/honors/about) is a separate category-recognition system alongside normal SOTD evaluation. Its Typography category might fit if typography becomes a central achievement; Product is described as promoting/showcasing products, so do not assume every interactive app fits. Verify available choices at submission time.

After approval, share an honest project story with relevant design/science communities and existing contacts. Do not buy votes, create accounts to influence results, or assume traffic guarantees a qualifying community score. Keep the final URL stable and monitor real errors throughout judging. A membership purchase is not a substitute for improving the work.

## What to defer

Keep the interactive globe hidden. Defer terrain streaming, more rendering libraries, autoplay audio, custom cursors, scroll hijacking and decorative motion that competes with reading. Avoid adding accounts, a large gallery backend or a full climate simulator for this submission. These are low-return additions relative to a coherent, instantly available core experience.

**Next concrete milestone:** one fully reviewed, locally served orbital/surface pair with matching field notes and a clear first-visit path. Demonstrate that on an iPhone, then expand to three worlds and rehearse the complete live flow. Submit when that experience is consistently polished—not merely when the remaining code checks are green.

## Research provenance

Official evaluation, FAQ, pricing, terms, Honors, developer-award and NASA SPACECRAFTS pages were retrieved directly from Awwwards on 21 October 2026 after browser-search retrieval timed out. The developer document was obtained through the public link on the official Developer Award page. Google Web Vitals and W3C WCAG 2.2 references supply current technical guidance. Search surfaced third-party pricing/scoring summaries with inconsistencies; they were not used as authority for the rules above. Prices and policies should be rechecked at payment. No unpublished scoring formula, AI policy, jury preference or probability of winning is asserted.

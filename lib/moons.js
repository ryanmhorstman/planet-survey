// Which moons a world has, and how they look from its surface. Whether a moon
// formed at all (a giant impact, a capture) is imagined, repeatably from the
// world's physical settings; given that, sizes, distances, periods and sky
// sizes are calculated. Moons only orbit where moonStability() allows.

const EARTH_MASS_KG = 5.972e24,
  EARTH_RADIUS_M = 6.371e6,
  G = 6.674e-11,
  // Earth's Moon as seen from Earth's surface, in degrees.
  OUR_MOON_DEG = 0.518;

/** A repeatable generator from the physical settings alone, so the
 * biosphere and civilization art modes never add or remove a moon.
 * @param {import("./planet.js").Params} p */
function random(p) {
  const { biosphere: _b, civilization: _c, ...physical } = p;
  let seed = 2166136261;
  for (const char of JSON.stringify(
    Object.keys(physical)
      .sort()
      .map((key) => [
        key,
        physical[/** @type {keyof typeof physical} */ (key)],
      ]),
  ))
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {{massEarth: number, radiusKm: number, distancePlanetRadii: number,
 *   periodDays: number, skyDeg: number, vsOurMoon: number, kind: string}} Moon
 */

/**
 * @param {import("./planet.js").Params} p @param {any} physics
 * @returns {{moons: Moon[], origin: string | null}}
 */
export function moonSystem(p, physics) {
  const stability = physics.moons;
  if (!stability?.possible) return { moons: [], origin: null };
  const next = random(p),
    between = (/** @type {number} */ lo, /** @type {number} */ hi) =>
      lo * (hi / lo) ** next(),
    planetKg = p.massEarth * EARTH_MASS_KG,
    planetM = p.radiusEarth * EARTH_RADIUS_M,
    // Keep clear of the Roche limit and well inside the stable zone.
    inner = stability.rochePlanetRadii * 1.5,
    outer = stability.stablePlanetRadii * 0.6;
  if (outer <= inner) return { moons: [], origin: null };
  /** @type {{massEarth: number, density: number, distance: number, kind: string}[]} */
  let draft = [],
    origin = null;
  if (p.atmosphere.includes("hydrogen")) {
    // Regular satellites hold about 1e-4 of their giant's mass between them
    // (Canup & Ward 2006), spaced outward by roughly 1.6 each, as Jupiter's.
    const count = 2 + Math.floor(next() * 4),
      weights = Array.from({ length: count }, () => 0.3 + next()),
      total = weights.reduce((a, b) => a + b, 0);
    let distance = Math.max(inner, 5);
    for (const weight of weights) {
      if (distance > outer) break;
      draft.push({
        massEarth: (1e-4 * p.massEarth * weight) / total,
        density: 2500,
        distance,
        kind: "icy",
      });
      distance *= 1.5 + next() * 0.3;
    }
    origin = "formed with the planet from its disk of gas and dust";
  } else if (p.massEarth >= 0.5) {
    // A large moon needs a giant impact; Earth's is an unusual outcome.
    if (next() < 0.35) {
      draft.push({
        massEarth: p.massEarth * between(0.002, 0.012),
        density: 3300,
        distance: Math.min(outer, between(Math.max(inner, 15), 60)),
        kind: "rocky",
      });
      origin = "imagined as debris from a giant impact, as Earth's Moon was";
    }
  } else {
    // Small worlds catch small, dark moonlets, as Mars did.
    for (const _ of [0, 1])
      if (next() < 0.5)
        draft.push({
          massEarth:
            ((between(5, 30) * 1000) ** 3 * (4 / 3) * Math.PI * 1900) /
            EARTH_MASS_KG,
          density: 1900,
          distance: Math.min(outer, between(Math.max(inner, 2.8), 7)),
          kind: "captured",
        });
    if (draft.length)
      origin =
        draft.length === 1
          ? "imagined as a captured asteroid, like Mars's moons"
          : "imagined as captured asteroids, as Mars's moons are";
  }
  const moons = draft
    .map(({ massEarth, density, distance, kind }) => {
      const kg = massEarth * EARTH_MASS_KG,
        radiusM = ((3 * kg) / (4 * Math.PI * density)) ** (1 / 3),
        a = distance * planetM,
        // From the surface, the moon is one planet radius nearer than the center.
        skyDeg = (2 * Math.atan(radiusM / (a - planetM)) * 180) / Math.PI;
      return {
        massEarth,
        radiusKm: radiusM / 1000,
        distancePlanetRadii: distance,
        periodDays:
          (2 * Math.PI * Math.sqrt(a ** 3 / (G * (planetKg + kg)))) / 86400,
        skyDeg,
        vsOurMoon: skyDeg / OUR_MOON_DEG,
        kind,
      };
    })
    .sort((a, b) => b.vsOurMoon - a.vsOurMoon);
  return { moons, origin: moons.length ? origin : null };
}

// The surface camera's horizontal field of view, in degrees.
const FRAME_DEG = 60;
/** A moon's width as a share of the image, which an image model can follow
 * where "as wide as Earth's Moon" alone gets drawn many times too large.
 * @param {Moon} moon */
const frameShare = (moon) => {
  const percent = (100 * moon.skyDeg) / FRAME_DEG;
  return percent < 1
    ? `under 1% of the image width, a small disc`
    : `about ${about(percent)}% of the image width`;
};

/**
 * How the moons in the sky are drawn, for the image prompts. Sizes are given
 * against Earth's Moon, the one reference an image model knows, and as a share
 * of the frame, so they are drawn at true scale.
 * @param {Moon[]} moons Visible moons, largest first. @param {boolean} night
 * @param {boolean} [clear] No air to soften them, by day or night.
 */
export function moonSkyText(moons, night, clear = false) {
  const one = moons.length === 1,
    kinds = new Set(moons.map((moon) => moon.kind)),
    surface = kinds.has("icy")
      ? `${one ? "It is a" : "They are"} pale, icy ${one ? "world" : "worlds"} with cracked, streaked surfaces.`
      : kinds.has("rocky")
        ? `${one ? "It is" : "They are"} grey, cratered rock with ${one ? "its" : "their"} own pattern of darker plains, not the familiar face of Earth's Moon.`
        : `${one ? "It is" : "They are"} small, dark and irregular, lumpy captured ${one ? "asteroid" : "asteroids"}.`;
  return `${one ? "One moon" : `${COUNT[moons.length] ?? moons.length} moons`} ${night ? (one ? "hangs" : "hang") : one ? "shows pale" : "show pale"} in the ${night ? "night" : "daytime"} sky: ${moons
    .map(
      (moon) =>
        `one ${about(moon.vsOurMoon)}× the apparent width of Earth's Moon as seen from Earth, ${frameShare(moon)}`,
    )
    .join(
      "; ",
    )}. Keep these true sizes: in a wide view like this even Earth's Moon is only about 1% of the image width, so do not enlarge them. ${surface} ${one ? "It is lit by the star and shows a phase" : "All are lit from the same side, the star's direction, so their bright edges face the same way"}. ${
    // What a real camera records, so they read as part of the scene.
    night
      ? "Photograph it as one real exposure: the lit part of each moon is the brightest thing in the scene, a soft, slightly glowing disc with only faint, blurred markings at this size, never a crisp, high-contrast cutout; its light gently lights the land from its side, with faint shadows."
      : clear
        ? "With no air to soften them, the lit parts are crisp against the black sky and the unlit parts are invisible."
        : "By day each moon is faint and low-contrast, washed out by the bright sky, with the sky's color showing through its unlit part; never an opaque cutout."
  } No other moons.`;
}

/** Moons big enough to show as a disc rather than a point of light. */
export const visibleMoons = (/** @type {Moon[]} */ moons) =>
  moons.filter((moon) => moon.vsOurMoon >= 0.1);

const COUNT = ["No", "One", "Two", "Three", "Four", "Five"];
/** @param {number} n */
const about = (n) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 1 : 0 });

/**
 * One plain sentence about the moons, for the visitor section, the facts
 * panel and the field-note fact sheet.
 * @param {any} physics @param {{moons: Moon[], origin: string | null}} system
 */
export function describeMoons(physics, system) {
  const { moons, origin } = system;
  if (!moons.length)
    return physics.moons?.possible
      ? "None. Moons could orbit here, but none formed."
      : `None: ${physics.moons?.reason ?? "no moon orbits are modeled"}.`;
  const [largest] = moons,
    size =
      largest.vsOurMoon >= 0.1
        ? `the largest looks ${about(largest.vsOurMoon)}× as wide as our Moon`
        : "too small to show a disc, it crosses the sky as a bright point";
  return `${COUNT[moons.length] ?? moons.length} ${moons.length === 1 ? "moon" : "moons"}, ${origin}; ${moons.length === 1 ? size.replace("the largest", "it") : size}, circling every ${about(largest.periodDays)} days.`;
}

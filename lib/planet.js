// Shared by the browser and API. These are educational estimates, not a climate model.
export const MODEL_VERSION = 2;
export const STARS = {
  'G-type (Sun-like)': { mass: 1, luminosity: 1, radius: 1, light: 'warm white' },
  'K-type (orange dwarf)': { mass: 0.7, luminosity: 0.25, radius: 0.7, light: 'warm cream' },
  'M-type (red dwarf)': { mass: 0.3, luminosity: 0.012, radius: 0.3, light: 'warm orange-white' },
  'F-type (yellow-white)': { mass: 1.3, luminosity: 2.5, radius: 1.3, light: 'white' },
  'binary star system': { mass: 1.7, luminosity: 1.8, radius: 1, light: 'white and amber' },
};
export const ZONES = {
  'inner edge (very hot)': 0.72, 'inner habitable zone': 0.95,
  'middle habitable zone': 1, 'outer habitable zone': 1.4, 'outer edge (very cold)': 1.7,
};
export const ATMOSPHERES = {
  'nitrogen-oxygen (Earth-like)': { pressure: 1, albedo: 0.3, greenhouse: 33, suitability: 1 },
  'thick CO2 (Venus-like)': { pressure: 90, albedo: 0.65, greenhouse: 420, suitability: 0.1 },
  'thin nitrogen': { pressure: 0.2, albedo: 0.3, greenhouse: 5, suitability: 0.6 },
  'methane-rich': { pressure: 1.5, albedo: 0.3, greenhouse: 80, suitability: 0.3 },
  'hydrogen-helium envelope': { pressure: 10, albedo: 0.5, greenhouse: 60, suitability: 0 },
  'none (airless body)': { pressure: 0, albedo: 0.1, greenhouse: 0, suitability: 0 },
};
export const DEFAULTS = Object.freeze({ starType: 'G-type (Sun-like)', orbital: 'middle habitable zone',
  atmosphere: 'nitrogen-oxygen (Earth-like)', water: 70, massEarth: 1, radiusEarth: 1,
  tilt: 23, rotationHours: 24, pressureBar: 1, biosphere: 'familiar' });

export class InputError extends Error {}
export function object(value, name = 'Input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${name} must be an object.`);
  return value;
}
export function finite(value, min, max, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new InputError(`${name} must be between ${min} and ${max}.`);
  return value;
}
export function shortText(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    throw new InputError(`${name} must be nonempty text of at most ${max} characters.`);
  return value.trim();
}
export function validateParams(input) {
  object(input, 'Parameters');
  const result = {};
  for (const [key, choices] of Object.entries({ starType: STARS, orbital: ZONES, atmosphere: ATMOSPHERES })) {
    if (typeof input[key] !== 'string' || !Object.hasOwn(choices, input[key])) throw new InputError(`Choose a supported ${key}.`);
    result[key] = input[key];
  }
  for (const [key, min, max] of [['water', 0, 100], ['massEarth', 0.001, 10000], ['radiusEarth', 0.01, 100],
    ['tilt', 0, 90], ['rotationHours', 1, 1000000], ['pressureBar', 0, 1000]]) {
    result[key] = finite(input[key], min, max, key);
  }
  result.biosphere = input.biosphere === undefined ? 'familiar' : input.biosphere;
  if (!['none', 'familiar', 'alien'].includes(result.biosphere)) throw new InputError('Choose None, Familiar or Alien for the imagined biosphere.');
  if (result.atmosphere.includes('none')) {
    if (result.pressureBar !== 0 || result.water !== 0) throw new InputError('An airless surface requires zero pressure and exposed water coverage.');
  } else if (result.pressureBar <= 0) throw new InputError('An atmosphere requires a positive pressure assumption.');
  if (result.atmosphere.includes('hydrogen') && result.water !== 0) throw new InputError('A gas envelope has no assigned surface-water coverage.');
  return result;
}

const CATALOG_FIELDS = {
  pl_rade: [0.01, 100], pl_bmasse: [0.001, 10000], pl_eqt: [1, 10000],
  pl_orbper: [0.001, 1e8], pl_orbsmax: [0.00001, 100000],
  st_mass: [0.001, 1000], st_rad: [0.001, 10000], st_lum: [-12, 12],
};
export function validateCatalog(input) {
  if (input == null) return null;
  object(input, 'Catalogue record');
  const record = { pl_name: shortText(input.pl_name, 100, 'Planet name'),
    hostname: shortText(input.hostname || input.pl_name, 100, 'Host name'),
    st_spectype: typeof input.st_spectype === 'string' ? input.st_spectype.slice(0, 40) : null };
  for (const [key, [min, max]] of Object.entries(CATALOG_FIELDS))
    record[key] = input[key] == null ? null : finite(input[key], min, max, key);
  return record;
}
export function validateSurvey(input) {
  object(input);
  if (Object.keys(input).some(key => !['params', 'catalog', 'view'].includes(key)))
    throw new InputError('Send survey parameters, not a custom prompt.');
  const params = validateParams(input.params), catalog = validateCatalog(input.catalog);
  for (const [field, key] of [['massEarth', 'pl_bmasse'], ['radiusEarth', 'pl_rade']]) {
    if (catalog?.[key] != null && params[field] !== catalog[key]) throw new InputError('Catalogue mass and radius must be preserved. Detach the catalogue record to create a fictional variation.');
  }
  return { params, catalog };
}
export function paramsFromCatalog(record) {
  const c = validateCatalog(record);
  const match = Object.keys(STARS).find(s => s.startsWith((c.st_spectype || '').charAt(0).toUpperCase() + '-type'));
  const params = { ...DEFAULTS, starType: match || DEFAULTS.starType,
    massEarth: c.pl_bmasse ?? 1, radiusEarth: c.pl_rade ?? 1 };
  if (params.radiusEarth > 2.5) { params.atmosphere = 'hydrogen-helium envelope'; params.water = 0; params.pressureBar = 10; }
  return params;
}
export function calcESI(mass, radius, escapeKms, temperatureC) {
  const quantities = [[radius, 1, 0.57], [mass / radius ** 3, 1, 1.07],
    [escapeKms, 11.186, 0.70], [temperatureC + 273.15, 288, 5.58]];
  return quantities.reduce((score, [value, reference, weight]) =>
    score * (Math.max(0, 1 - Math.abs(value - reference) / (value + reference))) ** (weight / 4), 1);
}
export function waterState(temperature, pressure, water) {
  if (!water) return 'No exposed water assigned';
  if (pressure < 0.00612) return 'Exposed liquid unstable';
  if (temperature >= 373.946 && pressure >= 220.64) return 'Supercritical conditions possible';
  if (temperature < 0) return 'Ice favored';
  const [a, b, c] = pressure <= 1 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485];
  const boiling = b / (a - Math.log10(pressure * 750.062)) - c;
  return temperature > boiling ? 'Vapor favored' : 'Liquid water plausible';
}
export function classify(p, physics) {
  if (p.atmosphere.includes('hydrogen')) return 'CLASS J — GAS-SHROUDED';
  if (p.atmosphere.includes('none')) return 'CLASS D — AIRLESS';
  if (physics.temperatureC < 0) return p.water > 0 ? 'CLASS P — GLACIAL' : 'CLASS K — COLD DESERT';
  if (physics.temperatureC > 60) return 'CLASS H — HOTHOUSE';
  if (p.water <= 20) return 'CLASS K — ARID';
  if (physics.temperatureC > 35) return 'CLASS W — WARM';
  if (p.water > 80) return 'CLASS O — OCEANIC';
  return 'CLASS M — TEMPERATE';
}
export function calculate(input, catalogInput = null) {
  const { params: p, catalog } = validateSurvey({ params: input, catalog: catalogInput }), atmosphere = ATMOSPHERES[p.atmosphere];
  const star = { ...STARS[p.starType] };
  if (catalog?.st_mass != null) star.mass = catalog.st_mass;
  if (catalog?.st_lum != null) star.luminosity = 10 ** catalog.st_lum;
  if (catalog?.st_rad != null) star.radius = catalog.st_rad;
  const au = catalog?.pl_orbsmax ?? (catalog?.pl_orbper != null
    ? ((catalog.pl_orbper / 365.25) ** 2 * (star.mass + p.massEarth / 332946)) ** (1 / 3)
    : ZONES[p.orbital] * Math.sqrt(star.luminosity));
  const yearDays = catalog?.pl_orbper ?? 365.25 * Math.sqrt(au ** 3 / (star.mass + p.massEarth / 332946));
  const equilibriumK = catalog?.pl_eqt ?? 278.5 * (star.luminosity * (1 - atmosphere.albedo)) ** 0.25 / Math.sqrt(au);
  const greenhouseK = atmosphere.pressure === 0 ? 0 : atmosphere.greenhouse * Math.log1p(p.pressureBar) / Math.log1p(atmosphere.pressure);
  const temperatureC = equilibriumK + greenhouseK - 273.15;
  const gravityG = p.massEarth / p.radiusEarth ** 2;
  const escapeKms = Math.sqrt(2 * 6.67430e-11 * p.massEarth * 5.9722e24 / (p.radiusEarth * 6.371e6)) / 1000;
  const density = 5.514 * p.massEarth / p.radiusEarth ** 3;
  const solarFrequency = Math.abs(1 / p.rotationHours - 1 / (yearDays * 24));
  const solarDayHours = solarFrequency < 1e-9 ? null : 1 / solarFrequency;
  const phase = waterState(temperatureC, p.pressureBar, p.water);
  const gas = p.atmosphere.includes('hydrogen'), airless = p.atmosphere.includes('none');
  const weights = [
    { name: 'Mean temperature', max: 40, value: Math.max(0, 1 - Math.abs(temperatureC - 15) / 65) },
    { name: 'Exposed liquid water', max: 25, value: phase === 'Liquid water plausible' ? Math.min(1, p.water / 50) : 0 },
    { name: 'Pressure assumption', max: 20, value: p.pressureBar > 0 ? Math.max(0, 1 - Math.abs(Math.log10(p.pressureBar)) / 2) : 0 },
    { name: 'Atmosphere assumption', max: 15, value: atmosphere.suitability },
  ].map(f => ({ ...f, value: airless ? 0 : f.value, points: airless ? 0 : Math.round(f.max * f.value) }));
  const score = gas ? null : airless ? 0 : weights.reduce((sum, f) => sum + f.points, 0);
  const warnings = [];
  if (density < 3 || p.radiusEarth > 1.6) warnings.push('A volatile-rich interior or envelope is plausible. A rocky surface is an assumption.');
  if (density > 12 || density < 0.1) warnings.push('This mass–radius combination implies an unusual bulk density; check the composition assumptions.');
  if (p.starType.includes('M-type')) warnings.push('Tidal evolution may affect rotation. Age, eccentricity and tidal dissipation are unknown; synchronous rotation is not assumed.');
  if (p.starType.includes('binary')) warnings.push('The binary uses combined stellar properties as a distant point source; orbital stability and separate stellar positions are not modeled.');
  if (p.tilt > 45) warnings.push('High obliquity may produce strong seasonal contrasts. Seasonal temperatures are not calculated.');
  if (catalog) warnings.push('Atmosphere, water, pressure, rotation and tilt are scenario assumptions, not detections on this exoplanet.');
  if (catalog && !/^[FGKM]/i.test(catalog.st_spectype || '')) warnings.push('The catalogue has no supported spectral class. The selected star class is an illustrative assumption; available stellar mass, radius and luminosity still take precedence.');
  const physics = { star, au, yearDays, equilibriumK, greenhouseK, temperatureC, gravityG, escapeKms, density,
    solarDayHours, solarDaysPerYear: solarDayHours == null ? null : yearDays * 24 / solarDayHours,
    angularDiameter: 2 * Math.atan(star.radius * 695700 / (au * 149597870.7)) * 180 / Math.PI,
    waterState: phase, score, factors: weights, warnings,
    esi: gas ? null : calcESI(p.massEarth, p.radiusEarth, escapeKms, temperatureC),
    orbitSource: catalog?.pl_orbper != null ? 'Catalogued orbital period' : 'Kepler estimate',
    temperatureSource: catalog?.pl_eqt != null ? 'Catalogue equilibrium estimate + assumed greenhouse' : 'Simplified energy-balance estimate',
  };
  physics.classification = classify(p, physics);
  return physics;
}

export function biosphereSpec(p, physics) {
  const mode = p.biosphere ?? 'familiar', alien = mode === 'alien';
  const present = mode !== 'none' && physics.waterState === 'Liquid water plausible' &&
    physics.temperatureC >= 0 && physics.temperatureC <= (alien ? 60 : 45) &&
    p.pressureBar >= (alien ? 0.1 : 0.2) && p.pressureBar <= (alien ? 10 : 5) &&
    p.water > 0 && (alien || p.water < 100) && !/hydrogen|none/.test(p.atmosphere) &&
    (alien || ['nitrogen-oxygen (Earth-like)', 'thin nitrogen'].includes(p.atmosphere));
  if (!present) return { mode, present: false, reason: mode === 'none' ? 'Vegetation intentionally omitted.'
    : 'No vegetation depicted under these modeled surface conditions; this is an artistic constraint, not a verdict on life.' };
  const star = p.starType.charAt(0);
  const alienPalettes = { G: 'burnished copper, muted vermilion and deep plum', K: 'dusky violet, indigo and copper',
    M: 'oxblood burgundy, near-black violet and glossy midnight blue', F: 'silvery ivory, lavender and deep violet', b: 'amber, smoky indigo and bronze' };
  const palette = alien ? alienPalettes[star] : star === 'M' ? 'deep burgundy and charcoal-violet'
    : star === 'K' ? 'dark teal-green and moss green with occasional copper tips'
    : 'deep forest green and blue-green with muted golden groundcover';
  const collectors = { G: 'spiraling pleated rosettes and branching ribbon fans', K: 'stacked frilled crowns and folded ribbon vanes',
    M: 'broad overlapping membrane fans and folded sail-shaped lobes', F: 'waxy folded cups and reflective ribbed vanes', b: 'layered twisted vanes and branching rosettes' };
  let forms = alien ? collectors[star] : 'layered fernlike canopies, branching frond groves and mosslike groundcover';
  if (alien) {
    forms = p.water === 100 ? 'floating interlocking rosette colonies and buoyant ribbed bladders; no rooted trees or exposed land'
      : physics.gravityG > 1.4 ? `low interlocking cushions and squat radial domes carrying ${collectors[star]}`
      : p.pressureBar < 0.5 || physics.temperatureC < 8 ? `compact ground-hugging mats with small ${collectors[star]}`
      : physics.gravityG < 0.8 ? `tall slender branching stalks supporting ${collectors[star]}`
      : `waist-high branching structures with ${collectors[star]}`;
  } else if (physics.gravityG > 1.5) forms = 'low, dense fernlike mats and squat branching shrubs';
  const habitat = p.water === 100 ? 'Patchy floating colonies on the ocean surface, separated by broad open water.'
    : p.water <= 20 ? 'Sparse drought-adapted clusters near isolated water margins; most terrain remains bare.'
    : physics.temperatureC > 35 ? 'Sparse folded growth concentrated in shaded channels and wet depressions; broad exposed slopes remain bare.'
    : p.water > 80 ? 'Buoyant colonies in sheltered shallows and dense growth on small island margins, with broad open seas.'
    : 'Patchy growth in coastal lowlands and valleys, thinning across exposed ridges.';
  return { mode, present, palette, forms, habitat,
    seasonal: p.tilt > 45 ? 'Invent a mosaic of dormant patches and active growth as a seasonal artistic motif; no seasonal climate has been calculated.' : 'Use irregular transitions between growth and bare ground.',
    atmosphere: p.atmosphere.includes('methane') ? 'View the invented forms through amber haze; their metabolism and pigments are unspecified.' : 'Keep the specified atmospheric light and haze.' };
}
export function visualSpec(p, physics) {
  const gas = p.atmosphere.includes('hydrogen'), airless = p.atmosphere.includes('none');
  const frozen = physics.waterState === 'Ice favored';
  const liquid = physics.waterState === 'Liquid water plausible';
  // Artistic choices are deterministic across both viewpoints; they are not life predictions.
  const biology = biosphereSpec(p, physics), vegetation = biology.present;
  const foliage = biology.palette, forms = biology.forms;
  let hash = 2166136261;
  const { biosphere: _artMode, ...physicalParams } = validateParams(p);
  for (const char of JSON.stringify(physicalParams)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const layouts = [
    'three unequal lobed landmasses separated by a diagonal ocean, with deeply branching inland seas and scattered offshore islands',
    'a broken crescent of broad landmasses enclosing an irregular inland ocean, with a separate cluster of small polar islands',
    'several elongated landmasses running obliquely across the globe, divided by winding ocean channels and chains of small islands',
    'two broad jagged landmasses offset into opposite hemispheres, each pierced by branching gulfs, plus an asymmetric island arc',
  ];
  const geography = gas ? 'Atmospheric bands and vortices only; no continents.'
    : p.water === 100 && (liquid || frozen) ? `An uninterrupted global ${frozen ? 'ice sheet' : 'ocean'} with no exposed land or islands.`
    : p.water === 0 || airless || (!liquid && !frozen) ? 'Original impact basins, branching rifts and asymmetric highlands; no open liquid seas or terrestrial coastal outlines.'
    : p.water > 80 ? 'A largely unbroken ocean or ice sheet with scattered irregular island chains and small disconnected landmasses; no large continents.'
    : `${layouts[hash % layouts.length]}. Scale ocean basins to the assigned ${p.water}% water/ice inventory; the rest is land.`;
  const palette = gas ? 'muted ivory and slate blue' : frozen ? 'chalk white, glacial blue and dark basalt'
    : vegetation ? `deep blue water, pale mineral ridges, ${foliage} vegetation`
    : p.water <= 20 ? 'ochre, umber and charcoal' : 'deep blue, weathered stone and muted copper';
  const terrain = gas ? 'layered atmospheric clouds; no visible solid surface'
    : airless ? 'cratered stone and regolith, without haze or exposed liquid'
    : frozen ? `${p.water}% water/ice inventory, mostly ice-covered basins with exposed rocky ridges`
    : liquid ? `${p.water}% liquid-water coverage, ${100 - p.water}% exposed land; irregular coastlines and weathered rock`
    : 'dry exposed mineral terrain; no open liquid-water seas';
  return { palette, terrain, geography, vegetation, biology, view: gas ? 'Cloud deck' : 'Surface',
    sky: airless ? 'black sky without atmospheric scattering' : p.atmosphere.includes('CO2') ? 'dense pale mineral haze, without an assumed sulfur chemistry'
      : p.atmosphere.includes('methane') ? 'a muted amber haze as an illustrative atmospheric interpretation'
      : 'subtle atmospheric scattering under the specified stellar illumination; sky color is illustrative',
    illumination: `${physics.star.light} illumination; representative stellar angular diameter ${physics.angularDiameter.toFixed(2)} degrees`,
    biosphere: vegetation
      ? `No biosphere is established. Include visible speculative vegetation as an artistic scenario: ${forms}, colored ${foliage}. ${biology.habitat} ${biology.seasonal} ${biology.atmosphere} On the orbital view, show irregular patches of the specified pigment at planetary scale; individual structures are too small to resolve. On the surface view, feature these exact forms and pigments prominently in the foreground and repeat them in the distance. ${biology.mode === 'alien' ? 'ALIEN morphology is essential: no familiar Earth trees, ferns, palms, grass or flowers; do not merely recolor a terrestrial forest. Use physically textured organic surfaces, no neon glow or magical effects.' : 'Use recognizable vegetation-like silhouettes without copying a particular terrestrial landscape.'} No animals, settlements or spacecraft. These colors and forms are invented, not inferred biology.`
      : 'No biosphere is established. Depict mineral, ice or cloud scenery only: no forests, plants, animals, settlements, spacecraft or invented biological structures.',
  };
}
export function localNarrative(p, physics) {
  const interpretation = visualSpec(p, physics);
  return { description: `An imagined ${physics.classification.split(' — ')[1].toLowerCase()} world is rendered in ${interpretation.palette}. ` +
    `${interpretation.terrain.charAt(0).toUpperCase() + interpretation.terrain.slice(1)} shape this illustrative survey. ` +
    (interpretation.vegetation ? `Imagined ${interpretation.biology.forms} add a speculative vegetation layer; this is not evidence of life. ` : '') +
    `The simplified model estimates a mean temperature of ${Math.round(physics.temperatureC)}°C; local weather, geology and any biosphere remain unknown.`,
    surfaceFeatures: interpretation.terrain };
}
export function validateNarrative(input) {
  object(input, 'Narrative');
  return { description: shortText(input.description, 1600, 'Description'), surfaceFeatures: shortText(input.surfaceFeatures, 500, 'Surface features') };
}
export function analysisPrompt(p, physics, catalog) {
  return `Write a short, evocative field report for a speculative planetary instrument. Distinguish calculated quantities, model estimates and imagined scenery. Never present a biosphere, atmospheric composition on a catalogued planet, pressure, weather, geological activity or terrain as an observation. Do not invent moons, companion planets, permanent twilight, tidal heating, volcanism, numerical ice thickness, life detection or biological intelligence. Do not infer geothermal activity from orbital period. No claims of breathable air, guaranteed UV protection, acid rain or precise climate. Alternative-solvent chemistry is not synonymous with non-carbon life. Do not generate or revise a score.\n` +
    `Operator assumptions: ${JSON.stringify(p)}\nCatalogue context: ${catalog ? JSON.stringify(catalog) : 'Fictional world'}\n` +
    `Model estimates (not authoritative observations): ${JSON.stringify(physics)}\n` +
    `Shared artistic interpretation: ${JSON.stringify(visualSpec(p, physics))}\n` +
    'If the artistic interpretation includes vegetation, describe it explicitly as imagined vegetation, not a detected biosphere. Otherwise do not add plants or forests. Physical similarity to Earth never implies familiar terrestrial continents.\n' +
    'Return ONLY a JSON object with description (3 concise sentences, at most 1000 characters; explicitly imaginative) and surfaceFeatures (one sentence, at most 400 characters).';
}
export function imagePrompt(p, physics, view) {
  if (!['orbital', 'surface'].includes(view)) throw new InputError('Choose orbital or surface view.');
  const spec = visualSpec(p, physics), gas = p.atmosphere.includes('hydrogen');
  const perspective = view === 'orbital'
    ? 'A complete planetary globe viewed from orbit, with generous black margins. Keep the full limb in frame. The star is outside the frame. No ground-level foreground.'
    : gas ? 'An atmospheric probe view inside the upper cloud deck. Clouds extend to the horizon; no ground, rocks, mountains, oceans or solid surface.'
      : p.water === 100 && physics.waterState === 'Liquid water plausible'
        ? 'A camera at the ocean waterline, looking across open water toward its horizon. No exposed land. The planet itself cannot appear in its own sky.'
        : 'A ground-level camera physically standing on this planet, looking across a landscape toward its horizon. The planet itself cannot appear in its own sky.';
  return `Create an ORIGINAL EXOPLANET with entirely invented geography. Design the map from scratch: ${spec.geography} Never reuse a terrestrial globe texture, Earth map, familiar continent silhouettes or their arrangement, even when the physical conditions resemble Earth. Invent fresh coastlines and basin shapes; do not merely rotate or recolor an Earth globe.\n` +
    `Scientifically thoughtful, photorealistic artist interpretation, not an observation. ${perspective}\n` +
    `${JSON.stringify(spec)}\nMean temperature estimate ${Math.round(physics.temperatureC)} C. Pressure assumption ${p.pressureBar} bar. Gravity ${physics.gravityG.toFixed(2)} Earth gravities. Water phase: ${physics.waterState}. ` +
    'Preserve the same terrain, water inventory and palette between orbital and surface views. Do not turn gravity alone into a different atmospheric thickness. ' +
    'No moons, neighboring planets, oversized celestial globes, rings, galaxies or extra celestial bodies. Use indirect illumination; show no stellar disk in the sky, avoiding unsupported apparent sizes or binary geometry. ' +
    'No text, labels, borders or symbols. No recognizable Earth continents. Landscape, cloud arrangements and colors are speculative, not scientific detections.';
}

export function createReport({ params, catalog = null, name, id, narrative, images = {}, sample = false }) {
  const p = validateParams(params), c = validateCatalog(catalog), physics = calculate(p, c);
  return { version: MODEL_VERSION, id: id || globalThis.crypto.randomUUID(),
    name: c?.pl_name || shortText(name || 'Uncharted world', 100, 'Report name'),
    params: p, catalog: c, physics, narrative: narrative ? validateNarrative(narrative) : localNarrative(p, physics),
    narrativeKind: 'model', images, sample, createdAt: new Date().toISOString() };
}
export function sampleReport() {
  return createReport({ id: 'boreal-reference', name: 'Boreal · Reference 07', sample: true,
    params: { ...DEFAULTS, orbital: 'outer habitable zone', water: 85 },
    narrative: { description: 'Boreal is an imagined ice-rich world: blue basins lie between pale frozen expanses and weathered mineral terrain. This reference illustration suggests a landscape shaped by cold, without claiming a measured climate or a detected biosphere. Adjust its assumptions to begin your own survey.', surfaceFeatures: 'Glacial blue basins, white ice fields and exposed ochre mineral terrain.' },
    images: { orbital: { url: '/assets/sample-orbital.webp', kind: 'reference' } } });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, ATMOSPHERES, calculate, validateParams, validateSurvey, paramsFromCatalog, waterState, imagePrompt, createReport, sampleReport, visualSpec } from '../lib/planet.js';
import { restoreReport, serializeReport, restoreLegacy, safeAsset } from '../lib/client-report.js';
const p = { ...DEFAULTS };
test('Earth reference agrees with gravity, escape velocity, year and ESI', () => {
  const f = calculate(p);
  assert.equal(f.gravityG, 1); assert.ok(Math.abs(f.escapeKms - 11.186) < .01);
  assert.ok(Math.abs(f.yearDays - 365.25) < .01); assert.ok(f.esi > .99);
  assert.ok(Math.abs(f.temperatureC - 14.6) < .1); assert.equal(f.score, 100);
  assert.ok(f.solarDayHours > 24 && f.solarDayHours < 24.1);
});
test('period includes stellar mass and units distinguish rotation from solar days', () => {
  const c = { pl_name: 'Test b', hostname: 'Test', pl_orbsmax: 1, st_mass: .25 };
  const f = calculate(p, c); assert.ok(Math.abs(f.yearDays - 730.5) < .01);
  const locked = calculate({ ...p, rotationHours: f.yearDays * 24 }, c);
  assert.equal(locked.solarDayHours, null); assert.equal(locked.solarDaysPerYear, null);
});
test('hot and frozen red-dwarf worlds cannot receive temperate liquid-ocean classes', () => {
  assert.match(calculate({ ...p, orbital: 'inner edge (very hot)' }).classification, /HOTHOUSE/);
  const cold = calculate({ ...p, starType: 'M-type (red dwarf)', orbital: 'outer edge (very cold)' });
  assert.match(cold.classification, /GLACIAL/); assert.equal(cold.waterState, 'Ice favored');
  assert.ok(cold.warnings.some(w => w.includes('synchronous rotation is not assumed')));
});
test('water-phase claims require temperature and pressure together', () => {
  assert.equal(waterState(400, 1, 70), 'Vapor favored');
  assert.equal(waterState(400, 300, 70), 'Supercritical conditions possible');
  assert.equal(waterState(20, .001, 70), 'Exposed liquid unstable');
  assert.equal(waterState(20, 1, 70), 'Liquid water plausible');
  assert.equal(waterState(-20, 1, 70), 'Ice favored');
});
test('surface suitability is deterministic, explainable, and distinct from ESI', () => {
  const dry = calculate({ ...p, water: 0 }), wet = calculate(p);
  assert.equal(dry.esi, wet.esi); assert.equal(wet.score - dry.score, 25);
  assert.equal(wet.score, wet.factors.reduce((sum, f) => sum + f.points, 0));
  const gas = calculate({ ...p, atmosphere: 'hydrogen-helium envelope', pressureBar: 10, water: 0 });
  assert.equal(gas.score, null); assert.equal(gas.esi, null);
  const airless = calculate({ ...p, atmosphere: 'none (airless body)', pressureBar: 0, water: 0 });
  assert.equal(airless.score, 0); assert.equal(airless.factors.reduce((sum, f) => sum + f.points, 0), 0);
});
test('catalogue values remain exact, including measurements outside UI default ranges', () => {
  const c = { pl_name: 'Measured b', hostname: 'Measured', pl_rade: 3.7123, pl_bmasse: 12.8432, pl_orbper: 12.3, pl_orbsmax: .12, pl_eqt: 260, st_mass: .7, st_spectype: 'K2' };
  const params = paramsFromCatalog(c), r = createReport({ params, catalog: c });
  assert.equal(r.name, c.pl_name); assert.equal(r.params.massEarth, c.pl_bmasse); assert.equal(r.params.radiusEarth, c.pl_rade);
  assert.equal(r.physics.yearDays, 12.3); assert.equal(r.physics.au, .12); assert.equal(r.physics.equilibriumK, 260);
  assert.equal(params.water, 0); assert.equal(params.pressureBar, 10);
  assert.throws(() => calculate({ ...params, massEarth: 3 }, c), /must be preserved/);
});
test('invalid ranges and incompatible atmosphere settings are rejected server-side', () => {
  for (const value of [NaN, Infinity, '1', null, -1]) assert.throws(() => validateParams({ ...p, massEarth: value }));
  assert.throws(() => validateParams({ ...p, atmosphere: 'none (airless body)' }));
  assert.throws(() => validateParams({ ...p, atmosphere: 'hydrogen-helium envelope', water: 70 }));
  assert.throws(() => validateSurvey({ params: p, prompt: 'arbitrary generation' }), /custom prompt/);
});
test('density warnings do not silently reinterpret unusual worlds as terrestrial', () => {
  const f = calculate({ ...p, massEarth: 2.3, radiusEarth: 1.7 });
  assert.ok(Math.abs(f.density / 5.514 - .46815) < .00001);
  assert.ok(f.warnings.some(w => w.includes('rocky surface is an assumption')));
});
test('both image views share a deterministic visual specification and ignore model prose', () => {
  const f = calculate(p);
  assert.deepEqual(visualSpec(p, f), visualSpec(p, f));
  for (const view of ['orbital', 'surface']) {
    const prompt = imagePrompt(p, f, view);
    assert.ok(prompt.includes(visualSpec(p, f).palette)); assert.match(prompt, /70% liquid-water coverage/);
    assert.match(prompt, /No moons/); assert.match(prompt, /No biosphere is established/);
  }
  assert.match(imagePrompt(p, f, 'surface'), /planet itself cannot appear in its own sky/);
  const gas = { ...p, atmosphere: 'hydrogen-helium envelope', pressureBar: 10, water: 0 };
  assert.match(imagePrompt(gas, calculate(gas), 'surface'), /no ground, rocks, mountains/);
  assert.notEqual(imagePrompt(p, f, 'surface'), imagePrompt({ ...p, water: 0 }, calculate({ ...p, water: 0 }), 'surface'));
});
test('saved reports retain both image references and recompute derived fields', () => {
  const r = createReport({ params: p, name: 'Test', images: { orbital: { url: '/assets/sample-orbital.webp' }, surface: { url: 'https://audit.public.blob.vercel-storage.com/psu7/images/abc123.webp', signature: 'a'.repeat(64) } } });
  const payload = { ...serializeReport(r), physics: { esi: -100 } }, restored = restoreReport(payload);
  assert.ok(restored.physics.esi > .99); assert.deepEqual(restored.params, r.params);
  assert.ok(restored.images.orbital); assert.ok(restored.images.surface);
  assert.equal(safeAsset({ url: 'javascript:alert(1)' }), null);
  assert.equal(safeAsset({ url: 'https://attacker.example/image.webp' }), null);
});
test('sample sharing is self-contained and old URLs get current calculations', () => {
  const sample = sampleReport(); assert.equal(restoreReport(serializeReport(sample)).images.orbital.url, '/assets/sample-orbital.webp');
  const hash = btoa(encodeURIComponent(JSON.stringify({ s: p.starType, o: p.orbital, a: p.atmosphere, w: p.water, m: 1, r: 1, t: 23, n: 'Legacy', d: 'Legacy text', sc: 999 })));
  const legacy = restoreLegacy(hash); assert.equal(legacy.physics.score, 100); assert.equal(legacy.narrative.description, 'Legacy text');
});
test('representative atmospheres all produce finite numerical results', () => {
  for (const [atmosphere, config] of Object.entries(ATMOSPHERES)) {
    const params = { ...p, atmosphere, pressureBar: config.pressure, water: /none|hydrogen/.test(atmosphere) ? 0 : 70 };
    const f = calculate(params);
    for (const field of ['temperatureC', 'gravityG', 'escapeKms', 'yearDays', 'density']) assert.ok(Number.isFinite(f[field]), `${atmosphere}: ${field}`);
  }
});

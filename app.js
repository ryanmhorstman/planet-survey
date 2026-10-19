import { DEFAULTS, STARS, ZONES, ATMOSPHERES, createReport, sampleReport, paramsFromCatalog, validateParams, validateNarrative, visualSpec } from './lib/planet.js';
import { restoreReport, serializeReport, restoreLegacy, safeAsset } from './lib/client-report.js';

const $ = id => document.getElementById(id);
const state = { reports: [], activeId: null, view: 'orbital', catalog: null, tasks: new Map(),
  capabilities: { analysis: false, images: false, sharing: false }, capabilityStatus: 'loading', browseFilter: 'all', browseController: null };
const active = () => state.reports.find(r => r.id === state.activeId);
const STORE = 'psu7-reports-v2';
const fields = { starType: 'starType', orbital: 'orbitalZone', atmosphere: 'atmosphere', water: 'waterCoverage', massEarth: 'planetMass', radiusEarth: 'planetRadius', tilt: 'axialTilt', rotationHours: 'rotationHours', pressureBar: 'pressureBar' };
const format = (n, digits = 2) => new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(n);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function announce(message) { $('announcer').textContent = message; }
function notice(message) { $('pageNotice').textContent = message; $('pageNotice').hidden = !message; }
function renderAvailability() {
  const { analysis, images } = state.capabilities;
  const message = state.capabilityStatus === 'loading' ? 'Model reports available · checking live services…'
    : state.capabilityStatus === 'error' ? 'Model reports only · live services could not be reached.'
    : analysis && images ? 'Live interpretation and imagery available.'
    : analysis ? 'Live interpretation available · imagery unavailable.'
    : images ? 'Live imagery available · interpretation unavailable.'
    : 'Model reports only · live interpretation and imagery unavailable.';
  $('serviceNotice').textContent = message;
  $('reportServiceNotice').textContent = message;
  $('reportServiceNotice').hidden = Boolean(active()?.sample) || (state.capabilityStatus === 'ready' && analysis && images);
}
function runtime(r) { return r.runtime ||= { analysis: 'idle', orbital: 'idle', surface: 'idle', errors: {} }; }
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify({ selected: state.activeId, reports: state.reports.map(serializeReport) })); }
  catch { notice('This browser could not save survey history. Use Save report to keep a copy.'); }
}
function remember(report) {
  state.reports = [report, ...state.reports.filter(r => r.id !== report.id)].slice(0, 5);
  state.activeId = report.id; persist();
}
function scrollToReport() {
  $('app').classList.add('report-first');
  requestAnimationFrame(() => { $('planetNameDisplay').focus({ preventScroll: true }); $('mainContent').scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' }); });
}
function updateValues() {
  for (const [input, output, suffix] of [['waterCoverage', 'waterVal', '%'], ['planetMass', 'massVal', ' × Earth'], ['planetRadius', 'radiusVal', ' × Earth'], ['axialTilt', 'tiltVal', '°']]) {
    const value = format(Number($(input).value), 5);
    $(output).textContent = value + suffix;
    $(input).setAttribute('aria-valuetext', value + (suffix === '%' ? ' percent' : suffix === '°' ? ' degrees' : ' times Earth'));
  }
}
function setControls(params, catalog = null) {
  state.catalog = catalog;
  for (const [key, id] of Object.entries(fields)) {
    const element = $(id); element.disabled = false;
    if (['massEarth', 'radiusEarth'].includes(key)) {
      element.min = Math.min(key === 'massEarth' ? .1 : .5, params[key]);
      element.max = Math.max(key === 'massEarth' ? 3 : 2.5, params[key]);
      element.step = 'any';
    }
    element.value = params[key];
  }
  $('planetMass').disabled = catalog?.pl_bmasse != null;
  $('planetRadius').disabled = catalog?.pl_rade != null;
  $('starType').disabled = Boolean(catalog?.st_spectype);
  $('orbitalZone').disabled = catalog?.pl_orbsmax != null || catalog?.pl_orbper != null;
  $('catalogControlNote').hidden = !catalog; $('detachCatalog').hidden = !catalog;
  $('catalogControlNote').textContent = catalog ? `${catalog.pl_name}: catalogue measurements are retained. Other settings are assumptions. Create a fictional variation to change locked measurements.` : '';
  $('parameterSummary').textContent = catalog ? `Catalogue scenario: ${catalog.pl_name}` : 'Editable scenario assumptions';
  syncAtmosphere(false); updateValues();
}
function syncAtmosphere(resetPressure) {
  const atmosphere = $('atmosphere').value, airless = atmosphere.includes('none'), gas = atmosphere.includes('hydrogen');
  const wasDisabled = $('waterCoverage').disabled;
  $('waterCoverage').disabled = airless || gas;
  if (airless || gas) $('waterCoverage').value = 0;
  else if (wasDisabled) $('waterCoverage').value = 70;
  $('pressureBar').disabled = airless;
  $('pressureBar').min = airless ? 0 : 0.0001;
  if (resetPressure || airless) $('pressureBar').value = ATMOSPHERES[atmosphere].pressure;
  $('waterHelp').textContent = airless ? 'No exposed liquid water assigned on an airless body.' : gas ? 'A gas envelope has no assigned solid-surface water coverage.' : 'Assumed coverage; the model estimates its phase.';
  updateValues();
}
function readControls() {
  return validateParams(Object.fromEntries(Object.entries(fields).map(([key, id]) =>
    [key, ['starType', 'orbital', 'atmosphere'].includes(key) ? $(id).value : Number($(id).value)])));
}
async function request(url, options = {}, timeout = 30000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: options.signal || controller.signal });
    let data;
    try { data = await response.json(); } catch { throw new Error('The survey service returned an unreadable response. Please retry.'); }
    if (!response.ok) throw new Error(data.error || 'This request could not be completed. Please retry.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('This request took too long. Your report is safe; please retry.');
    if (error instanceof TypeError) throw new Error('The connection was interrupted. Your report is safe; please retry.');
    throw error;
  } finally { clearTimeout(timer); }
}
const post = (url, value, timeout) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }, timeout);
function reportBody(r) { return { params: r.params, catalog: r.catalog }; }
function renderHistory() {
  const container = $('historyItems'); container.replaceChildren(); $('historyStrip').hidden = !state.reports.length;
  for (const r of state.reports) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'history-item';
    button.setAttribute('aria-current', String(r.id === state.activeId));
    const thumb = document.createElement('span'); thumb.className = 'history-thumb';
    if (r.images.orbital) { const img = document.createElement('img'); img.src = r.images.orbital.url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; thumb.append(img); }
    const name = document.createElement('span'); name.className = 'history-name'; name.textContent = r.name;
    const cls = document.createElement('span'); cls.className = 'history-cls'; cls.textContent = r.physics.classification.split(' — ')[1];
    button.append(thumb, name, cls); button.addEventListener('click', () => selectReport(r)); container.append(button);
  }
}
function addFact(label, text) {
  const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = text; $('sourceFacts').append(dt, dd);
}
function render() {
  renderAvailability();
  const r = active(); renderHistory(); if (!r) return;
  const p = r.params, f = r.physics, rt = runtime(r), asset = r.images[state.view];
  $('idleState').hidden = true; $('resultState').hidden = false;
  $('reportOrigin').textContent = r.sample ? 'REFERENCE WORLD · ARTIST INTERPRETATION' : r.catalog ? 'NASA CATALOGUE · SPECULATIVE ENVIRONMENT' : 'FICTIONAL WORLD · MODEL SURVEY';
  $('planetNameDisplay').textContent = r.name; $('planetClassDisplay').textContent = f.classification;
  $('statTemp').textContent = `${format(f.temperatureC, 0)}°C`;
  $('statGravity').textContent = `${format(f.gravityG)} g`;
  $('statEscape').textContent = `${format(f.escapeKms)} km/s`;
  $('yearSource').textContent = `Orbital period · ${r.catalog?.pl_orbper != null ? 'catalogued' : 'estimate'}`;
  $('statYear').textContent = `${format(f.yearDays, 1)} Earth days`;
  $('statDay').textContent = f.solarDayHours == null ? 'No solar day cycle' : `${format(f.solarDayHours, 1)} Earth hours`;
  $('statWater').textContent = f.waterState; $('statDensity').textContent = `${format(f.density)} g/cm³`;
  $('habScore').textContent = f.score == null ? 'Not rated' : `${f.score} / 100`;
  $('habFill').hidden = f.score == null; $('habFill').value = f.score || 0;
  $('esiScore').textContent = f.esi == null ? 'Not rated' : f.esi.toFixed(3);
  $('esiFill').hidden = f.esi == null; $('esiFill').value = f.esi || 0;
  $('scoreFactors').replaceChildren(...f.factors.map(factor => { const li = document.createElement('li'); li.textContent = `${factor.name}: ${factor.points} / ${factor.max}`; return li; }));
  $('analysisBody').textContent = r.narrative.description;
  $('narrativeKind').textContent = r.sample ? 'Reference field note · imagined scenery' : r.narrativeKind === 'ai' ? 'AI-written interpretation · imagined scenery' : 'Model field note · imagined scenery';
  $('analysisStatus').textContent = rt.analysis === 'pending' ? 'Writing an interpretation. The model report is available now.' : rt.errors.analysis || (!state.capabilities.analysis && !r.sample && r.narrativeKind !== 'ai' ? 'Live interpretation is unavailable. This field note uses the model estimates.' : '');
  $('analysisRetry').hidden = !rt.errors.analysis; $('analysisRetry').disabled = rt.analysis === 'pending';
  $('provenanceIntro').textContent = r.catalog ? `Starting point: ${r.catalog.pl_name}, NASA Exoplanet Archive composite parameters. Catalogue quantities may themselves be inferred estimates. The environment shown here is a scenario, not an observation of its surface.` : 'This world is fictional. Operator settings are assumptions; numerical properties are derived estimates; terrain and imagery are artistic interpretations.';
  $('sourceFacts').replaceChildren();
  addFact('Mass / radius', `${format(p.massEarth, 5)} Earth masses (${r.catalog?.pl_bmasse != null ? 'catalogued' : 'assumed'}); ${format(p.radiusEarth, 5)} Earth radii (${r.catalog?.pl_rade != null ? 'catalogued' : 'assumed'})`);
  addFact('Orbit', `${format(f.au, 5)} AU (${r.catalog?.pl_orbsmax != null ? 'catalogued' : 'derived scenario'}); ${f.orbitSource.toLowerCase()}`);
  addFact('Stellar assumptions', `${format(f.star.mass, 3)} solar masses (${r.catalog?.st_mass != null ? 'catalogued' : 'class estimate'}); ${format(f.star.luminosity, 5)} solar luminosities (${r.catalog?.st_lum != null ? 'catalogued' : 'class estimate'})`);
  addFact('Temperature', `${f.temperatureSource}. Greenhouse offset: ${format(f.greenhouseK)} K. Weather and regional extremes are not resolved.`);
  addFact('Environment assumptions', `${p.atmosphere}; ${format(p.pressureBar)} bar; ${p.water}% water/ice inventory; ${p.tilt}° tilt`);
  addFact('Rotation assumption', `${format(p.rotationHours, 2)} Earth hours per rotation. ${f.solarDaysPerYear == null ? 'No solar day cycle in the synchronous case.' : `${format(f.solarDaysPerYear, 1)} modeled solar days per orbit.`}`);
  $('modelWarnings').replaceChildren(...f.warnings.map(w => { const li = document.createElement('li'); li.textContent = w; return li; }));
  for (const view of ['orbital', 'surface']) { const button = $(view === 'orbital' ? 'btnOrbital' : 'btnSurface'); button.classList.toggle('active', state.view === view); button.setAttribute('aria-pressed', String(state.view === view)); }
  $('btnSurface').textContent = p.atmosphere.includes('hydrogen') ? 'Cloud deck' : 'Surface';
  $('stageOrbital').textContent = r.images.orbital ? '02 · Orbital available' : rt.orbital === 'pending' ? '02 · Rendering orbit' : '02 · Orbital view';
  $('stageSurface').textContent = r.images.surface ? '03 · View available' : rt.surface === 'pending' ? '03 · Rendering view' : '03 · Explore closer';
  const image = $('planetImage'), failed = rt[state.view] === 'error';
  image.hidden = !asset || failed; $('imagePlaceholder').hidden = Boolean(asset && !failed);
  $('placeholderLabel').textContent = rt[state.view] === 'pending' ? 'Rendering this perspective…' : failed ? 'View not available yet' : 'Model report ready';
  const token = `${r.id}:${state.view}:${asset?.url}`;
  image.dataset.token = token;
  if (asset && !failed) {
    image.alt = `${r.name} — ${state.view === 'orbital' ? 'orbital' : visualSpec(p, f).view.toLowerCase()} artist interpretation`;
    image.onerror = () => { if (image.dataset.token !== token || active()?.id !== r.id) return; rt[state.view] = 'error'; rt.errors[state.view] = 'The saved image could not be loaded. Retry to load it again.'; render(); };
    if (image.getAttribute('src') !== asset.url) image.src = asset.url;
  }
  $('imageOpen').disabled = !asset || failed; $('imageOpen').setAttribute('aria-label', `Expand ${state.view} image of ${r.name}`);
  $('expandHint').hidden = !asset || failed;
  $('planetLabel').textContent = asset?.kind === 'reference' ? 'Reference illustration · imagined landscape' : 'Artist interpretation · no surface observation implied';
  $('downloadBtn').disabled = !asset || failed;
  $('imageStatus').textContent = rt[state.view] === 'pending' ? 'Rendering this view. You can read the report or explore another survey.' : rt.errors[state.view] || (!asset ? state.capabilities.images ? 'This perspective is ready to render.' : 'Live imagery is unavailable. Explore the illustrated reference world or read this model report.' : '');
  $('imageRetry').hidden = Boolean(asset && !failed) || rt[state.view] === 'pending' || (!state.capabilities.images && !asset && !rt.errors[state.view]);
  $('imageRetry').textContent = asset ? 'Reload saved image' : rt.errors[state.view] ? 'Retry this view' : 'Render this view';
}
function selectReport(report, { scroll = true, controls = true } = {}) {
  state.activeId = report.id; state.view = 'orbital';
  if (controls) setControls(report.params, report.catalog);
  notice(''); persist(); render();
  const url = report.publicId ? `?report=${report.publicId}` : report.sample ? '?sample=boreal' : location.pathname;
  history.replaceState(null, '', url);
  if (scroll) scrollToReport();
}
async function runTask(r, kind, job) {
  const key = `${r.id}:${kind}`;
  if (state.tasks.has(key)) return state.tasks.get(key);
  const rt = runtime(r); rt[kind] = 'pending'; delete rt.errors[kind];
  const before = JSON.stringify(serializeReport(r));
  if (active()?.id === r.id) render();
  const task = (async () => {
    try { await job(); rt[kind] = 'complete'; if (active()?.id === r.id) announce(`${kind === 'analysis' ? 'Interpretation' : kind + ' image'} ready for ${r.name}.`); }
    catch (error) { rt[kind] = 'error'; rt.errors[kind] = error.message; if (active()?.id === r.id) announce(error.message); }
    finally {
      if (JSON.stringify(serializeReport(r)) !== before) {
        r.publicId = null; r.sample = false;
        if (active()?.id === r.id) history.replaceState(null, '', location.pathname);
      }
      state.tasks.delete(key); persist(); if (active()?.id === r.id) render(); else renderHistory();
    }
  })();
  state.tasks.set(key, task); return task;
}
function requestNarrative(r) {
  return runTask(r, 'analysis', async () => { const data = await post('/api/analyze', reportBody(r), 38000); r.narrative = validateNarrative(data.narrative); r.narrativeKind = 'ai'; });
}
function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image(), timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('The saved image took too long to load. Please retry.')); }, 12000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('The saved image could not be loaded. Please retry.')); };
    image.src = url;
  });
}
function requestImage(r, view) {
  return runTask(r, view, async () => {
    if (!r.images[view]) {
      const data = await post('/api/image', { ...reportBody(r), view }, 85000), asset = safeAsset(data.asset);
      if (!asset) throw new Error('The image service returned an invalid image reference. Please retry.');
      r.images[view] = asset;
    }
    await decodeImage(r.images[view].url);
  });
}
async function generate() {
  if (!$('surveyForm').reportValidity()) return;
  let params;
  try { params = readControls(); } catch (error) { notice(error.message); announce(error.message); return; }
  const current = active();
  if (current && !current.sample && JSON.stringify(current.params) === JSON.stringify(params) && JSON.stringify(current.catalog) === JSON.stringify(state.catalog) && (runtime(current).launching || [...state.tasks.keys()].some(k => k.startsWith(current.id + ':')))) { scrollToReport(); return; }
  const number = Math.floor(Math.random() * 90000 + 10000);
  const r = createReport({ params, catalog: state.catalog, name: `PSU-${number}` });
  remember(r); selectReport(r); announce(`Model report ready for ${r.name}.`);
  runtime(r).launching = true;
  await refreshCapabilities();
  runtime(r).launching = false;
  if (state.capabilities.analysis) void requestNarrative(r);
  if (state.capabilities.images) void requestImage(r, 'orbital');
}
function setView(view) {
  const r = active(); if (!r) return;
  state.view = view; render();
  if (!r.images[view] && state.capabilities.images && runtime(r)[view] !== 'error') void requestImage(r, view);
}
function openDialog(id) { $(id).showModal(); }
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const targets = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  const first = targets[0], last = targets.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}));
$('imageOpen').addEventListener('click', () => {
  const r = active(), asset = r?.images[state.view]; if (!asset) return;
  $('lightboxImg').src = asset.url; $('lightboxImg').alt = $('planetImage').alt;
  $('lightboxTitle').textContent = `${r.name} · ${state.view === 'surface' ? visualSpec(r.params, r.physics).view : 'Orbital'}`;
  openDialog('lightbox');
});
function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function downloadView() {
  const r = active(), asset = r?.images[state.view]; if (!asset) return;
  try { const response = await fetch(asset.url, { signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error('Download unavailable.'); saveFile(await response.blob(), `${r.name.replace(/[^a-z0-9]/gi, '-')}-${state.view}.webp`); announce('Image downloaded.'); }
  catch { announce('The image could not be downloaded. Please try again.'); notice('The image could not be downloaded. Please try again.'); }
}
function exportReport() { const r = active(); if (r) saveFile(new Blob([JSON.stringify(serializeReport(r), null, 2)], { type: 'application/json' }), `${r.name.replace(/[^a-z0-9]/gi, '-')}-survey.json`); }
async function browse() {
  state.browseController?.abort(); const controller = new AbortController(); state.browseController = controller;
  $('browseList').replaceChildren(); $('browseStatus').textContent = 'Retrieving catalogue records…'; $('browseRetry').hidden = true;
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const search = $('browseSearch').value.trim();
    const data = await request('/api/exoplanets?' + new URLSearchParams({ filter: state.browseFilter, search }), { signal: controller.signal });
    if (state.browseController !== controller) return;
    if (!Array.isArray(data.planets)) throw new Error('The catalogue returned an unexpected response. Please retry.');
    $('browseStatus').textContent = data.planets.length ? `${data.planets.length} records · NASA composite catalogue. Select a world to survey its assumed environment.` : 'No matching worlds. Try another name or filter.';
    for (const catalog of data.planets) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'browse-item';
      const name = document.createElement('span'); name.className = 'browse-item-name'; name.textContent = catalog.pl_name;
      const meta = document.createElement('span'); meta.className = 'browse-item-meta';
      meta.textContent = `${catalog.pl_rade == null ? 'Radius unknown' : format(catalog.pl_rade, 3) + ' Earth radii'} · ${catalog.pl_bmasse == null ? 'Mass unknown' : format(catalog.pl_bmasse, 3) + ' Earth masses'} · ${catalog.pl_orbper == null ? 'Period unknown' : format(catalog.pl_orbper, 2) + ' Earth days'}`;
      button.append(name, meta); button.addEventListener('click', () => { try { setControls(paramsFromCatalog(catalog), catalog); $('browseModal').close(); void generate(); } catch (error) { $('browseStatus').textContent = error.message; } });
      $('browseList').append(button);
    }
  } catch (error) { if (state.browseController === controller) { $('browseStatus').textContent = error.message; $('browseRetry').hidden = false; } }
  finally { clearTimeout(timer); }
}
let sharingReport = null;
function showShareURL(url) {
  $('shareURL').value = url; $('shareURL').hidden = false; $('shareURLLabel').hidden = false; $('copyLink').hidden = false; $('publishShare').hidden = true;
}
function openShare() {
  sharingReport = active(); if (!sharingReport) return;
  $('shareStatus').textContent = ''; $('shareURL').hidden = $('shareURLLabel').hidden = $('copyLink').hidden = true;
  $('publishShare').hidden = false; $('publishShare').disabled = false;
  $('shareExplanation').textContent = 'Create a public link containing this report and its available images. Anyone with the link can view it. Images added later require a new link.';
  if (sharingReport.sample) showShareURL(location.origin + location.pathname + '?sample=boreal');
  else if (sharingReport.publicId) showShareURL(location.origin + location.pathname + '?report=' + sharingReport.publicId);
  else if (!state.capabilities.sharing) { $('publishShare').hidden = true; $('shareExplanation').textContent = 'Public links are unavailable right now. Save this report as a file to keep its interpretation and available image references, or share the reference world.'; }
  openDialog('shareDialog');
}
$('publishShare').addEventListener('click', async () => {
  const r = sharingReport; if (!r) return;
  const snapshot = serializeReport(r); $('publishShare').disabled = true; $('shareStatus').textContent = 'Saving this report and its image references…';
  try {
    const data = await post('/api/reports', snapshot, 28000);
    if (!/^[a-f0-9-]{36}$/.test(data.id)) throw new Error('The share service returned an invalid link.');
    // A late image or interpretation can change the current report while the saved snapshot remains valid.
    if (JSON.stringify(serializeReport(r)) === JSON.stringify(snapshot)) { r.publicId = data.id; persist(); }
    if (sharingReport === r) { showShareURL(location.origin + location.pathname + '?report=' + data.id); $('shareStatus').textContent = 'Your public report is ready.'; }
  } catch (error) { if (sharingReport === r) $('shareStatus').textContent = error.message; }
  finally { $('publishShare').disabled = false; }
});
$('copyLink').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('shareURL').value); $('shareStatus').textContent = 'Link copied.'; }
  catch { $('shareURL').focus(); $('shareURL').select(); $('shareStatus').textContent = 'Select and copy the link above.'; }
});
$('surveyForm').addEventListener('submit', event => { event.preventDefault(); void generate(); });
document.querySelectorAll('[data-action="survey"]').forEach(button => button.addEventListener('click', () => void generate()));
document.querySelectorAll('[data-action="sample"]').forEach(button => button.addEventListener('click', () => { const r = sampleReport(); remember(r); selectReport(r); announce('Boreal reference survey opened.'); }));
$('surveyForm').addEventListener('input', updateValues);
$('atmosphere').addEventListener('change', () => syncAtmosphere(true));
$('detachCatalog').addEventListener('click', () => { const p = readControls(); setControls(p); announce('Catalogue measurements are now editable as a fictional variation.'); });
$('randomizeBtn').addEventListener('click', () => {
  const choose = values => values[Math.floor(Math.random() * values.length)];
  const mass = Math.round((.3 + Math.random() * 2.7) * 10) / 10;
  const atmosphere = choose(Object.keys(ATMOSPHERES));
  const params = { ...DEFAULTS, starType: choose(Object.keys(STARS)), orbital: choose(Object.keys(ZONES)), atmosphere,
    massEarth: mass, radiusEarth: Math.round(mass ** .28 * 10) / 10, tilt: Math.floor(Math.random() * 70),
    water: atmosphere.includes('none') || atmosphere.includes('hydrogen') ? 0 : Math.floor(Math.random() * 101), pressureBar: ATMOSPHERES[atmosphere].pressure };
  setControls(params); $('parameterDetails').open = true; $('parameterDetails').scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth' }); announce('New fictional scenario selected. Initiate a survey to explore it.');
});
$('editParamsBtn').addEventListener('click', () => { $('parameterDetails').open = true; $('parameterDetails').scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth' }); $('parameterDetails').querySelector('summary').focus({ preventScroll: true }); });
$('btnOrbital').addEventListener('click', () => setView('orbital')); $('btnSurface').addEventListener('click', () => setView('surface'));
$('imageRetry').addEventListener('click', () => { if (active()) void requestImage(active(), state.view); });
$('analysisRetry').addEventListener('click', () => { if (active()) void requestNarrative(active()); });
$('downloadBtn').addEventListener('click', downloadView); $('lightboxDownload').addEventListener('click', downloadView);
$('exportBtn').addEventListener('click', exportReport); $('shareExport').addEventListener('click', exportReport); $('shareBtn').addEventListener('click', openShare);
$('browseBtn').addEventListener('click', () => { openDialog('browseModal'); void browse(); });
$('browseForm').addEventListener('submit', e => { e.preventDefault(); void browse(); }); $('browseRetry').addEventListener('click', browse);
$('browseModal').addEventListener('close', () => { state.browseController?.abort(); state.browseController = null; });
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  state.browseFilter = button.dataset.filter; $('browseSearch').value = '';
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); void browse();
}));
$('clearHistory').addEventListener('click', () => { state.reports = active() ? [active()] : []; persist(); renderHistory(); announce('Previous surveys cleared. The open report has been kept.'); });
$('importReport').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 100000) throw new Error('This report file is too large.'); const r = restoreReport(JSON.parse(await file.text())); remember(r); selectReport(r); announce('Saved report opened.'); }
  catch (error) { notice(`This report could not be opened. ${error.message}`); }
  event.target.value = '';
});
let capabilityRequest = null;
function refreshCapabilities() {
  if (capabilityRequest) return capabilityRequest;
  state.capabilityStatus = 'loading'; renderAvailability();
  capabilityRequest = request('/api/capabilities', {}, 6000).then(data => {
    if (!['analysis', 'images', 'sharing'].every(key => typeof data[key] === 'boolean')) throw new Error('Invalid service response');
    state.capabilities = { analysis: data.analysis, images: data.images, sharing: data.sharing };
    state.capabilityStatus = 'ready';
  }).catch(() => {
    state.capabilities = { analysis: false, images: false, sharing: false }; state.capabilityStatus = 'error';
  }).finally(() => {
    capabilityRequest = null; renderAvailability(); if (active()) render();
  });
  return capabilityRequest;
}
void refreshCapabilities();
async function boot() {
  setControls(DEFAULTS);
  $('parameterDetails').open = !matchMedia('(max-width: 960px)').matches;
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || '{}');
    state.reports = (Array.isArray(data.reports) ? data.reports.slice(0, 5) : []).flatMap(value => { try { return [restoreReport(value)]; } catch { return []; } });
    state.activeId = data.selected;
  } catch { /* Storage may be disabled; the survey works in memory. */ }
  const url = new URL(location.href);
  try {
    let r;
    if (url.searchParams.has('report')) {
      notice('Retrieving shared report…');
      const data = await request('/api/reports?id=' + encodeURIComponent(url.searchParams.get('report')), {}, 18000);
      r = restoreReport(data.report); r.publicId = url.searchParams.get('report');
    } else if (url.searchParams.get('sample') === 'boreal') r = sampleReport();
    else if (location.hash.length > 1) { r = restoreLegacy(location.hash.slice(1)); }
    else r = active();
    if (r) { remember(r); selectReport(r); if (url.hash) notice('Legacy report opened. Numerical estimates have been recalculated with the current model; earlier imagery was not included in this link.'); }
    else renderHistory();
  } catch (error) { state.activeId = null; notice(error.message); renderHistory(); }
}
void boot();

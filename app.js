import { orbitalAssetMetadata } from "./lib/orbital-record.js";
import {
  validateExpeditions,
  MAX_EXPEDITIONS,
} from "./lib/expedition-record.js";
import {
  DEFAULTS,
  STARS,
  ZONES,
  ATMOSPHERES,
  createReport,
  sampleReport,
  showcaseKey,
  REFERENCE_ASSETS,
  paramsFromCatalog,
  validateParams,
  validateNarrative,
  calculate,
  biosphereSpec,
  formatYears,
  TIDES,
  statTile,
  formatQuantity,
  surfaceWater,
  habitableZoneText,
  IMAGE_VIEWS,
  imageViews,
  viewLabel,
  CIVILIZATIONS,
  civilizationSpec,
} from "./lib/planet.js";
import {
  restoreReport,
  serializeReport,
  restoreLegacy,
  safeAsset,
} from "./lib/client-report.js";
import { checkConsistency, CONSISTENCY_RULES } from "./lib/consistency.js";
import {
  paramsFromSeed,
  randomSeed,
  seededReport,
  seedQuery,
} from "./lib/seed.js";
import { runFieldResearcher } from "./lib/field-researcher.js";
import { survival, earthComparison } from "./lib/visitor.js";

const $ = (id) => document.getElementById(id);
const state = {
  reports: [],
  activeId: null,
  view: "orbital",
  instrument: "illustration",
  catalog: null,
  /** Seed of the current Randomize settings, if unchanged. */
  seed: null,
  tasks: new Map(),
  capabilities: { analysis: false, images: false, sharing: false },
  capabilityStatus: "loading",
  browseFilter: "all",
  browseController: null,
  researchController: null,
};
const active = () => state.reports.find((r) => r.id === state.activeId);
const STORE = "psu7-reports-v2";
const VIEW_BUTTONS = {
  orbital: "btnOrbital",
  surface: "btnSurface",
  deep: "btnDeep",
  night: "btnNight",
  postcard: "btnPostcard",
  aftermath: "btnAftermath",
};
// Retain the experiment for development without exposing it in the public journey.
const cartographyPreview = (() => {
  try {
    return sessionStorage.getItem("psu7-cartography-preview") === "1";
  } catch {
    return false;
  }
})();
$("instrumentTabs").hidden = !cartographyPreview;
if (cartographyPreview) {
  $("illustrationPanel").setAttribute("role", "tabpanel");
  $("illustrationPanel").setAttribute("aria-labelledby", "tabIllustration");
}

const fields = {
  starType: "starType",
  orbital: "orbitalZone",
  atmosphere: "atmosphere",
  water: "waterCoverage",
  massEarth: "planetMass",
  radiusEarth: "planetRadius",
  tilt: "axialTilt",
  rotationHours: "rotationHours",
  pressureBar: "pressureBar",
  biosphere: "imaginedBiosphere",
  civilization: "imaginedCivilization",
};
const format = (n, digits = 2) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(n);
const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
function announce(message) {
  $("announcer").textContent = message;
}
function notice(message) {
  $("pageNotice").textContent = message;
  $("pageNotice").hidden = !message;
}
function renderAvailability() {
  const { analysis, images } = state.capabilities;
  const message =
    state.capabilityStatus === "loading"
      ? "Model reports available · checking live services…"
      : state.capabilityStatus === "error"
        ? "Model reports only · live services could not be reached."
        : analysis && images
          ? "Live interpretation and imagery available."
          : analysis
            ? "Live interpretation available · imagery unavailable."
            : images
              ? "Live imagery available · interpretation unavailable."
              : "Model reports only · live interpretation and imagery unavailable.";
  $("serviceNotice").textContent = message;
  $("researchBtn").hidden = !analysis;
  $("reportServiceNotice").textContent = message;
  $("reportServiceNotice").hidden =
    Boolean(active()?.sample) ||
    (state.capabilityStatus === "ready" && analysis && images);
}
function runtime(r) {
  return (r.runtime ||= {
    analysis: "idle",
    orbital: "idle",
    surface: "idle",
    deep: "idle",
    night: "idle",
    postcard: "idle",
    aftermath: "idle",
    errors: {},
  });
}
function persist() {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify({
        selected: state.activeId,
        reports: state.reports.map(serializeReport),
      }),
    );
  } catch {
    notice(
      "This browser could not save survey history. Use Save report to keep a copy.",
    );
  }
}
function remember(report) {
  state.reports = [
    report,
    ...state.reports.filter((r) => r.id !== report.id),
  ].slice(0, 5);
  state.activeId = report.id;
  persist();
}
function scrollToReport() {
  $("app").classList.add("report-first");
  requestAnimationFrame(() => {
    $("planetNameDisplay").focus({ preventScroll: true });
    $("mainContent").scrollIntoView({
      behavior: reducedMotion() ? "instant" : "smooth",
      block: "start",
    });
  });
}
function updateValues() {
  for (const [input, output, suffix] of [
    ["waterCoverage", "waterVal", "%"],
    ["planetMass", "massVal", " × Earth"],
    ["planetRadius", "radiusVal", " × Earth"],
    ["axialTilt", "tiltVal", "°"],
  ]) {
    const value = format(Number($(input).value), 5);
    $(output).textContent = value + suffix;
    $(input).setAttribute(
      "aria-valuetext",
      value +
        (suffix === "%"
          ? " percent"
          : suffix === "°"
            ? " degrees"
            : " times Earth"),
    );
  }
  try {
    const p = readControls(),
      f = calculate(p, state.catalog),
      biology = biosphereSpec(p, f);
    $("conditionsPreview").textContent =
      `${formatQuantity("temperatureC", f.temperatureC)}°C mean · ${formatQuantity("gravityG", f.gravityG)} g · ${f.waterState}`;
    $("biosphereHelp").textContent = biology.present
      ? `Invented biology, not a life prediction. ${biology.palette}; ${biology.forms}.`
      : biology.reason;
  } catch {
    $("conditionsPreview").textContent =
      "Complete the settings to preview estimated conditions.";
    $("biosphereHelp").textContent =
      "An artistic choice, not a life prediction. Complete the scenario parameters to preview its treatment.";
  }
}
function setControls(params, catalog = null) {
  state.catalog = catalog;
  for (const [key, id] of Object.entries(fields)) {
    const element = $(id);
    element.disabled = false;
    if (["massEarth", "radiusEarth"].includes(key)) {
      element.min = Math.min(key === "massEarth" ? 0.1 : 0.5, params[key]);
      element.max = Math.max(key === "massEarth" ? 3 : 2.5, params[key]);
      element.step = "any";
    }
    element.value = params[key];
  }
  $("planetMass").disabled = catalog?.pl_bmasse != null;
  $("planetRadius").disabled = catalog?.pl_rade != null;
  $("starType").disabled = Boolean(catalog?.st_spectype);
  $("orbitalZone").disabled =
    catalog?.pl_orbsmax != null || catalog?.pl_orbper != null;
  $("catalogControlNote").hidden = !catalog;
  $("detachCatalog").hidden = !catalog;
  $("catalogControlNote").textContent = catalog
    ? `${catalog.pl_name}: catalogue measurements are retained. Other settings are assumptions. Create a fictional variation to change locked measurements.`
    : "";
  $("parameterSummary").textContent = catalog
    ? `Catalogue scenario: ${catalog.pl_name}`
    : "Editable scenario assumptions";
  syncAtmosphere(false);
  updateValues();
}
function syncAtmosphere(resetPressure) {
  const atmosphere = $("atmosphere").value,
    airless = atmosphere.includes("none"),
    gas = atmosphere.includes("hydrogen");
  const wasDisabled = $("waterCoverage").disabled;
  $("waterCoverage").disabled = airless || gas;
  if (airless || gas) $("waterCoverage").value = 0;
  else if (wasDisabled) $("waterCoverage").value = 70;
  $("pressureBar").disabled = airless;
  $("pressureBar").min = airless ? 0 : 0.0001;
  if (resetPressure || airless)
    $("pressureBar").value = ATMOSPHERES[atmosphere].pressure;
  $("waterHelp").textContent = airless
    ? "No exposed liquid water assigned on an airless body."
    : gas
      ? "A gas envelope has no assigned solid-surface water coverage."
      : "Assumed coverage; the model estimates its phase.";
  updateValues();
}
function readControls() {
  return validateParams(
    Object.fromEntries(
      Object.entries(fields).map(([key, id]) => [
        key,
        [
          "starType",
          "orbital",
          "atmosphere",
          "biosphere",
          "civilization",
        ].includes(key)
          ? $(id).value
          : $(id).valueAsNumber,
      ]),
    ),
  );
}
async function request(url, options = {}, timeout = 30000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The survey service returned an unreadable response. Please retry.",
      );
    }
    if (!response.ok)
      throw new Error(
        data.error || "This request could not be completed. Please retry.",
      );
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "This request took too long. Your report is safe; please retry.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "The connection was interrupted. Your report is safe; please retry.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const post = (url, value, timeout) =>
  request(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    },
    timeout,
  );
function reportBody(r) {
  return {
    params: r.params,
    catalog: r.catalog,
    physicsVersion: r.physicsVersion,
    ...(r.seed != null ? { seed: r.seed } : {}),
  };
}
const SECTION_LABELS = {
  calculated: "Calculated",
  estimated: "Estimated",
  assumed: "Assumed",
  imagined: "Imagined",
};
// Tagged sections carry provenance in the interface, so the prose stays plain.
function renderNarrative(narrative) {
  const body = $("analysisBody");
  if (!narrative.sections) {
    body.textContent = narrative.description;
    return;
  }
  body.replaceChildren(
    ...narrative.sections.map((section) => {
      const line = document.createElement("span"),
        tag = document.createElement("span");
      line.className = "note-section";
      tag.className = "note-kind";
      tag.dataset.kind = section.kind;
      tag.textContent = SECTION_LABELS[section.kind];
      line.append(tag, " ", section.text);
      return line;
    }),
  );
}
function renderHistory() {
  const container = $("historyItems");
  container.replaceChildren();
  $("historyStrip").hidden = !state.reports.length;
  for (const r of state.reports) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.setAttribute("aria-current", String(r.id === state.activeId));
    const thumb = document.createElement("span");
    thumb.className = "history-thumb";
    if (r.images.orbital) {
      const img = document.createElement("img");
      img.src = r.images.orbital.url;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      thumb.append(img);
    }
    const name = document.createElement("span");
    name.className = "history-name";
    name.textContent = r.name;
    const cls = document.createElement("span");
    cls.className = "history-cls";
    cls.textContent = r.physics.classification.split(" — ")[1];
    button.append(thumb, name, cls);
    button.addEventListener("click", () => selectReport(r));
    container.append(button);
  }
}
function addFact(label, text) {
  const dt = document.createElement("dt"),
    dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = text;
  $("sourceFacts").append(dt, dd);
}
let orbitalViewRequest = null;
let cartographyController = null;
let cartographyReport = null;
let cartographyEpoch = 0;
function syncInstrument() {
  if (!cartographyPreview) state.instrument = "illustration";
  const cartography = state.instrument === "cartography",
    r = active();
  $("illustrationPanel").hidden = cartography;
  $("cartographyPanel").hidden = !cartography;
  $("downloadBtn").textContent = cartography
    ? "↓ Download illustration"
    : "↓ Download view";
  for (const [id, selected] of [
    ["tabIllustration", !cartography],
    ["tabCartography", cartography],
  ]) {
    $(id).setAttribute("aria-selected", String(selected));
    $(id).tabIndex = selected ? 0 : -1;
  }
  if (!cartography || !r || cartographyReport !== r) {
    cartographyEpoch++;
    cartographyController?.dispose();
    cartographyController = null;
    cartographyReport = null;
  }
  if (
    cartography &&
    r &&
    cartographyReport === r &&
    cartographyController &&
    orbitalViewRequest?.report === r
  ) {
    cartographyController.showOrbitalView(orbitalViewRequest.view);
    orbitalViewRequest = null;
  }
  if (!cartography || !r || cartographyReport === r) return;
  cartographyReport = r;
  const epoch = ++cartographyEpoch;
  $("cartographyMount").textContent = "Loading cartography instrument…";
  import("./lib/globe.js")
    .then(({ mountCartography }) => {
      if (epoch !== cartographyEpoch) return;
      cartographyController = mountCartography($("cartographyMount"), r, {
        initialOrbitalView:
          orbitalViewRequest?.report === r ? orbitalViewRequest.view : null,
        getExpeditionState(metadata, operation) {
          const kind = `expedition:${operation}:${metadata.key}`,
            rt = runtime(r);
          return {
            pending: rt[kind] === "pending",
            error: rt.errors[kind],
            available:
              state.capabilities[operation === "image" ? "images" : "analysis"],
          };
        },
        onExpedition(metadata, operation) {
          return requestExpedition(r, metadata, operation);
        },
        onExpand(asset, metadata) {
          showExpandedImage(
            asset,
            `${r.name} · expedition ${metadata.latitude}°, ${metadata.longitude}° · heading ${metadata.heading}°`,
            `${r.name.replace(/[^a-z0-9]/gi, "-")}-expedition-${metadata.latitude}-${metadata.longitude}-${metadata.heading}.webp`,
          );
        },
        onChange() {
          r.publicId = null;
          r.sample = false;
          if (active()?.id === r.id)
            history.replaceState(null, "", location.pathname);
          persist();
          if (active()?.id === r.id) render();
          else renderHistory();
        },
      });
      if (orbitalViewRequest?.report === r) orbitalViewRequest = null;
    })
    .catch(() => {
      if (epoch !== cartographyEpoch) return;
      cartographyReport = null;
      $("cartographyMount").textContent =
        "Cartography could not load. Switch tabs and retry. Existing illustrations and reports remain available.";
    });
}
for (const [id, instrument] of [
  ["tabIllustration", "illustration"],
  ["tabCartography", "cartography"],
]) {
  $(id).addEventListener("click", () => {
    if (!cartographyPreview) return;
    state.instrument = instrument;
    syncInstrument();
  });
  $(id).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? "tabIllustration"
        : event.key === "End"
          ? "tabCartography"
          : id === "tabIllustration"
            ? "tabCartography"
            : "tabIllustration";
    $(target).click();
    $(target).focus();
  });
}
function render() {
  renderAvailability();
  const r = active();
  document
    .querySelectorAll(".showcase-nav [data-world]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Boolean(r?.sample) && button.dataset.world === showcaseKey(r)),
      ),
    );
  renderHistory();
  if (!r) return;
  const p = r.params,
    f = r.physics,
    rt = runtime(r),
    asset = r.images[state.view];
  $("idleState").hidden = true;
  $("resultState").hidden = false;
  syncInstrument();
  $("reportOrigin").textContent = r.sample
    ? "REFERENCE WORLD · ARTIST INTERPRETATION"
    : r.catalog
      ? "NASA CATALOGUE · SPECULATIVE ENVIRONMENT"
      : "FICTIONAL WORLD · MODEL SURVEY";
  $("planetNameDisplay").textContent = r.name;
  $("planetClassDisplay").textContent = f.classification;
  // Labels and values come from statTile(), which shares its provenance and
  // precision with the field note and the fact sheet Claude writes from.
  for (const [key, label, value] of /** @type {const} */ ([
    ["temperatureC", "tempLabel", "statTemp"],
    ["gravityG", "gravityLabel", "statGravity"],
    ["escapeKms", "escapeLabel", "statEscape"],
    ["yearDays", "yearSource", "statYear"],
    ["solarDayHours", "dayLabel", "statDay"],
    ["waterState", "waterLabel", "statWater"],
    ["density", "densityLabel", "statDensity"],
    ["biosphere", "biosphereLabel", "statBiosphere"],
  ])) {
    const tile = statTile(key, p, f, r.catalog);
    $(label).textContent = tile.label;
    $(value).textContent = tile.value;
  }
  const visit = survival(p, f);
  $("visitHeadline").textContent = visit.headline;
  $("visitReasons").replaceChildren(
    ...visit.reasons.map((reason) =>
      Object.assign(document.createElement("li"), { textContent: reason }),
    ),
  );
  $("visitFacts").replaceChildren(
    ...earthComparison(p, f).flatMap(({ label, value }) => [
      Object.assign(document.createElement("dt"), { textContent: label }),
      Object.assign(document.createElement("dd"), { textContent: value }),
    ]),
  );
  const locked = f.tidalLock?.locked === true;
  $("habScore").textContent =
    f.score == null ? "Not rated" : `${f.score} / 100`;
  $("habFill").hidden = f.score == null;
  $("habFill").value = f.score || 0;
  $("activityCaveat").hidden = !f.activityCaveat || f.score == null;
  $("activityCaveat").textContent = f.activityCaveat ?? "";
  $("esiScore").textContent =
    f.esi == null ? "Not rated" : formatQuantity("esi", f.esi);
  $("esiFill").hidden = f.esi == null;
  $("esiFill").value = f.esi || 0;
  $("scoreFactors").replaceChildren(
    ...f.factors.map((factor) => {
      const li = document.createElement("li"),
        label = document.createElement("span"),
        bar = document.createElement("progress");
      label.textContent = `${factor.name}: ${factor.points} / ${factor.max}`;
      bar.max = factor.max;
      bar.value = factor.points;
      bar.setAttribute("aria-label", label.textContent);
      li.className = "score-factor";
      li.append(label, bar);
      return li;
    }),
  );
  renderNarrative(r.narrative);
  $("narrativeKind").textContent =
    r.sample || r.narrativeKind === "reference"
      ? "Curated reference note · hand-written from the model estimates"
      : r.narrativeKind === "ai"
        ? "AI-written field note · imagined scenery"
        : "Model field note · imagined scenery";
  $("analysisStatus").textContent =
    rt.analysis === "pending"
      ? "Writing an interpretation. The model report is available now."
      : rt.errors.analysis ||
        (!state.capabilities.analysis && !r.sample && r.narrativeKind !== "ai"
          ? "Live interpretation is unavailable. This field note uses the model estimates."
          : "");
  $("analysisRetry").hidden = !rt.errors.analysis;
  $("analysisRetry").disabled = rt.analysis === "pending";
  $("provenanceIntro").textContent = r.catalog
    ? `Starting point: ${r.catalog.pl_name}, NASA Exoplanet Archive composite parameters. Catalogue quantities may themselves be inferred estimates. The environment shown here is a scenario, not an observation of its surface.`
    : "This world is fictional. Operator settings are assumptions; numerical properties are derived estimates; terrain and imagery are artistic interpretations.";
  $("sourceFacts").replaceChildren();
  addFact(
    "Mass / radius",
    `${format(p.massEarth, 5)} Earth masses (${r.catalog?.pl_bmasse != null ? "catalogued" : "assumed"}); ${format(p.radiusEarth, 5)} Earth radii (${r.catalog?.pl_rade != null ? "catalogued" : "assumed"})`,
  );
  addFact(
    "Orbit",
    `${formatQuantity("au", f.au)} AU (${r.catalog?.pl_orbsmax != null ? "catalogued" : "derived scenario"}); ${f.orbitSource.toLowerCase()}`,
  );
  addFact(
    "Stellar assumptions",
    `${format(f.star.mass, 3)} solar masses (${r.catalog?.st_mass != null ? "catalogued" : "class estimate"}); ${format(f.star.luminosity, 5)} solar luminosities (${r.catalog?.st_lum != null ? "catalogued" : "class estimate"}); effective temperature ${formatQuantity("teffK", f.star.teffK)} K (calculated from luminosity and radius)`,
  );
  if (f.tidalLock) {
    const zone = habitableZoneText(f);
    addFact("Habitable zone", zone.charAt(0).toUpperCase() + zone.slice(1));
    addFact(
      "Moons",
      `${f.moons.reason.charAt(0).toUpperCase() + f.moons.reason.slice(1)}. Stable orbits reach about half the Hill radius (${Math.round(f.moons.hillPlanetRadii)} planet radii); the Roche limit is ${f.moons.rochePlanetRadii} planet radii.`,
    );
  }
  addFact(
    "Temperature",
    `${f.temperatureSource}${f.albedo == null ? "" : `; Bond albedo ${formatQuantity("albedo", f.albedo)} (${f.albedoSource})`}. Greenhouse offset: ${formatQuantity("greenhouseK", f.greenhouseK)} K. ${f.airlessMeanRangeC ? `With no atmosphere, the mean surface temperature lies between about ${formatQuantity("temperatureC", f.airlessMeanRangeC[0])}°C (slow rotation) and ${formatQuantity("temperatureC", f.airlessMeanRangeC[1])}°C (fast rotation or high thermal inertia). ` : ""}Weather and regional extremes are not resolved.`,
  );
  addFact(
    "Environment assumptions",
    `${p.atmosphere}; ${formatQuantity("pressureBar", p.pressureBar)} bar; water enough to cover ${p.water}% of the surface (${surfaceWater(p, f).text}); ${locked ? `${p.tilt}° tilt setting (imagined: tides damp a locked world's tilt to about 0°, so it has no seasons)` : `${p.tilt}° tilt`}${f.nightside ? `. ${f.nightside.collapses ? `Below the ${f.nightside.thresholdBar} bar collapse threshold (Joshi et al. 1997), air and water would freeze out on the nightside` : `Above the ${f.nightside.thresholdBar} bar collapse threshold (Joshi et al. 1997), the air carries heat to the nightside`} (estimated)` : ""}`,
  );
  const biology = biosphereSpec(p, f);
  addFact(
    "Imagined biosphere",
    `${p.biosphere.charAt(0).toUpperCase() + p.biosphere.slice(1)} mode. ${biology.present ? `${biology.palette}; ${biology.forms}. Artistic choices, not detected life.${biology.pigmentNote ? ` ${biology.pigmentNote}` : ""}` : biology.reason}`,
  );
  const civilization = civilizationSpec(p, f);
  if (civilization)
    addFact(
      "Imagined civilization",
      `${civilization.summary.charAt(0).toUpperCase() + civilization.summary.slice(1)}. Invented art direction: it does not change the physics or scores.`,
    );
  addFact(
    "Rotation assumption",
    locked
      ? `Tidally locked: from an assumed ${formatQuantity("rotationHours", p.rotationHours)}-hour initial rotation, locking takes about ${formatYears(f.tidalLock.lockYears)}, within the assumed ${formatYears(f.tidalLock.ageYears)} system age (Q ${TIDES.Q}, k₂ ${TIDES.k2}). One face stays toward the star.`
      : `${formatQuantity("rotationHours", p.rotationHours)} Earth hours per rotation (assumed). ${f.solarDaysPerYear == null ? "No solar day cycle in the synchronous case." : `${format(f.solarDaysPerYear, 1)} modeled solar days per orbit.`}${f.tidalLock ? ` Tidal locking would take about ${formatYears(f.tidalLock.lockYears)}, longer than the assumed ${formatYears(f.tidalLock.ageYears)} system age.` : ""}`,
  );
  const findings = checkConsistency({ p, physics: f });
  $("modelNotesSummary").textContent = findings.length
    ? `Model notes (${findings.length})`
    : "Model notes";
  $("modelNotes").replaceChildren(
    ...(findings.length
      ? findings.map((finding) => {
          const li = document.createElement("li");
          li.textContent = `${finding.kind === "note" ? "Note" : "Inconsistency"}: ${finding.message}`;
          return li;
        })
      : [
          Object.assign(document.createElement("li"), {
            textContent: `All ${CONSISTENCY_RULES.length} consistency checks pass.`,
          }),
        ]),
  );
  $("modelWarnings").replaceChildren(
    ...f.warnings.map((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      return li;
    }),
  );
  const views = imageViews(p, f);
  for (const view of IMAGE_VIEWS) {
    const button = $(VIEW_BUTTONS[view]);
    button.hidden = !views.includes(view);
    button.textContent = viewLabel(p, f, view);
    button.classList.toggle("active", state.view === view);
    button.setAttribute("aria-pressed", String(state.view === view));
  }
  $("stageOrbital").textContent = r.images.orbital
    ? "02 · Orbital available"
    : rt.orbital === "pending"
      ? "02 · Rendering orbit"
      : "02 · Orbital view";
  $("stageSurface").textContent = r.images.surface
    ? "03 · View available"
    : rt.surface === "pending"
      ? "03 · Rendering view"
      : "03 · Explore closer";
  const image = $("planetImage"),
    failed = rt[state.view] === "error";
  image.hidden = !asset || failed;
  $("imagePlaceholder").hidden = Boolean(asset && !failed);
  $("placeholderLabel").textContent =
    rt[state.view] === "pending"
      ? "Rendering this perspective…"
      : failed
        ? "View not available yet"
        : "Model report ready";
  const token = `${r.id}:${state.view}:${asset?.url}`;
  image.dataset.token = token;
  $("imageOpen").dataset.format = "standard";
  $("illustrationPanel").setAttribute(
    "aria-busy",
    String(rt[state.view] === "pending"),
  );
  if (asset && !failed) {
    image.alt =
      REFERENCE_ASSETS[asset.url]?.alt ||
      `${r.name} — imagined ${viewLabel(p, f, state.view).toLowerCase()} illustration of a ${f.classification.split(" — ")[1]?.toLowerCase() || "fictional"} world.`;
    image.onerror = () => {
      if (image.dataset.token !== token || active()?.id !== r.id) return;
      rt[state.view] = "error";
      rt.errors[state.view] =
        "The saved image could not be loaded. Retry to load it again.";
      render();
    };
    if (image.getAttribute("src") !== asset.url) image.src = asset.url;
  }
  $("imageOpen").disabled = !asset || failed;
  $("imageOpen").setAttribute(
    "aria-label",
    `Expand ${state.view} image of ${r.name}`,
  );
  $("expandHint").hidden = !asset || failed;
  $("viewOnGlobe").hidden =
    !cartographyPreview || state.view !== "orbital" || !asset?.globeView;
  $("planetLabel").textContent =
    asset?.kind === "reference"
      ? "Reference illustration · imagined landscape"
      : asset?.globeView
        ? "AI illustration · guided by the planetary model"
        : "Artist interpretation · no surface observation implied";
  $("downloadBtn").disabled = !asset || failed;
  $("imageStatus").textContent =
    rt[state.view] === "pending"
      ? "Composing this illustration. It may take about a minute; your field report is ready to read below."
      : rt.errors[state.view] ||
        (!asset
          ? state.capabilities.images
            ? "This perspective is ready to render."
            : "Live imagery is unavailable. Explore the illustrated reference world or read this model report."
          : "");
  $("imageRetry").hidden =
    Boolean(asset && !failed) ||
    rt[state.view] === "pending" ||
    (!state.capabilities.images && !asset && !rt.errors[state.view]);
  $("imageRetry").textContent = asset
    ? "Reload saved image"
    : rt.errors[state.view]
      ? "Retry this view"
      : "Render this view";
  cartographyController?.refreshExpeditions();
}
function selectReport(report, { scroll = true, controls = true } = {}) {
  state.activeId = report.id;
  state.view = "orbital";
  if (controls) setControls(report.params, report.catalog);
  notice("");
  persist();
  render();
  const url = report.publicId
    ? `?report=${report.publicId}`
    : report.sample
      ? `?sample=${showcaseKey(report)}`
      : location.pathname;
  history.replaceState(null, "", url);
  if (scroll) scrollToReport();
}
async function runTask(r, kind, job) {
  const key = `${r.id}:${kind}`;
  if (state.tasks.has(key)) return state.tasks.get(key);
  const rt = runtime(r);
  rt[kind] = "pending";
  delete rt.errors[kind];
  const before = JSON.stringify(serializeReport(r));
  if (active()?.id === r.id) render();
  const task = (async () => {
    try {
      await job();
      rt[kind] = "complete";
      if (active()?.id === r.id)
        announce(
          `${kind.startsWith("expedition:") ? "Expedition" : kind === "analysis" ? "Interpretation" : kind + " image"} ready for ${r.name}.`,
        );
    } catch (error) {
      rt[kind] = "error";
      rt.errors[kind] = error.message;
      if (active()?.id === r.id) announce(error.message);
    } finally {
      if (JSON.stringify(serializeReport(r)) !== before) {
        r.publicId = null;
        r.sample = false;
        if (active()?.id === r.id)
          history.replaceState(null, "", location.pathname);
      }
      state.tasks.delete(key);
      persist();
      if (active()?.id === r.id) render();
      else renderHistory();
    }
  })();
  state.tasks.set(key, task);
  return task;
}
function requestExpedition(r, metadata, operation) {
  const kind = `expedition:${operation}:${metadata.key}`,
    key = `${r.id}:${kind}`;
  if (state.tasks.has(key)) return state.tasks.get(key);
  const field = operation === "image" ? "asset" : "narrative";
  if (r.expeditions.find((entry) => entry.key === metadata.key)?.[field])
    return Promise.resolve();
  const rt = runtime(r);
  rt.expeditionPending ||= new Map();
  const identities = new Set([
    ...r.expeditions.map((entry) => entry.key),
    ...rt.expeditionPending.keys(),
  ]);
  if (!identities.has(metadata.key) && identities.size >= MAX_EXPEDITIONS)
    return Promise.reject(
      new Error(
        `This report already has ${MAX_EXPEDITIONS} expeditions. Export a copy before starting another report.`,
      ),
    );
  rt.expeditionPending.set(
    metadata.key,
    (rt.expeditionPending.get(metadata.key) || 0) + 1,
  );
  return runTask(r, kind, async () => {
    const data = await post(
      "/api/expedition",
      {
        ...reportBody(r),
        cartography: r.cartography,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        heading: metadata.heading,
        operation,
      },
      operation === "image" ? 85000 : 38000,
    );
    if (
      !data[field] ||
      JSON.stringify(data.metadata) !== JSON.stringify(metadata)
    )
      throw new Error(
        "The expedition response does not match the selected world and camera.",
      );
    const previous = r.expeditions.find((entry) => entry.key === metadata.key);
    const merged = { ...metadata, ...previous, [field]: data[field] };
    const entries = [
      ...r.expeditions.filter((entry) => entry.key !== metadata.key),
      merged,
    ];
    r.expeditions = validateExpeditions(entries, r.cartography, r.params);
  }).finally(() => {
    const count = rt.expeditionPending.get(metadata.key) - 1;
    if (count) rt.expeditionPending.set(metadata.key, count);
    else rt.expeditionPending.delete(metadata.key);
  });
}
function requestNarrative(r) {
  return runTask(r, "analysis", async () => {
    const data = await post("/api/analyze", reportBody(r), 38000);
    r.narrative = validateNarrative(data.narrative);
    r.narrativeKind = "ai";
  });
}
function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image(),
      timer = setTimeout(() => {
        image.onload = image.onerror = null;
        reject(
          new Error("The saved image took too long to load. Please retry."),
        );
      }, 12000);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("The saved image could not be loaded. Please retry."));
    };
    image.src = url;
  });
}
function requestImage(r, view) {
  return runTask(r, view, async () => {
    if (!r.images[view]) {
      const data = await post(
          "/api/image",
          { ...reportBody(r), view, cartography: r.cartography },
          85000,
        ),
        asset = safeAsset(data.asset);
      if (!asset)
        throw new Error(
          "The image service returned an invalid image reference. Please retry.",
        );
      if (view === "orbital") orbitalAssetMetadata(asset, r.cartography);
      r.images[view] = asset;
    }
    await decodeImage(r.images[view].url);
  });
}
async function generate() {
  if (!$("surveyForm").reportValidity()) return;
  let params;
  try {
    params = readControls();
  } catch (error) {
    notice(error.message);
    announce(error.message);
    return;
  }
  const current = active();
  if (
    current &&
    !current.sample &&
    JSON.stringify(current.params) === JSON.stringify(params) &&
    JSON.stringify(current.catalog) === JSON.stringify(state.catalog) &&
    (runtime(current).launching ||
      [...state.tasks.keys()].some((k) => k.startsWith(current.id + ":")))
  ) {
    scrollToReport();
    return;
  }
  // Unchanged Randomize settings keep their seed, so the report has a permalink.
  const seed =
    state.seed != null &&
    !state.catalog &&
    JSON.stringify(params) ===
      JSON.stringify(
        paramsFromSeed(state.seed, params.biosphere, params.civilization),
      )
      ? state.seed
      : null;
  const r =
    seed != null
      ? seededReport(seed, params.biosphere, params.civilization)
      : createReport({
          params,
          catalog: state.catalog,
          name: `PSU-${Math.floor(Math.random() * 90000 + 10000)}`,
        });
  remember(r);
  selectReport(r);
  announce(`Model report ready for ${r.name}.`);
  runtime(r).launching = true;
  await refreshCapabilities();
  runtime(r).launching = false;
  if (state.instrument === "illustration") {
    if (state.capabilities.analysis) void requestNarrative(r);
    if (state.capabilities.images) void requestImage(r, "orbital");
  }
}
function setView(view) {
  const r = active();
  if (!r) return;
  state.view = view;
  render();
  if (
    !r.images[view] &&
    state.capabilities.images &&
    runtime(r)[view] !== "error"
  )
    void requestImage(r, view);
}
function openDialog(id) {
  $(id).showModal();
}
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => $(button.dataset.close).close()),
  );
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  }),
);
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const targets = [
      ...dialog.querySelectorAll(
        "button, input, select, textarea, a[href], [tabindex]",
      ),
    ].filter(
      (element) =>
        !element.disabled &&
        element.tabIndex >= 0 &&
        element.getClientRects().length,
    );
    const first = targets[0],
      last = targets.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }),
);
let expandedImage = null;
function showExpandedImage(asset, title, filename) {
  expandedImage = { asset, filename };
  $("lightboxImg").src = asset.url;
  $("lightboxImg").alt = title + " · imagined artist interpretation";
  $("lightboxTitle").textContent = title;
  openDialog("lightbox");
}
$("viewOnGlobe").addEventListener("click", () => {
  const r = active(),
    view = r?.images.orbital?.globeView;
  if (!cartographyPreview || !view) return;
  orbitalViewRequest = { report: r, view };
  state.instrument = "cartography";
  syncInstrument();
  $("tabCartography").focus();
});
$("imageOpen").addEventListener("click", () => {
  const r = active(),
    asset = r?.images[state.view];
  if (!asset) return;
  showExpandedImage(
    asset,
    `${r.name} · ${viewLabel(r.params, r.physics, state.view)}`,
    `${r.name.replace(/[^a-z0-9]/gi, "-")}-${state.view}.webp`,
  );
});
function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function downloadAsset(asset, filename) {
  if (!asset) return;
  try {
    const response = await fetch(asset.url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Download unavailable.");
    saveFile(await response.blob(), filename);
    announce("Image downloaded.");
  } catch {
    announce("The image could not be downloaded. Please try again.");
    notice("The image could not be downloaded. Please try again.");
  }
}
function downloadView() {
  const r = active();
  if (r)
    return downloadAsset(
      r.images[state.view],
      `${r.name.replace(/[^a-z0-9]/gi, "-")}-${state.view}.webp`,
    );
}
function exportReport() {
  const r = active();
  if (r)
    saveFile(
      new Blob([JSON.stringify(serializeReport(r), null, 2)], {
        type: "application/json",
      }),
      `${r.name.replace(/[^a-z0-9]/gi, "-")}-survey.json`,
    );
}
async function browse() {
  state.browseController?.abort();
  const controller = new AbortController();
  state.browseController = controller;
  $("browseList").replaceChildren();
  $("browseStatus").textContent = "Retrieving catalogue records…";
  $("browseRetry").hidden = true;
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const search = $("browseSearch").value.trim();
    const data = await request(
      "/api/exoplanets?" +
        new URLSearchParams({ filter: state.browseFilter, search }),
      { signal: controller.signal },
    );
    if (state.browseController !== controller) return;
    if (!Array.isArray(data.planets))
      throw new Error(
        "The catalogue returned an unexpected response. Please retry.",
      );
    $("browseStatus").textContent = data.planets.length
      ? `${data.planets.length} records · NASA composite catalogue. Select a world to survey its assumed environment.`
      : "No matching worlds. Try another name or filter.";
    for (const catalog of data.planets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "browse-item";
      const name = document.createElement("span");
      name.className = "browse-item-name";
      name.textContent = catalog.pl_name;
      const meta = document.createElement("span");
      meta.className = "browse-item-meta";
      meta.textContent = `${catalog.pl_rade == null ? "Radius unknown" : format(catalog.pl_rade, 3) + " Earth radii"} · ${catalog.pl_bmasse == null ? "Mass unknown" : format(catalog.pl_bmasse, 3) + " Earth masses"} · ${catalog.pl_orbper == null ? "Period unknown" : format(catalog.pl_orbper, 2) + " Earth days"}`;
      button.append(name, meta);
      button.addEventListener("click", () => {
        try {
          setControls(
            {
              ...paramsFromCatalog(catalog),
              biosphere: $("imaginedBiosphere").value,
              civilization: $("imaginedCivilization").value,
            },
            catalog,
          );
          $("browseModal").close();
          void generate();
        } catch (error) {
          $("browseStatus").textContent = error.message;
        }
      });
      $("browseList").append(button);
    }
  } catch (error) {
    if (state.browseController === controller) {
      $("browseStatus").textContent = error.message;
      $("browseRetry").hidden = false;
    }
  } finally {
    clearTimeout(timer);
  }
}
let sharingReport = null;
function showShareURL(url) {
  $("shareURL").value = url;
  $("shareURL").hidden = false;
  $("shareURLLabel").hidden = false;
  $("copyLink").hidden = false;
  $("publishShare").hidden = true;
}
function openShare() {
  sharingReport = active();
  if (!sharingReport) return;
  $("shareStatus").textContent = "";
  $("shareURL").hidden =
    $("shareURLLabel").hidden =
    $("copyLink").hidden =
      true;
  $("publishShare").hidden = false;
  $("publishShare").disabled = false;
  $("shareExplanation").textContent =
    "Create a public link containing this report and its available images. Anyone with the link can view it. Saved sites and selected coordinates are included. Later changes require a new link.";
  if (sharingReport.sample)
    showShareURL(
      location.origin +
        location.pathname +
        `?sample=${showcaseKey(sharingReport)}`,
    );
  else if (sharingReport.publicId)
    showShareURL(
      location.origin + location.pathname + "?report=" + sharingReport.publicId,
    );
  else if (sharingReport.seed != null) {
    // A seed link rebuilds the same world anywhere; publishing stays available
    // for the field note, sites and images exactly as they are.
    showShareURL(
      location.origin + location.pathname + seedQuery(sharingReport),
    );
    $("publishShare").hidden = !state.capabilities.sharing;
    $("shareExplanation").textContent =
      `This seed link rebuilds the same world for anyone, and reuses its images once they exist.${state.capabilities.sharing ? " Create a public link instead to include this field note and your saved sites." : ""}`;
  } else if (!state.capabilities.sharing) {
    $("publishShare").hidden = true;
    $("shareExplanation").textContent =
      "Public links are unavailable right now. Save this report as a file to keep its interpretation and available image references, or share the reference world.";
  }
  openDialog("shareDialog");
}
$("publishShare").addEventListener("click", async () => {
  const r = sharingReport;
  if (!r) return;
  const snapshot = serializeReport(r);
  $("publishShare").disabled = true;
  $("shareStatus").textContent = "Saving this report and its image references…";
  try {
    const data = await post("/api/reports", snapshot, 28000);
    if (!/^[a-f0-9-]{36}$/.test(data.id))
      throw new Error("The share service returned an invalid link.");
    // A late image or interpretation can change the current report while the saved snapshot remains valid.
    if (JSON.stringify(serializeReport(r)) === JSON.stringify(snapshot)) {
      r.publicId = data.id;
      persist();
    }
    if (sharingReport === r) {
      showShareURL(location.origin + location.pathname + "?report=" + data.id);
      $("shareStatus").textContent = "Your public report is ready.";
    }
  } catch (error) {
    if (sharingReport === r) $("shareStatus").textContent = error.message;
  } finally {
    $("publishShare").disabled = false;
  }
});
$("copyLink").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("shareURL").value);
    $("shareStatus").textContent = "Link copied.";
  } catch {
    $("shareURL").focus();
    $("shareURL").select();
    $("shareStatus").textContent = "Select and copy the link above.";
  }
});
$("surveyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void generate();
});
document
  .querySelectorAll('[data-action="survey"]')
  .forEach((button) => button.addEventListener("click", () => void generate()));
document.querySelectorAll('[data-action="sample"]').forEach((button) =>
  button.addEventListener("click", () => {
    const r = sampleReport(button.dataset.world || "boreal");
    remember(r);
    selectReport(r);
    announce(`${r.name} opened. Both perspectives are available.`);
  }),
);
$("surveyForm").addEventListener("input", updateValues);
$("atmosphere").addEventListener("change", () => syncAtmosphere(true));
$("detachCatalog").addEventListener("click", () => {
  const p = readControls();
  setControls(p);
  announce("Catalogue measurements are now editable as a fictional variation.");
});
$("randomizeBtn").addEventListener("click", () => {
  const seed = randomSeed();
  setControls(
    paramsFromSeed(
      seed,
      $("imaginedBiosphere").value,
      /** @type {any} */ ($("imaginedCivilization").value),
    ),
  );
  state.seed = seed;
  $("parameterDetails").open = true;
  $("parameterDetails").scrollIntoView({
    behavior: reducedMotion() ? "instant" : "smooth",
  });
  announce("New fictional scenario selected. Initiate a survey to explore it.");
});
$("createFromWelcome").addEventListener("click", openParameters);
$("editParamsBtn").addEventListener("click", openParameters);
function openParameters() {
  $("parameterDetails").open = true;
  $("parameterDetails").scrollIntoView({
    behavior: reducedMotion() ? "instant" : "smooth",
  });
  $("parameterDetails").querySelector("summary").focus({ preventScroll: true });
}
for (const view of IMAGE_VIEWS)
  $(VIEW_BUTTONS[view]).addEventListener("click", () => setView(view));
$("imageRetry").addEventListener("click", () => {
  if (active()) void requestImage(active(), state.view);
});
$("analysisRetry").addEventListener("click", () => {
  if (active()) void requestNarrative(active());
});
$("downloadBtn").addEventListener("click", downloadView);
$("lightboxDownload").addEventListener(
  "click",
  () =>
    expandedImage && downloadAsset(expandedImage.asset, expandedImage.filename),
);
$("exportBtn").addEventListener("click", exportReport);
$("shareExport").addEventListener("click", exportReport);
$("shareBtn").addEventListener("click", openShare);
// Field researcher: Claude drives the same tools a visitor uses.
const settingsSummary = (world) =>
  [
    world.catalogue_planet || "fictional",
    world.star_type?.split(" ")[0],
    world.orbit,
    `${world.atmosphere?.split(" (")[0]} ${world.pressure_bar} bar`,
    `${world.water_percent}% water`,
  ]
    .filter(Boolean)
    .join(" · ");
function resultSummary(name, content) {
  try {
    const data = JSON.parse(content);
    if (name === "search_catalogue")
      return data.planets.length
        ? `${data.planets.length} planets: ${data.planets.map((p) => p.pl_name).join(", ")}`
        : "No matching planets";
    return `${data.classification} · ${data.temperature_c}°C${data.temperature_kind === "equilibrium" ? " (equilibrium)" : ""} · ${data.water_phase} · ${data.gravity_g} g`;
  } catch {
    return content;
  }
}
function logResearch(event) {
  const item = document.createElement("li");
  item.className = `research-event research-${event.type}-event`;
  const target = (call) =>
    call.name === "search_catalogue"
      ? ` "${call.input.query || call.input.filter}"`
      : call.name === "compute_world"
        ? ` ${settingsSummary(call.input)}`
        : ` "${call.input.world_name}"`;
  item.textContent =
    event.type === "log"
      ? event.text
      : event.type === "tool"
        ? `→ ${event.name}${target(event)}`
        : event.type === "result"
          ? `← ${event.isError ? `Rejected: ${event.content}` : resultSummary(event.name, event.content)}`
          : `← Note returned for revision: ${event.reason}`;
  if (event.type === "result" && event.isError) item.classList.add("is-error");
  $("researchLog").append(item);
  item.scrollIntoView({ block: "nearest" });
}
async function research() {
  const brief = $("researchBrief").value.trim();
  state.researchController?.abort();
  const controller = new AbortController();
  state.researchController = controller;
  $("researchLog").replaceChildren();
  $("researchRun").disabled = true;
  $("researchStatus").textContent =
    "Surveying. Each model turn can take up to a minute.";
  try {
    const { report, reply } = await runFieldResearcher({
      brief,
      signal: controller.signal,
      post: (url, value) => post(url, value, 60000),
      searchCatalogue: async (query, filter) =>
        (
          await request(
            `/api/exoplanets?${new URLSearchParams(query ? { search: query } : { filter })}`,
            { signal: controller.signal },
            20000,
          )
        ).planets,
      onEvent: (event) => {
        if (state.researchController === controller) logResearch(event);
      },
    });
    if (state.researchController !== controller) return;
    if (!report) {
      $("researchStatus").textContent =
        reply || "The researcher finished without submitting a world.";
      return;
    }
    const r = createReport({
      params: report.params,
      catalog: report.catalog,
      physicsVersion: report.physicsVersion,
      name: report.name,
      narrative: report.narrative,
    });
    r.narrativeKind = "ai";
    remember(r);
    $("researchModal").close();
    selectReport(r);
    announce(`Field researcher report ready for ${r.name}.`);
    if (state.capabilities.images && state.instrument === "illustration")
      void requestImage(r, "orbital");
  } catch (error) {
    if (state.researchController === controller)
      $("researchStatus").textContent = error.message;
  } finally {
    if (state.researchController === controller) {
      state.researchController = null;
      $("researchRun").disabled = false;
    }
  }
}
$("researchBtn").addEventListener("click", () => {
  openDialog("researchModal");
  $("researchBrief").focus();
});
$("researchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  void research();
});
$("researchModal").addEventListener("close", () => {
  state.researchController?.abort();
  state.researchController = null;
  $("researchRun").disabled = false;
});
$("browseBtn").addEventListener("click", () => {
  openDialog("browseModal");
  void browse();
});
$("browseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  void browse();
});
$("browseRetry").addEventListener("click", browse);
$("browseModal").addEventListener("close", () => {
  state.browseController?.abort();
  state.browseController = null;
});
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    state.browseFilter = button.dataset.filter;
    $("browseSearch").value = "";
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    void browse();
  }),
);
$("clearHistory").addEventListener("click", () => {
  state.reports = active() ? [active()] : [];
  persist();
  renderHistory();
  announce("Previous surveys cleared. The open report has been kept.");
});
$("importReport").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error("This report file is too large.");
    const r = restoreReport(JSON.parse(await file.text()));
    remember(r);
    selectReport(r);
    announce("Saved report opened.");
  } catch (error) {
    notice(`This report could not be opened. ${error.message}`);
  }
  event.target.value = "";
});
let capabilityRequest = null;
function refreshCapabilities() {
  if (capabilityRequest) return capabilityRequest;
  state.capabilityStatus = "loading";
  renderAvailability();
  capabilityRequest = request("/api/capabilities", {}, 6000)
    .then((data) => {
      if (
        !["analysis", "images", "sharing"].every(
          (key) => typeof data[key] === "boolean",
        )
      )
        throw new Error("Invalid service response");
      state.capabilities = {
        analysis: data.analysis,
        images: data.images,
        sharing: data.sharing,
      };
      state.capabilityStatus = "ready";
    })
    .catch(() => {
      state.capabilities = { analysis: false, images: false, sharing: false };
      state.capabilityStatus = "error";
    })
    .finally(() => {
      capabilityRequest = null;
      renderAvailability();
      if (active()) render();
    });
  return capabilityRequest;
}
void refreshCapabilities();
async function boot() {
  setControls(DEFAULTS);
  $("parameterDetails").open = !matchMedia("(max-width: 960px)").matches;
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || "{}");
    state.reports = (
      Array.isArray(data.reports) ? data.reports.slice(0, 5) : []
    ).flatMap((value) => {
      try {
        return [restoreReport(value)];
      } catch {
        return [];
      }
    });
    state.activeId = data.selected;
  } catch {
    /* Storage may be disabled; the survey works in memory. */
  }
  const url = new URL(location.href);
  try {
    let r;
    if (url.searchParams.has("report")) {
      notice("Retrieving shared report…");
      const data = await request(
        "/api/reports?id=" + encodeURIComponent(url.searchParams.get("report")),
        {},
        18000,
      );
      r = restoreReport(data.report);
      r.publicId = url.searchParams.get("report");
    } else if (url.searchParams.has("seed")) {
      const biosphere = url.searchParams.get("biosphere") ?? "familiar";
      if (!["none", "familiar", "alien"].includes(biosphere))
        throw new Error("Choose None, Familiar or Alien for the biosphere.");
      const civilization = url.searchParams.get("civilization") ?? "none";
      if (!CIVILIZATIONS.includes(civilization))
        throw new Error("Choose a listed imagined civilization.");
      r = seededReport(
        Number(url.searchParams.get("seed")),
        /** @type {"none" | "familiar" | "alien"} */ (biosphere),
        /** @type {any} */ (civilization),
      );
    } else if (url.searchParams.has("sample"))
      r = sampleReport(url.searchParams.get("sample"));
    else if (location.hash.length > 1) {
      r = restoreLegacy(location.hash.slice(1));
    } else r = active();
    if (r) {
      remember(r);
      selectReport(r);
      if (url.hash)
        notice(
          "Legacy report opened. Numerical estimates have been recalculated with the current model; earlier imagery was not included in this link.",
        );
    } else renderHistory();
  } catch (error) {
    state.activeId = null;
    notice(error.message);
    renderHistory();
  }
}
void boot();

// The masthead returns to the introduction while keeping every saved survey.
document
  .querySelector('[data-action="home"]')
  .addEventListener("click", (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    state.activeId = null;
    state.view = "orbital";
    state.instrument = "illustration";
    orbitalViewRequest = null;
    syncInstrument();
    $("idleState").hidden = false;
    $("resultState").hidden = true;
    $("app").classList.remove("report-first");
    notice("");
    setControls(DEFAULTS);
    persist();
    renderAvailability();
    renderHistory();
    history.replaceState(null, "", location.pathname);
    $("welcomeTitle").focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  });

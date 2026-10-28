// @ts-check
// Server-side provenance for content that public reports display with an
// attribution: NASA catalogue records and AI-written field notes. A browser can
// upload any snapshot, so attribution is accepted only with a server signature.
import { sign, verify } from "./attest.js";
import {
  InputError,
  validateCatalog,
  narrativeContent,
  localNarrative,
  calculate,
  SHOWCASE_WORLDS,
  DEFAULTS,
} from "./planet.js";

const CATALOG_ATTESTATION = "catalog-1";
const NARRATIVE_ATTESTATION = "narrative-1";
const EXPEDITION_NOTES_ATTESTATION = "expedition-notes-1";

/** @param {import("./planet.js").CatalogRecord} record */
function catalogPayload(record) {
  const { signature: _signature, ...fields } = record;
  return [CATALOG_ATTESTATION, fields];
}

/** @param {import("./planet.js").CatalogRecord} record */
export function signCatalog(record) {
  const clean = validateCatalog(record);
  if (!clean) throw new InputError("A catalogue record is required.");
  return { ...clean, signature: sign(catalogPayload(clean)) };
}

/**
 * Accepts only catalogue records this server returned from the NASA archive,
 * so a request cannot attribute invented values or prompt text to NASA.
 * @param {unknown} input
 */
export function verifiedCatalog(input) {
  const record = validateCatalog(input);
  if (!record) return null;
  if (!verify(catalogPayload(record), record.signature))
    throw new InputError(
      "This catalogue record could not be verified. Reopen the planet from the NASA catalogue, or detach it to create a fictional variation.",
    );
  return record;
}

/**
 * A note is bound to the world it describes: parameters, catalogue record and
 * the physics version whose numbers it quotes.
 * @param {import("./planet.js").Params} params
 * @param {import("./planet.js").CatalogRecord | null} catalog
 * @param {string} physicsVersion
 * @param {import("./planet.js").Narrative} narrative
 */
function narrativePayload(params, catalog, physicsVersion, narrative) {
  const { signature: _signature, ...catalogFields } = catalog || {};
  return [
    NARRATIVE_ATTESTATION,
    params,
    catalog ? catalogFields : null,
    physicsVersion,
    narrativeContent(narrative),
  ];
}

/**
 * @param {import("./planet.js").Params} params
 * @param {import("./planet.js").CatalogRecord | null} catalog
 * @param {string} physicsVersion
 * @param {import("./planet.js").Narrative} narrative
 */
export function signNarrative(params, catalog, physicsVersion, narrative) {
  return {
    ...narrativeContent(narrative),
    signature: sign(
      narrativePayload(params, catalog, physicsVersion, narrative),
    ),
  };
}

/**
 * @param {import("./planet.js").Params} params
 * @param {import("./planet.js").CatalogRecord | null} catalog
 * @param {string} physicsVersion
 * @param {import("./planet.js").Narrative} narrative
 */
export function verifyNarrative(params, catalog, physicsVersion, narrative) {
  return verify(
    narrativePayload(params, catalog, physicsVersion, narrative),
    narrative?.signature,
  );
}

/** @param {string} key @param {{description: string, surfaceFeatures: string}} notes */
export function signExpeditionNotes(key, notes) {
  return {
    description: notes.description,
    surfaceFeatures: notes.surfaceFeatures,
    signature: sign([
      EXPEDITION_NOTES_ATTESTATION,
      key,
      notes.description,
      notes.surfaceFeatures,
    ]),
  };
}

/** @param {string} key @param {{description: string, surfaceFeatures: string, signature?: string}} notes */
export function verifyExpeditionNotes(key, notes) {
  return verify(
    [
      EXPEDITION_NOTES_ATTESTATION,
      key,
      notes.description,
      notes.surfaceFeatures,
    ],
    notes.signature,
  );
}

/**
 * The note a public report may show when it carries no verified AI note:
 * the curated text for an unmodified showcase world, otherwise the local
 * model note derived from the parameters. Uploaded free text never survives.
 * @param {{id?: unknown, params: import("./planet.js").Params, catalog: import("./planet.js").CatalogRecord | null, physicsVersion?: string}} report
 */
export function canonicalNarrative(report) {
  const key = Object.keys(SHOWCASE_WORLDS).find(
    (name) => report.id === `${name}-reference`,
  );
  if (key && !report.catalog) {
    const world =
      SHOWCASE_WORLDS[/** @type {keyof typeof SHOWCASE_WORLDS} */ (key)];
    const expected = { ...DEFAULTS, ...world.params };
    if (
      Object.entries(expected).every(
        ([name, value]) =>
          report.params[/** @type {keyof typeof expected} */ (name)] === value,
      )
    )
      return {
        description: world.description,
        surfaceFeatures: world.surfaceFeatures,
        kind: /** @type {const} */ ("reference"),
      };
  }
  return {
    ...localNarrative(
      report.params,
      calculate(report.params, report.catalog, report.physicsVersion),
    ),
    kind: /** @type {const} */ ("model"),
  };
}

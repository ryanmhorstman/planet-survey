import { validateCatalog, InputError } from "../lib/planet.js";
import { method, fail, providerJSON, ServiceError } from "../lib/server.js";
const cache = new Map();
const filters = {
  all: "pl_rade between 0.1 and 4",
  temperate: "pl_eqt between 200 and 320 and pl_rade between 0.5 and 2.5",
  earthsize: "pl_rade between 0.8 and 1.5",
  superearth: "pl_rade between 1.5 and 4",
  trappist: "hostname = 'TRAPPIST-1'",
};
export function catalogQuery(query) {
  if (Object.keys(query).some((key) => !["filter", "search"].includes(key)))
    throw new InputError("Use a catalogue filter or planet-name search.");
  const filter = query.filter || "all",
    search = query.search || "";
  if (
    !Object.hasOwn(filters, filter) ||
    typeof search !== "string" ||
    search.length > 80 ||
    !/^[\p{L}\p{N} ._+'-]*$/u.test(search)
  )
    throw new InputError(
      "Use a supported filter and a planet name of at most 80 characters.",
    );
  const condition = search.trim()
    ? `lower(pl_name) like '%${search.trim().toLowerCase().replaceAll("'", "''")}%'`
    : filters[filter];
  return `select top 40 pl_name,hostname,pl_rade,pl_bmasse,pl_eqt,pl_orbper,pl_orbsmax,st_spectype,st_mass,st_rad,st_lum from pscomppars where ${condition} order by pl_name asc`;
}
export default async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const query = catalogQuery(req.query || {}),
      now = Date.now();
    if (cache.get(query)?.until > now) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=3600",
      );
      return res.status(200).json(cache.get(query).data);
    }
    const url = new URL("https://exoplanetarchive.ipac.caltech.edu/TAP/sync");
    url.search = new URLSearchParams({ query, format: "json" });
    const rows = await providerJSON(url, {}, 12000);
    if (!Array.isArray(rows))
      throw new ServiceError(
        502,
        "The catalogue returned an unexpected response. Please retry.",
        "INVALID_RESPONSE",
      );
    const planets = rows.flatMap((row) => {
      try {
        return [validateCatalog(row)];
      } catch {
        return [];
      }
    });
    if (rows.length && !planets.length)
      throw new ServiceError(
        502,
        "These catalogue records could not be read. Please try another search.",
        "INVALID_RESPONSE",
      );
    const data = {
      planets,
      source: "NASA Exoplanet Archive · Planetary Systems Composite Parameters",
      retrievedAt: new Date().toISOString(),
    };
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(query, { data, until: now + 3600000 });
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=3600",
    );
    return res.status(200).json(data);
  } catch (error) {
    return fail(res, error);
  }
}

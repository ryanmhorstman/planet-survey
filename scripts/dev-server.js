import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { vendorThree } from "./vendor-three.js";
const root = fileURLToPath(new URL("../", import.meta.url));
if (process.env.PLANET_OPENAI_KEY && !process.env.OPENAI_API_KEY)
  process.env.OPENAI_API_KEY = process.env.PLANET_OPENAI_KEY;
await vendorThree(root + "assets/vendor");
const handlers = {};
for (const name of [
  "analyze",
  "image",
  "exoplanets",
  "reports",
  "capabilities",
  "expedition",
  "agent",
])
  handlers[`/api/${name}`] = (await import(`../api/${name}.js`)).default;
const types = {
  html: "text/html; charset=utf-8",
  css: "text/css",
  js: "text/javascript",
  png: "image/png",
  webp: "image/webp",
  woff2: "font/woff2",
};
const config = JSON.parse(await readFile(root + "vercel.json", "utf8"));
http
  .createServer(async (req, res) => {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (value) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    for (const header of config.headers?.[0]?.headers || [])
      res.setHeader(header.key, header.value);
    try {
      const url = new URL(req.url, "http://localhost");
      if (handlers[url.pathname]) {
        req.query = Object.fromEntries(url.searchParams);
        // Match a trusted edge's forwarded address; clients cannot spoof quotas locally.
        req.headers["x-real-ip"] = req.socket.remoteAddress;
        req.headers["x-forwarded-for"] = req.socket.remoteAddress;
        let bytes = 0,
          chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (
            bytes >
            ({ "/api/reports": 100000, "/api/agent": 64000 }[url.pathname] ??
              24000)
          )
            return res.status(413).json({ error: "Request is too large." });
          chunks.push(chunk);
        }
        const text = Buffer.concat(chunks).toString();
        if (text) {
          try {
            req.body = JSON.parse(text);
          } catch {
            return res.status(400).json({ error: "Send valid JSON." });
          }
        }
        return await handlers[url.pathname](req, res);
      }
      if (!["GET", "HEAD"].includes(req.method))
        return res.status(405).json({ error: "Method not allowed." });
      let file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (
        ![
          "index.html",
          "styles.css",
          "app.js",
          "lib/planet.js",
          "lib/client-report.js",
          "lib/cartography-record.js",
          "lib/expedition-record.js",
          "lib/orbital-record.js",
          "lib/water-phase.js",
          "lib/geography.js",
          "lib/geography-worker.js",
          "lib/globe.js",
          "lib/terrain.js",
          "lib/terrain-detail.js",
          "lib/region.js",
          "lib/agent-tools.js",
          "lib/field-researcher.js",
          "assets/vendor/three.core.js",
          "assets/vendor/three.module.js",
          "assets/vendor/OrbitControls.js",
          "og-image.png",
        ].includes(file) &&
        !/^assets\/[a-zA-Z0-9_/-]+\.(webp|woff2)$/.test(file)
      )
        return res.status(404).json({ error: "Not found." });
      const data = await readFile(root + file);
      res.setHeader(
        "Content-Type",
        types[file.split(".").pop()] || "application/octet-stream",
      );
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      res.status(error.code === "ENOENT" ? 404 : 500).json({
        error:
          error.code === "ENOENT"
            ? "Not found."
            : "The request could not be completed.",
      });
    }
  })
  .listen(Number(process.env.PORT || 3000), "127.0.0.1", () =>
    console.log("PSU-7 development server ready"),
  );

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
export function siteOrigin(env = process.env) {
  const value = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null);
  if (!value) return null;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('SITE_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  return url.origin;
}
export async function build(output = resolve(root, 'dist'), env = process.env) {
  const origin = siteOrigin(env);
  if (env.VERCEL && !origin) throw new Error('Set SITE_URL or enable Vercel system environment variables for social metadata.');
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  for (const file of ['styles.css', 'app.js', 'og-image.png', 'assets', 'lib/planet.js', 'lib/client-report.js']) {
    await mkdir(resolve(output, file, '..'), { recursive: true }); await cp(resolve(root, file), resolve(output, file), { recursive: true });
  }
  let html = await readFile(resolve(root, 'index.html'), 'utf8');
  if (origin) {
    const escaped = origin.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    html = html.replace('content="/og-image.png"', `content="${escaped}/og-image.png"`);
    html = html.replace('</head>', `  <link rel="canonical" href="${escaped}/">\n  <meta property="og:url" content="${escaped}/">\n  <meta name="twitter:image" content="${escaped}/og-image.png">\n</head>`);
  }
  await writeFile(resolve(output, 'index.html'), html);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build(); console.log('Static site built in dist/; Vercel deploys api/ as server functions.');
}

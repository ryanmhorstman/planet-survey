// Reproducible same-origin modules from the pinned npm dependency. No CDN/import map.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
export async function vendorThree(destination) {
  await mkdir(destination, { recursive: true });
  const source = new URL("../node_modules/three/", import.meta.url);
  for (const file of ["three.core.js", "three.module.js"])
    await cp(new URL(`build/${file}`, source), `${destination}/${file}`);
  const controls = await readFile(
    new URL("examples/jsm/controls/OrbitControls.js", source),
    "utf8",
  );
  await writeFile(
    `${destination}/OrbitControls.js`,
    controls.replace("from 'three'", "from './three.module.js'"),
  );
  await cp(new URL("LICENSE", source), `${destination}/LICENSE`);
}

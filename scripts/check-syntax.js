// Syntax-check every first-party JavaScript module, so new files are covered
// without editing a list.
import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = ["app.js"];
for (const dir of ["api", "lib", "scripts", "tests"])
  for (const name of await readdir(dir))
    if (/\.(m?js)$/.test(name)) files.push(`${dir}/${name}`);
for (const file of files)
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log(`Syntax OK: ${files.length} files`);

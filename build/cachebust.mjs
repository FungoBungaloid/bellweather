// Append ?v=<VER> to local ESM imports + the index.html entry so a normal
// refresh always pulls a consistent module graph (no stale-cache crashes).
import { readFileSync, writeFileSync, readdirSync } from "fs";
const VER = process.argv[2] || String(Date.now());
const reImport = /(from\s*["']|import\(\s*["'])(\.\.?\/[^"']+?\.js)(\?v=[^"']*)?(["'])/g;
const bust = (s) => s.replace(reImport, (_m, p1, spec, _old, p4) => `${p1}${spec}?v=${VER}${p4}`);

for (const f of readdirSync("src")) {
  if (!f.endsWith(".js")) continue;
  const p = `src/${f}`;
  writeFileSync(p, bust(readFileSync(p, "utf8")));
}
// index.html entry script
let html = readFileSync("index.html", "utf8");
html = html.replace(/(src=["']\.\/src\/main\.js)(\?v=[^"']*)?(["'])/, `$1?v=${VER}$3`);
writeFileSync("index.html", html);
console.log("cache-busted to v=" + VER);

import { build } from "esbuild";
await build({
  entryPoints: ["build/entry.js"],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: "vendor/libs.js",
  legalComments: "none",
});
console.log("wrote vendor/libs.js");

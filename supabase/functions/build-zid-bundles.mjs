// ============================================================================
// يولّد <fn>/<fn>.bundle.ts لدوالّ زد الثلاث: _shared/zid.ts مدمجاً داخل كل دالّة،
// للّصق في محرّر الدالّة بلوحة Supabase (المحرّر لا يرى ../_shared).
//
// ⚠ المصدر الحقيقي هو index.ts و_shared/zid.ts — الحزم مُولَّدة. بعد أي تعديل:
//      node supabase/functions/build-zid-bundles.mjs
//   والحارس tests/zid-oauth.mjs يرسب إن انحرفت حزمة عن مصدرها (نشرُ كود قديم بصمت).
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ZID_FUNCTIONS = ["zid-oauth-start", "zid-oauth-callback", "zid-app-callback"];
const DIR = dirname(fileURLToPath(import.meta.url));
const lf = s => s.replace(/\r\n/g, "\n");

export function buildBundle(name) {
  const shared = lf(readFileSync(join(DIR, "_shared", "zid.ts"), "utf8")).replace(/^export\s+/gm, "");
  const src = lf(readFileSync(join(DIR, name, "index.ts"), "utf8"));
  const body = src.replace(/^import\s*\{[\s\S]*?\}\s*from\s*"\.\.\/_shared\/zid\.ts";\n/m, "");
  if (body === src) throw new Error(name + ": لم يُعثر على استيراد ../_shared/zid.ts");
  return "// ⚠ ملف مُولَّد — لا تحرّره يدوياً. المصدر: " + name + "/index.ts ＋ _shared/zid.ts\n" +
    "//   أعِد التوليد: node supabase/functions/build-zid-bundles.mjs\n" +
    "// الصقه كاملاً في محرّر الدالّة بلوحة Supabase.\n\n" +
    "// ───────── _shared/zid.ts (مدمج) ─────────\n" + shared +
    "\n// ───────── " + name + "/index.ts ─────────\n" + body;
}

export const bundlePath = name => join(DIR, name, name + ".bundle.ts");

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const n of ZID_FUNCTIONS) { writeFileSync(bundlePath(n), buildBundle(n)); console.log("✓ " + n + ".bundle.ts"); }
}

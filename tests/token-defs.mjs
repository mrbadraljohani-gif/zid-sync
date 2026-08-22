// ============================================================================
// حارس التوكنات — أي var(--X) بلا fallback لتوكن غير معرّف في :root ⇒ رسوب.
// الخطر: var(--frost)/var(--fg) لتوكن غير موجود يسقط صامتاً إلى currentColor (أو
// initial) — لون قد يمرّ من حارس التباين (ضمن اللوحة) ولا يظهر في الفاحص المُرندَر.
// هذا النوع لا يُمسَك إلا بمطابقة الاستدعاء بالتعريف نصّياً.
//
// var(--X, fallback) آمن (يستعمل البديل) فيُستثنى. التعليقات تُجرَّد قبل المسح.
// self-check: node tests/token-defs.mjs --broken  (يحقن var(--لا-يوجد) ويؤكّد المسك)
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const BROKEN = process.argv.includes("--broken");

// كل كتل <style>…</style> (الملف كتلة واحدة عملياً، لكن نكون دفاعيين)
let css = "";
for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) css += "\n" + m[1];
// جرّد تعليقات CSS كي لا يُحسَب نصّ داخلها استدعاءً/تعريفاً
css = css.replace(/\/\*[\s\S]*?\*\//g, "");
if (BROKEN) css += "\n.__inject { color: var(--nonexistent-token-xyz); }";

const defined = new Set();
for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);

const noFallback = new Map();   // token -> count (var(--X) بلا فاصلة)
for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*(,)?/g)) {
  if (!m[2]) noFallback.set(m[1], (noFallback.get(m[1]) || 0) + 1);
}
const bad = [...noFallback.keys()].filter(t => !defined.has(t)).sort();

if (BROKEN) {
  if (bad.includes("--nonexistent-token-xyz")) { console.log("✅ [self] الحارس يمسك var(--X) لتوكن غير معرّف: " + bad.join(" · ")); process.exit(0); }
  console.error("✗ [self] الحارس أعمى: لم يمسك التوكن المحقون"); process.exit(1);
}
if (bad.length) {
  console.error("✗ توكنات مُستدعاة بلا fallback وغير معرّفة (تسقط صامتة إلى currentColor):");
  for (const t of bad) console.error(`  ${t}  ×${noFallback.get(t)}`);
  process.exit(1);
}
console.log(`✅ كل var(--X) بلا fallback يشير إلى توكن معرّف (${defined.size} توكناً معرّفاً).`);

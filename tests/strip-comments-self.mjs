// ============================================================================
// G-STRIP — المُجرِّد الذي تعتمد عليه حراس الغياب (tests/lib/strip-comments.mjs) سليم بالقيمة:
//   ① حالات محدّدة: نصّ فيه // · regex فيه " · قسمة · قالب متداخل `…${ `…` }…` · تعليق داخل ${…}
//   ② على index.html والدالّة الطرفية الحقيقيّين: يُحلَّل بعد التجريد · الأسطر محفوظة ·
//      كل سطر تغيّر قُطع عند بداية تعليق (لا يقصّ كوداً) · لا «//» تعليقيّ باقٍ (لا يفوّت تعليقاً).
// لماذا ②: «يُحلَّل بعد التجريد» وحده مرّ على نسخة تختلّ بعد أوّل قالب متداخل (فأبقت تعليقاً
//   ظاهراً داخل salesQueryRun) — اختلال التتبّع لا يُحدث خطأ صياغة بالضرورة.
// --broken: يستبدل المُجرِّد بنسخة تعامل القالب نصّاً مسطّحاً (العطل الأوّل) ⇒ يجب أن يرسب.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as realStrip } from "./lib/strip-comments.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROKEN = process.argv.includes("--broken");

// النسخة المعطوبة: القالب ينتهي عند أوّل ` (لا تتبّع لـ${…})
function flatStrip(src) {
  let out = "", i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; out += " "; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2), st = e < 0 ? n : e + 2; out += " " + src.slice(i, st).replace(/[^\n]/g, ""); i = st; continue; }
    if (c === '"' || c === "'" || c === "`") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === "\\") j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    out += c; i++;
  }
  return out;
}
const strip = BROKEN ? flatStrip : realStrip;
const fails = [];

// ① حالات بالقيمة
const cases = [
  ['x = "a//b"; // c', 'x = "a//b";  ', "نصّ فيه // يبقى"],
  ["y = /\"/g; z = 'k' // q", "y = /\"/g; z = 'k'  ", "regex فيه \" لا يفتح نصّاً"],
  ["a = b / c / d; // e", "a = b / c / d;  ", "القسمة ليست regex"],
  ["q = `t//${1}`; // e", "q = `t//${1}`;  ", "// داخل قالب يبقى"],
  ["v = `a${ c ? `<b>${x}</b>` : \"-\" }z`;\n// gone\nw = 1;", "v = `a${ c ? `<b>${x}</b>` : \"-\" }z`;\n \nw = 1;", "قالب متداخل ثم تعليق يُزال"],
  ["u = `${ f(/* in */ 2) }`;", "u = `${ f(  2) }`;", "تعليق داخل ${…} يُزال"],
  ["/* a\nb */ k = 1;", " \n k = 1;", "تعليق كتلة يحفظ الأسطر"],
];
for (const [src, want, label] of cases) {
  const got = strip(src);
  if (got !== want) fails.push(`① ${label}: توقّعت ${JSON.stringify(want)} وجدت ${JSON.stringify(got)}`);
}

// ② على المصادر الحقيقية
function checkReal(label, s) {
  const t = strip(s);
  try { new Function(t); } catch (e) { fails.push(`② ${label}: لا يُحلَّل بعد التجريد — ${e.message}`); }
  const A = s.split("\n"), B = t.split("\n");
  if (A.length !== B.length) fails.push(`② ${label}: عدد الأسطر تغيّر ${A.length}→${B.length}`);
  let badCut = 0, sample = "";
  for (let k = 0; k < Math.min(A.length, B.length); k++) {
    const a = A[k], b = B[k]; if (a === b) continue;
    let p = 0; while (p < a.length && a[p] === b[p]) p++;
    const cut = a.slice(p).trimStart();
    if (!(cut.startsWith("//") || cut.startsWith("/*") || b.trim() === "" || /\*\//.test(a))) { badCut++; sample ||= `L${k + 1}: ${a.slice(Math.max(0, p - 20), p + 30)}`; }
  }
  if (badCut) fails.push(`② ${label}: ${badCut} سطراً قُصّ في غير تعليق (يقصّ كوداً) — ${sample}`);
  const missed = [...t.matchAll(/(^|[\s;{}()])\/\/[^\n]*/g)];
  if (missed.length) fails.push(`② ${label}: ${missed.length} تعليقاً فائتاً — مثل ${JSON.stringify(missed[0][0].slice(0, 60))}`);
}
const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
checkReal("index.html", html.slice(html.lastIndexOf("\n<script>\n") + 10, html.lastIndexOf("\n</script>")));
const edge = readFileSync(join(root, "supabase", "functions", "ai-assistant", "index.ts"), "utf8").replace(/\r\n/g, "\n");
checkReal("ai-assistant/index.ts", edge.replace(/^\s*import\s[^\n]*\n/gm, "\n").replace(/^export /gm, ""));

if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-STRIP مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) المُجرِّد المسطّح مرّ — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-STRIP:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-STRIP: ${cases.length} حالات بالقيمة · index.html والدالّة الطرفية: يُحلَّلان · الأسطر محفوظة · لا قصّ لكود · لا تعليق فائت.`);

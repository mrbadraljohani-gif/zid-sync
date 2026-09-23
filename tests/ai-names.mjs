// ============================================================================
// G-AI-NAMES — فصل اسم المنتج عن الأكواد (القيمة، لا الشكل):
//   يحذف قائمة الأكواد الملتصقة (أرقام ≥5 خانات مفصولة بفواصل/نقاط) ويُبقي الأوصاف (120*200 · 8ك · ش14 · رقم مفرد).
//   والأصل يبقى متاحاً (original) — لا نفقد معلومة، نخفيها.
// --broken: CODELIST_RE يبتلع أي رقم في النهاية ⇒ يحذف أوصافاً (120*200) ⇒ يرسب.
// ============================================================================
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "supabase", "functions", "ai-assistant", "intents.mjs");
const BROKEN = process.argv.includes("--broken");

let url = pathToFileURL(SRC).href, tmp = "";
if (BROKEN) {
  let s = readFileSync(SRC, "utf8");
  const A = "const CODELIST_RE = /\\s*[-–—]?\\s*\\d{5,}(?:[.,]\\s*\\d{3,})+\\s*$/;";
  if (!s.includes(A)) { console.error("✗ (--broken) لم أجد CODELIST_RE"); process.exit(2); }
  s = s.replace(A, "const CODELIST_RE = /\\s*\\d+.*$/;   // (--broken) نهم: يبتلع أي رقم فأكثر");
  tmp = join(dirname(SRC), "_broken_names.mjs"); writeFileSync(tmp, s); url = pathToFileURL(tmp).href;
}
const { cleanName } = await import(url);
const strip = "كرسي ارضي M2 - 0070373,303462,303988,301737,304501.304500";
const keeps = ["مفرش مقاس 120*200", "سكر 8ك", "برميل 35لتر", "رف ش14", "منتج 12345"];   // أوصاف/رقم مفرد تبقى
const stripOut = cleanName(strip);
const keepOuts = keeps.map(k => ({ in: k, out: cleanName(k).clean }));
if (tmp) unlinkSync(tmp);

if (BROKEN) {
  const harmed = keepOuts.find(k => k.out !== k.in);
  if (harmed) { console.log(`✅ (--broken) G-AI-NAMES مسك العطل: التنظيف النهم أتلف وصفاً «${harmed.in}» ⇒ «${harmed.out}».`); process.exit(0); }
  console.error("✗ (--broken) لم يُتلَف وصف — لا أسنان."); process.exit(1);
}
const fails = [];
if (stripOut.clean !== "كرسي ارضي M2") fails.push(`لم تُحذف قائمة الأكواد: «${stripOut.clean}»`);
if (stripOut.original !== strip) fails.push("الأصل لم يبقَ متاحاً (original)");
for (const k of keepOuts) if (k.out !== k.in) fails.push(`حُذف وصف مشروع: «${k.in}» ⇒ «${k.out}»`);
if (fails.length) { console.error("✗ G-AI-NAMES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-NAMES: الأكواد تُحذف («${stripOut.clean}») والأوصاف/الرقم المفرد تبقى · الأصل محفوظ.`);

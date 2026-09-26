// ============================================================================
// G-COST — سعر التكلفة (دفعة ٢): كشف الرأس ＋ التخزين الخام ＋ اختياريّته (القيمة، لا الشكل):
//   ① «سعر التكلفة»/«التكلفه»/«التكلفة»/cost/cost_price ⇒ تُكشف تكلفةً لا سعرَ بيع (لا تُلتقط incl).
//   ② 🚨 التخزين الخام: خليّة 100 ⇒ cost_price = 100 (لا 115) — صفر ضرب/ضريبة.
//   ③ اختياريّ: ملف بلا عمود التكلفة ⇒ cost_price = null بلا خطأ (وبلا تصفير سعر البيع).
//   ④ فرعا الحراج (xbranch=false) ⇒ لا مفتاح cost_price في الصفّ (جدولهما بلا العمود).
// --broken: يُزال استثناء «تكلف/cost» من نمط incl ⇒ «سعر التكلفة» تُلتقط سعرَ بيع ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const A = 'incl:    x => !x.includes("تكلف") && !x.includes("cost") && (x.includes("سامل") || x.includes("incl") || x.includes("price") || (x.includes("سعر") && !x.includes("قبل"))),';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد نمط incl مع استثناء التكلفة"); process.exit(2); }
  html = html.replace(A, 'incl:    x => (x.includes("سامل") || x.includes("incl") || x.includes("price") || (x.includes("سعر") && !x.includes("قبل"))),');   // بلا استثناء ⇒ «سعر التكلفة» تُلتقط سعرَ بيع
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(() => {
  const H = ["رقم الصنف", "الاسم", "الكمية", "سعر البيع شامل الضريبة", "سعر التكلفة"];
  const m = detectInvCols(H);
  // كشف المرادفات: كلٌّ يُكشف تكلفةً لا سعراً
  const variant = lbl => { const mm = detectInvCols(["كود", "اسم", "الكمية", "السعر", lbl]); return { cti: mm.cti, ii: mm.ii }; };
  const vTakalfa = variant("سعر التكلفة"), vTakalfe = variant("التكلفه"), vTakalfa2 = variant("التكلفة"), vCost = variant("cost"), vCostP = variant("cost_price");
  // التكلفة **قبل** سعر البيع في الترتيب: لولا استثناء incl لالتقط findIndex عمودَ التكلفة (الأسبق) سعرَ بيع
  const cf = detectInvCols(["كود", "اسم", "الكمية", "سعر التكلفة", "سعر البيع شامل الضريبة"]);
  const vCostFirst = { cti: cf.cti, ii: cf.ii };
  // ② التخزين الخام: خليّة 100 ⇒ 100 (لا 115)
  const list = parseInvRows([H, ["C1", "صنف", "5", "115", "100"]]);
  const agg = aggregateInv(list, "wh");
  const rows = buildInvDbRows(agg, null, true);           // withCost=true (مستودع/فرع)
  const costStored = rows[0] ? rows[0].cost_price : "MISSING";
  // ③ اختياريّ: بلا عمود تكلفة ⇒ null بلا خطأ
  const H2 = ["رقم الصنف", "الاسم", "الكمية", "سعر البيع شامل الضريبة", "سعر البيع قبل الضريبة"];
  const rows2 = buildInvDbRows(aggregateInv(parseInvRows([H2, ["C2", "صنف", "5", "115", "100"]]), "wh"), null, true);
  const costOptional = rows2[0] ? rows2[0].cost_price : "MISSING";
  const inclOptional = rows2[0] ? rows2[0].price_incl : "MISSING";   // سعر البيع سليم (لم يُصفَّر)
  // ④ الحراج (withCost=false) ⇒ لا مفتاح cost_price
  const rowsX = buildInvDbRows(agg, "haraj_maf", false);
  const harajHasCost = rowsX[0] ? ("cost_price" in rowsX[0]) : true;
  return { cti: m.cti, ii: m.ii, ei: m.ei, vTakalfa, vTakalfe, vTakalfa2, vCost, vCostP, vCostFirst, costStored, costOptional, inclOptional, harajHasCost };
});
await b.close();

if (BROKEN) {
  // على المعطوب: التكلفة الأسبق تُلتقط سعرَ بيع ⇒ ii=3 (عمود التكلفة)
  if (res.vCostFirst.ii === 3) { console.log(`✅ (--broken) G-COST مسك العطل: «سعر التكلفة» (الأسبق) التُقطت سعرَ بيع (ii=${res.vCostFirst.ii}).`); process.exit(0); }
  console.error("✗ (--broken) لم يُلتقَط الخلط — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.cti !== 4) fails.push(`① «سعر التكلفة» لم تُكشف عموداً للتكلفة (cti=${res.cti}, توقّعت 4)`);
if (res.ii !== 3) fails.push(`① سعر البيع (شامل) لم يُكشف على العمود 3 (ii=${res.ii}) — التُقطت التكلفة بدلاً منه؟`);
if (res.vCostFirst.cti !== 3 || res.vCostFirst.ii !== 4) fails.push(`① التكلفة قبل السعر: التُقطت خطأً (cti=${res.vCostFirst.cti}, ii=${res.vCostFirst.ii}، توقّعت cti=3 ii=4)`);
for (const [k, v] of Object.entries({ "سعر التكلفة": res.vTakalfa, "التكلفه": res.vTakalfe, "التكلفة": res.vTakalfa2, "cost": res.vCost, "cost_price": res.vCostP }))
  if (v.cti !== 4) fails.push(`① المرادف «${k}» لم يُكشف تكلفةً (cti=${v.cti})`);
  else if (v.ii === 4) fails.push(`① المرادف «${k}» التُقط سعرَ بيع (ii=4)`);
if (res.costStored !== 100) fails.push(`② 🚨 التخزين ليس خاماً: خليّة 100 ⇒ ${res.costStored} (يجب 100 لا 115)`);
if (res.costOptional !== null) fails.push(`③ ملف بلا عمود تكلفة ⇒ cost_price ليس null: ${res.costOptional}`);
if (res.inclOptional !== 115) fails.push(`③ سعر البيع تأثّر بغياب التكلفة: ${res.inclOptional} (يجب 115)`);
if (res.harajHasCost) fails.push("④ صفّ الحراج يحمل مفتاح cost_price (جدولهما بلا العمود ⇒ سيفشل upsert)");
if (fails.length) { console.error("✗ G-COST:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-COST: كشف التكلفة ومرادفاتها (لا التُقطت سعراً) · التخزين خام 100 (لا 115) · اختياريّ (null بلا مسّ سعر البيع) · الحراج بلا العمود.");

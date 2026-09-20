// ============================================================================
// G-TAX — ضريبة القيمة المضافة على أسعار المخزن (المستودع ＋ الفروع):
//   G-TAX1: سعر 100 «قبل الضريبة» ⇒ incl=115 · excl=100.
//   G-TAX2: تطبيق مرّتين (إعادة رفع الملف نفسه) لا يعطي 132.25 — لا تراكم (incl من الأساس دائماً).
//   G-TAX3: اسم ملف/رأس يذكر «شامل/الضريبة» ⇒ vatDoubleCheck يعرض الحوار (اختياريّ يحكم).
//   G-TAX4: onMergeWh و onMergeBranch كلاهما يستدعي applyVat (نفس القاعدة للمستودع والفروع).
// أسنان كلٍّ مؤكَّدة على الكود المعطوب (طفرة).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const curHtml = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });

async function evalOn(html, fn) {
  const page = await browser.newPage();
  const srv = createServer((q, r) => { r.setHeader("Content-Type", "text/html; charset=utf-8"); r.end(html); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const port = srv.address().port;
  await page.setRequestInterception(true); page.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1:" + port)) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
  await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
  const out = await page.evaluate(fn);
  await page.close(); srv.close();
  return out;
}
const probe = () => {
  // G-TAX1: 100⇒115 (صحيح) · 369.57⇒425 · excl يبقى بكسوره · G-TAX2: لا تراكم
  const one = applyVat([{ code: "A", excl: 100, incl: "" }])[0];
  const dec = applyVat([{ code: "D", excl: 369.57, incl: "" }])[0];
  const twice = applyVat(applyVat([{ code: "B", excl: 100, incl: "" }]))[0];
  const sar = applyVat([{ code: "S", excl: "", incl: 200 }])[0];   // «السعر» (عمود incl فقط) يُعامَل قبل-ضريبة ⇒ 230
  // G-TAX3: حوار عند إشارة الاسم/الرأس «شامل/الضريبة»
  let dlg = 0; window.confirm = () => { dlg++; return false; };
  vatDoubleCheck("prices_شامل_الضريبة.xlsx", null, [{ code: "A", excl: 100 }], "المستودع");       // ① الاسم
  vatDoubleCheck("prices.xlsx", { head: { incl: "سعر البيع شامل الضريبة" } }, [{ code: "A", excl: 100 }], "المستودع");   // ② الرأس
  const susCount = dlg;
  // G-TAX5: رأس «السعر» المجرّد لا يُطلق الكشف (لا حوار كاذب)
  dlg = 0;
  const plainSar = vatDoubleCheck("prices.xlsx", { head: { incl: "السعر" } }, [{ code: "A", excl: 100 }], "المستودع");
  const sarDlg = dlg;
  return { inclOne: one.incl, exclOne: one.excl, inclDec: dec.incl, exclDec: dec.excl, inclTwice: twice.incl, inclSar: sar.incl, susCount, plainSar, sarDlg };
};

const fails = [];
const R = await evalOn(curHtml, probe);
if (R.inclOne !== 115) fails.push(`G-TAX1: 100 ⇒ incl=${R.inclOne} (متوقّع 115 عدداً صحيحاً)`);
if (R.exclOne !== 100) fails.push(`G-TAX1: excl=${R.exclOne} (متوقّع 100)`);
if (R.inclDec !== 425) fails.push(`G-TAX1: 369.57×1.15 ⇒ incl=${R.inclDec} (متوقّع 425 — لأقرب ريال)`);
if (R.exclDec !== 369.57) fails.push(`G-TAX1: excl=${R.exclDec} (متوقّع 369.57 — يبقى بكسوره)`);
if (R.inclSar !== 230) fails.push(`G-TAX5: «السعر» (200) يُعامَل قبل-ضريبة ⇒ incl=${R.inclSar} (متوقّع 230)`);
if (R.inclTwice !== 115) fails.push(`G-TAX2: تطبيق مرّتين ⇒ incl=${R.inclTwice} (متوقّع 115 — لا تراكم)`);
if (R.susCount < 2) fails.push(`G-TAX3: الحوار لم يظهر للاسم/الرأس المشبوه (susCount=${R.susCount})`);
if (!(R.plainSar === true && R.sarDlg === 0)) fails.push(`G-TAX5: رأس «السعر» أطلق كشفاً كاذباً (plainSar=${R.plainSar} · sarDlg=${R.sarDlg})`);
// G-TAX4: كلا مساري الرفع يطبّقان applyVat
const body = (name) => { const i = curHtml.indexOf("async function " + name); if (i < 0) return ""; return curHtml.slice(i, i + 3000); };
if (!body("onMergeWh").includes("applyVat(")) fails.push("G-TAX4: onMergeWh لا يستدعي applyVat");
if (!body("onMergeBranch").includes("applyVat(")) fails.push("G-TAX4: onMergeBranch لا يستدعي applyVat");

// ===== الأسنان =====
async function tooth(name, mut, chk) {
  if (mut === curHtml) { fails.push(`أسنان ${name}: تعذّر تطبيق الطفرة`); return; }
  const r = await evalOn(mut, probe); const msg = chk(r);
  if (msg) fails.push(`أسنان ${name}: ${msg}`);
}
await tooth("G-TAX1", curHtml.replace("const VAT_RATE = 0.15;", "const VAT_RATE = 0;"), r => r.inclOne === 115 ? "بلا نسبة بقي 115 — بلا أسنان" : null);
await tooth("G-TAX2", curHtml.replace("const base = numOrNull(r.excl) != null ? numOrNull(r.excl) : numOrNull(r.incl);", "const base = numOrNull(r.incl) != null ? numOrNull(r.incl) : numOrNull(r.excl);"), r => r.inclTwice !== 115 ? null : "لم يتراكم بعد قلب الأساس — بلا أسنان");
await tooth("G-TAX3", curHtml.replace("  if (!signals.length) return true;   // لا إشارة ⇒ لا حوار", "  return true;\n  if (!signals.length) return true;"), r => r.susCount >= 2 ? "بلا كشف بقي الحوار يظهر — بلا أسنان" : null);
await tooth("G-TAX5", curHtml.replace("if (priceHead && /شامل|ضريب/.test(String(priceHead)))", "if (priceHead && /شامل|ضريب|سعر/.test(String(priceHead)))"), r => (r.plainSar === false || r.sarDlg > 0) ? null : "«السعر» لم يُطلق الكشف بعد توسيعه — بلا أسنان");
// G-TAX4 tooth: أزِل applyVat من الفرع ⇒ الفحص البنيويّ يرسب (نتحقّق يدوياً هنا)
{ const mut = curHtml.replace("    applyVat(agg);   // ＋15% على «قبل الضريبة» ⇒ الشامل (نفس قاعدة المستودع — G-TAX4)", "    /* applyVat مُعطّل (المعطوب) */"); if (mut === curHtml) fails.push("أسنان G-TAX4: تعذّر تطبيق الطفرة"); else { const i = mut.indexOf("async function onMergeBranch"); if (mut.slice(i, i + 3000).includes("applyVat(")) fails.push("أسنان G-TAX4: بقي applyVat في onMergeBranch بعد الطفرة — بلا أسنان"); } }

await browser.close();
if (fails.length) { console.error("✗ G-TAX:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-TAX: 100⇒115 · 369.57⇒425 (صحيح، excl بكسوره) · «السعر» قبل-ضريبة بلا كشف كاذب · لا تراكم · كشف الشامل يعرض الحوار · المستودع+الفرع — وأسنان كلٍّ مؤكَّدة.");

// ============================================================================
// G-TIGHTEN (T1a) — «أخضر» = تطابق الاسم التامّ لمرشّح وحيد فقط.
//   ① زوج مختلف الموديل (BP162/BP164) بنفس السعر ＋ alias محقون (درجة ≥80) ⇒ **لا يصير أخضر** (أصفر).
//   ② زوج اسمه متطابق تماماً ⇒ أخضر (ضابط).
//   ③ scoreCandidate يكشف exactName/numConf بالقيمة.
//   ④ الصندوق الافتراضيّ للأخضر فقط · التعلّم من الأخضر فقط (بنيويّ).
// --broken: يعيد classifyBatch إلى المسار القديم (score≥80) ⇒ BP162/BP164 يصير أخضر ⇒ يرسب.
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
  const FIX = 'if (r.exactUnique) return "green";';   // القاعدة الجديدة
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد سطر exactUnique في classifyBatch"); process.exit(2); }
  html = html.replace(FIX, 'if (r.best && r.best.score >= 80) return "green";');   // المسار القديم: score≥80 يُخضّر
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const z = { name: "كرسي رحلات BP162", price: 65 }, wh = { name: "كرسي رحلات BP164", price: 65, code: "351475" };
  batchAliases.add(nameRoot(z.name) + "|||" + nameRoot(wh.name));   // احقن الزوج المسموم ⇒ aliasHit +40
  const s = scoreCandidate(z, wh);
  const rBP = { best: s, second: null, exactUnique: false };   // مختلف الاسم ⇒ لا exactUnique
  const clsBP = classifyBatch(rBP);
  // الضابط: اسم متطابق تماماً
  const z2 = { name: "مفرش قطن سرير 200", price: 50 }, wh2 = { name: "مفرش قطن سرير 200", price: 999, code: "X" };
  const s2 = scoreCandidate(z2, wh2);
  const rEx = { best: s2, second: null, exactUnique: true };
  const clsEx = classifyBatch(rEx);
  // بنيويّ: الصندوق الافتراضيّ ＋ التعلّم
  const src = [...document.querySelectorAll("script")].map(x => x.textContent).join("\n");
  return {
    exactName: s.exactName, numConf: s.numConf, score: s.score,
    clsBP, clsEx, exact2: s2.exactName,
    chkGreenOnly: src.includes('${chkCls === "bt-g" ? "checked" : ""}'),
    learnGreenOnly: src.includes('if (tag === "auto-confirmed")') && /if \(tag === "auto-confirmed"\)[\s\S]{0,400}newAliases\.push/.test(src),
  };
});
await b.close();
const fails = [];
// ① BP162/BP164: score عالٍ (alias) لكن لا أخضر
if (res.exactName !== false) fails.push("① exactName يجب false لـBP162/BP164");
if (res.numConf !== true) fails.push("① numConf يجب true (162≠164)");
if (res.score < 80) fails.push(`① score=${res.score} (متوقّع ≥80 بالـalias — ليثبت أنّ القديم كان سيخضّره)`);
if (res.clsBP !== "yellow") fails.push(`① BP162/BP164 صُنّف «${res.clsBP}» (متوقّع yellow — لا أخضر رغم الدرجة والـalias)`);
// ② الاسم التامّ ⇒ أخضر
if (res.exact2 !== true) fails.push("② exactName يجب true للاسم المتطابق");
if (res.clsEx !== "green") fails.push(`② الاسم المتطابق صُنّف «${res.clsEx}» (متوقّع green)`);
// ④ بنيويّ
if (!res.chkGreenOnly) fails.push("④ الصندوق الافتراضيّ ليس للأخضر فقط");
if (!res.learnGreenOnly) fails.push("④ التعلّم ليس مقيّداً بـauto-confirmed");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-TIGHTEN مسك المسار القديم: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة score≥80 — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-TIGHTEN:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-TIGHTEN: BP162/BP164 (score=${res.score}, alias, numConf) ⇒ yellow لا green · الاسم التامّ ⇒ green · الصندوق/التعلّم للأخضر فقط.`);

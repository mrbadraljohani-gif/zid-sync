// ============================================================================
// G-AI-SCOPE — عزل المساعد الذكيّ (القيمة، لا الشكل):
//   ① owner ⇒ حقل السؤال (#saiInput) مُنشأ · marketing ⇒ #salesAI فارغ (الحقل غير مُنشأ أصلاً، لا مخفيّ).
//   ② الواجهة لا تستدعي إلا الدالّة ai-assistant وقراءة عدّاد ai_usage — لا كتابة جدول أعمال، لا جدول خارج المسموح.
//   ③ كود المساعد لا يمسّ المطابقة/التصدير (run/qtyRows/priceRows) ⇒ حذفه لا يغيّر مخرجاً (G-THROUGH يبقى أخضر).
// --broken: يجعل renderSalesAI يُنشئ الحقل لغير owner ⇒ marketing يرى الحقل ⇒ يرسب.
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
  const A = 'if (myRole !== "owner" || !(dbOnline && sb)) { host.innerHTML = ""; return; }';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حارس owner في renderSalesAI"); process.exit(2); }
  html = html.replace(A, 'if (!(dbOnline && sb)) { host.innerHTML = ""; return; }   // (--broken) يُنشئ لغير owner');
}

// ————— فحص ساكن: نطاق كود المساعد —————
const staticFails = [];
const aiStart = html.indexOf("let aiBusy = false;");               // بداية كتلة المساعد (تليها salesAIStatus/renderSalesAI/salesAskAI)
const aiEnd = html.indexOf("async function renderSalesPage", aiStart);
const scope = (aiStart >= 0 && aiEnd > aiStart) ? html.slice(aiStart, aiEnd) : "";
if (!scope) staticFails.push("لم أجد نطاق renderSalesAI/salesAskAI");
if (!/functions\.invoke\("ai-assistant"/.test(scope)) staticFails.push("لا يستدعي الدالّة ai-assistant");
if (!/rpc\("ai_usage_status"\)/.test(scope)) staticFails.push("لا يقرأ الرصيد عبر ai_usage_status");
// 🚨 لا كتابة أي جدول من كود المساعد
for (const w of [".insert(", ".update(", ".delete(", ".upsert("]) if (scope.includes(w)) staticFails.push(`كتابة محظورة في كود المساعد: ${w}`);
// 🚨 لا وصول لأي جدول أعمال خارج ai_usage
for (const t of ["mappings", "sales_movements", "sales_uploads", "sales_stock", "warehouse_items", "branch_items", "zid_products", "waiting_items", "matched_history", "user_roles", "branches"])
  if (scope.includes(`from("${t}")`)) staticFails.push(`وصول جدول خارج المسموح من كود المساعد: ${t}`);
// 🚨 لا مساس بالمطابقة/التصدير
for (const s of ["qtyRows", "priceRows", "run(true)", "resolveWhCode", "downloadSelected"]) if (scope.includes(s)) staticFails.push(`كود المساعد يمسّ المطابقة/التصدير: ${s}`);

// ————— فحص متصفّح: owner يرى · marketing لا يرى —————
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; authSession = { user: { email: "x@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }];
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }) };
  document.getElementById("page-sales").classList.add("active");
  const host = document.getElementById("salesAI");
  myRole = "owner"; await renderSalesAI();
  const ownerInput = !!document.getElementById("saiInput");
  const ownerQuota = !!document.getElementById("saiQuota");
  // إعادة الضبط ثم marketing — يجب ألّا يُنشأ الحقل
  host.innerHTML = ""; delete host.dataset.built;
  myRole = "marketing"; await renderSalesAI();
  const mktInput = !!document.getElementById("saiInput");
  const mktEmpty = host.innerHTML.trim() === "";
  return { ownerInput, ownerQuota, mktInput, mktEmpty };
});
await b.close();

const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (BROKEN) {
  // مع كسر حارس owner: marketing يرى الحقل ⇒ العزل منكسر
  if (res.mktInput) { console.log("✅ (--broken) G-AI-SCOPE مسك العطل: marketing رأى حقل المساعد (حارس owner مكسور)."); process.exit(0); }
  console.error("✗ (--broken) marketing لم يرَ الحقل — لا أسنان."); process.exit(1);
}
if (!res.ownerInput) fails.push("owner لا يرى حقل السؤال (#saiInput غير مُنشأ)");
if (!res.ownerQuota) fails.push("owner لا يرى الرصيد المتبقّي (#saiQuota) — القيد ③");
if (res.mktInput) fails.push("🚨 marketing يرى حقل المساعد (يجب ألّا يُنشأ أصلاً — القيد ①)");
if (!res.mktEmpty) fails.push("🚨 #salesAI ليس فارغاً لـmarketing (الحقل يجب أن يكون غير مُنشأ)");
if (fails.length) { console.error("✗ G-AI-SCOPE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-SCOPE: owner يرى الحقل والرصيد · marketing لا يُنشأ له · الواجهة تستدعي الدالّة وتقرأ ai_usage فقط · لا كتابة/جدول أعمال/مساس بالمطابقة.");

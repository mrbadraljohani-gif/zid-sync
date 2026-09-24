// ============================================================================
// G-AI-SCOPE — عزل المساعد الذكيّ (القيمة، لا الشكل):
//   ① owner و marketing ⇒ حقل السؤال (#saiInput) مُنشأ (كلاهما يرى شاشة المبيعات) · admin/viewer ⇒ #salesAI فارغ.
//   ② الواجهة لا تستدعي إلا الدالّة ai-assistant وقراءة عدّاد ai_usage — لا كتابة جدول أعمال، لا جدول خارج المسموح.
//   ③ كود المساعد لا يمسّ المطابقة/التصدير (run/qtyRows/priceRows) ⇒ حذفه لا يغيّر مخرجاً (G-THROUGH يبقى أخضر).
//   ④ الدالّة الطرفية نفسها ترفض غير owner/marketing (بوّابة الدور في index.ts، لا الواجهة وحدها).
// --broken: يجعل renderSalesAI يُنشئ الحقل لكل الأدوار ⇒ admin/viewer يريان الحقل ⇒ يرسب.
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
  const A = 'if (!(myRole === "owner" || myRole === "marketing") || !(dbOnline && sb)) { host.innerHTML = ""; return; }';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حارس الدور في renderSalesAI"); process.exit(2); }
  html = html.replace(A, 'if (!(dbOnline && sb)) { host.innerHTML = ""; return; }   // (--broken) يُنشئ لكل الأدوار');
}

// ————— فحص ساكن: نطاق كود المساعد —————
const staticFails = [];
const aiStart = html.indexOf("let aiBusy = false;");               // بداية كتلة المساعد (تليها renderSalesAI/salesAskAI)
const aiEnd = html.indexOf("async function renderSalesPage", aiStart);
const scope = (aiStart >= 0 && aiEnd > aiStart) ? html.slice(aiStart, aiEnd) : "";
if (!scope) staticFails.push("لم أجد نطاق renderSalesAI/salesAskAI");
if (!/functions\.invoke\("ai-assistant"/.test(scope)) staticFails.push("لا يستدعي الدالّة ai-assistant");
// 🚨 لا كتابة أي جدول من كود المساعد
for (const w of [".insert(", ".update(", ".delete(", ".upsert("]) if (scope.includes(w)) staticFails.push(`كتابة محظورة في كود المساعد: ${w}`);
// 🚨 لا وصول لأي جدول أعمال من كود المساعد (يستدعي الدالّة فقط)
for (const t of ["mappings", "sales_movements", "sales_uploads", "sales_stock", "warehouse_items", "branch_items", "zid_products", "waiting_items", "matched_history", "user_roles", "branches", "ai_usage"])
  if (scope.includes(`from("${t}")`)) staticFails.push(`وصول جدول من كود المساعد: ${t}`);
// 🚨 لا مساس بالمطابقة/التصدير
for (const s of ["qtyRows", "priceRows", "run(true)", "resolveWhCode", "downloadSelected"]) if (scope.includes(s)) staticFails.push(`كود المساعد يمسّ المطابقة/التصدير: ${s}`);
// ④ بوّابة الدور في الدالّة الطرفية نفسها: ترفض غير owner/marketing (لا الواجهة وحدها)
const edge = readFileSync(join(root, "supabase", "functions", "ai-assistant", "index.ts"), "utf8").replace(/\r\n/g, "\n");
if (!/role !== "owner" && role !== "marketing"/.test(edge) || !/\b403\b/.test(edge)) staticFails.push("④ الدالّة الطرفية لا تحوي بوّابة رفض غير owner/marketing (403)");

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
  const check = async (role) => { host.innerHTML = ""; delete host.dataset.built; myRole = role; await renderSalesAI(); return { input: !!document.getElementById("saiInput"), empty: host.innerHTML.trim() === "" }; };
  return { owner: await check("owner"), marketing: await check("marketing"), admin: await check("admin"), viewer: await check("viewer") };
});
await b.close();

const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (BROKEN) {
  // مع كسر حارس الدور: admin/viewer يريان الحقل ⇒ العزل منكسر
  if (res.admin.input || res.viewer.input) { console.log("✅ (--broken) G-AI-SCOPE مسك العطل: دور خارج (admin/viewer) رأى حقل المساعد (حارس الدور مكسور)."); process.exit(0); }
  console.error("✗ (--broken) admin/viewer لم يريا الحقل — لا أسنان."); process.exit(1);
}
if (!res.owner.input) fails.push("owner لا يرى حقل السؤال (#saiInput غير مُنشأ)");
if (!res.marketing.input) fails.push("🚨 marketing لا يرى حقل المساعد (يجب أن يُنشأ — السياسة الجديدة)");
if (res.admin.input || !res.admin.empty) fails.push("🚨 admin يرى حقل المساعد (يجب ألّا يُنشأ · #salesAI فارغ)");
if (res.viewer.input || !res.viewer.empty) fails.push("🚨 viewer يرى حقل المساعد (يجب ألّا يُنشأ · #salesAI فارغ)");
if (fails.length) { console.error("✗ G-AI-SCOPE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-SCOPE: owner و marketing يريان الحقل · admin/viewer لا · الدالّة الطرفية ترفض غيرهما (403) · الواجهة تستدعي الدالّة فقط · لا كتابة/مساس بالمطابقة.");

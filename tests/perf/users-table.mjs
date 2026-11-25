// ============================================================================
// G-USERS — جدول «المستخدمون الحاليون» في صفحة «مستخدم جديد» (owner فقط):
//   ① owner يرى الصفوف بأسماء الأدوار العربية (مالك/مشرف/تسويق) · «الحالة» (مؤكَّد/بانتظار) · «آخر دخول» (نسبي/«لم يدخل بعد»).
//   ② صفّ المالك بلا seg تغيير الصلاحية · بقيّة الصفوف تحمله · لكلّ صفّ زرّ «إرسال رابط إعادة التعيين».
//   ③ تغيير الصلاحية يستدعي db.roles.setRole(id, role) ثمّ يعيد الرسم.
//   ④ العزل: admin/marketing ⇒ القسم فارغ ومخفيّ (لا عنوان ولا جدول #usersTbl في DOM).
// --broken:    يزيل حارس صفّ المالك ⇒ المالك يحمل seg تغيير الصلاحية ⇒ يرسب (②).
// --broken-ui: يُلغي فحص الدور في renderUsers ⇒ غير-owner يرى القسم ⇒ يرسب (④).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODE = process.argv.includes("--broken") ? "owner-row" : process.argv.includes("--broken-ui") ? "ui" : "";
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (MODE === "owner-row") {
  const A = 'u.role === "owner" ? "" : `<span class="seg usr-seg"';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حارس صفّ المالك"); process.exit(2); }
  html = html.replace(A, 'false ? "" : `<span class="seg usr-seg"');   // يُظهر seg للمالك أيضاً
}
if (MODE === "ui") {
  const A = 'if (myRole !== "owner") { card.innerHTML = ""; card.style.display = "none"; return; }';
  if (!html.includes(A)) { console.error("✗ (--broken-ui) لم أجد فحص الدور في renderUsers"); process.exit(2); }
  html = html.replace(A, 'if (false) { card.innerHTML = ""; card.style.display = "none"; return; }');
}

function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true;
  const ROWS = [
    { id: "u-own", email: "owner@asj.sa", role: "owner",     created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-11-25T06:00:00Z", email_confirmed_at: "2026-01-01T00:00:00Z" },
    { id: "u-mkt", email: "mkt@asj.sa",   role: "marketing", created_at: "2026-02-01T00:00:00Z", last_sign_in_at: "2026-11-20T06:00:00Z", email_confirmed_at: "2026-02-01T00:00:00Z" },
    { id: "u-new", email: "new@asj.sa",   role: "viewer",    created_at: "2026-11-24T00:00:00Z", last_sign_in_at: null,                   email_confirmed_at: null }];
  let setRoleArgs = null, resetEmail = null;
  sb = { rpc: async () => ({ data: ROWS, error: null }),
         from: () => ({ upsert: async (row) => { setRoleArgs = row; return { error: null }; }, select: async () => ({ data: ROWS, error: null }) }),
         auth: { resetPasswordForEmail: async (email) => { resetEmail = email; return { error: null }; } } };
  window.__getSet = () => setRoleArgs; window.__getReset = () => resetEmail;
  window.confirm = () => true;   // تأكيد تلقائيّ
  document.getElementById("page-newuser").classList.add("active");

  // ① owner
  myRole = "owner"; await renderUsers(); await new Promise(r => setTimeout(r, 20));
  const card = document.getElementById("usersCard");
  const ownerDisplay = card.style.display;
  const table = card.querySelector("table.audit-table");
  const trs = card.querySelectorAll("tbody tr");
  const txt = card.textContent;
  const ownerRow = [...trs].find(tr => /owner@asj\.sa/.test(tr.textContent));
  const mktRow   = [...trs].find(tr => /mkt@asj\.sa/.test(tr.textContent));
  const newRow   = [...trs].find(tr => /new@asj\.sa/.test(tr.textContent));
  const ownerHasSeg = !!(ownerRow && ownerRow.querySelector(".usr-seg"));
  const mktHasSeg = !!(mktRow && mktRow.querySelector(".usr-seg"));
  const everyRowHasReset = [...trs].every(tr => /إرسال رابط إعادة التعيين/.test(tr.textContent));
  const newLastLogin = newRow ? /لم يدخل بعد/.test(newRow.textContent) : false;
  const newPending = newRow ? /بانتظار التأكيد/.test(newRow.textContent) : false;
  const mktConfirmed = mktRow ? /مؤكَّد/.test(mktRow.textContent) : false;
  const arabicRoles = /مالك/.test(txt) && /تسويق/.test(txt) && /مشاهد/.test(txt) && !/owner|marketing|viewer/.test([...card.querySelectorAll(".act-st.st-mute")].map(e=>e.textContent).join(" "));
  const ariaTable = table && table.hasAttribute("aria-label");

  // ③ تغيير صلاحية mkt → viewer
  let changed = false, reloaded = false;
  if (mktRow) {
    const viewerChip = [...mktRow.querySelectorAll(".usr-seg .chip")].find(c => c.textContent.trim() === "مشاهد");
    if (viewerChip) { viewerChip.click(); await new Promise(r => setTimeout(r, 30)); const s = window.__getSet(); changed = !!(s && s.user_id === "u-mkt" && s.role === "viewer"); reloaded = !!document.getElementById("usersTbl"); }
  }
  // زرّ إعادة التعيين
  let reset = false;
  if (newRow) { const rb = [...newRow.querySelectorAll("button")].find(x => /إعادة التعيين/.test(x.textContent)); if (rb) { rb.click(); await new Promise(r => setTimeout(r, 20)); reset = window.__getReset() === "new@asj.sa"; } }

  // ④ عزل admin
  myRole = "admin"; await renderUsers();
  const adminDisplay = card.style.display;
  const adminHasTable = !!document.getElementById("usersTbl");
  const adminHasTitle = /المستخدمون الحاليون/.test(card.textContent);

  return { ownerDisplay, hasTable: !!table, rowCount: trs.length, ownerHasSeg, mktHasSeg, everyRowHasReset,
    newLastLogin, newPending, mktConfirmed, arabicRoles, ariaTable, changed, reloaded, reset,
    adminDisplay, adminHasTable, adminHasTitle };
});
await b.close();

const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.ownerDisplay === "none") fails.push("① القسم مخفيّ عن المالك");
if (!res.hasTable) fails.push("① لا جدول للمالك");
if (res.rowCount !== 3) fails.push(`① عدد الصفوف ${res.rowCount} ≠ 3`);
if (!res.arabicRoles) fails.push("① الأدوار ليست بالعربية (مالك/تسويق/مشاهد) أو تسرّبت الإنجليزية");
if (!res.ariaTable) fails.push("① الجدول بلا aria-label");
if (!res.newLastLogin) fails.push("② «لم يدخل بعد» غائب لمن last_sign_in_at فارغ");
if (!res.newPending) fails.push("② «بانتظار التأكيد» غائب لمن email_confirmed_at فارغ");
if (!res.mktConfirmed) fails.push("② «مؤكَّد» غائب للمستخدم المؤكَّد");
const ownerRowFail = res.ownerHasSeg;   // ② صفّ المالك يجب ألّا يحمل seg
if (ownerRowFail) fails.push("② 🚨 صفّ المالك يحمل seg تغيير الصلاحية");
if (!res.mktHasSeg) fails.push("② صفّ غير-المالك بلا seg تغيير الصلاحية");
if (!res.everyRowHasReset) fails.push("② صفّ بلا زرّ إعادة التعيين");
if (!res.changed) fails.push("③ تغيير الصلاحية لم يستدعِ setRole(id, role) الصحيح");
if (!res.reloaded) fails.push("③ الجدول لم يُعَد رسمه بعد التغيير");
if (!res.reset) fails.push("② زرّ إعادة التعيين لم يستدعِ resetPasswordForEmail بالبريد الصحيح");
const isolFail = res.adminDisplay !== "none" || res.adminHasTable || res.adminHasTitle;   // ④
if (isolFail) fails.push(`④ 🚨 العزل انكسر: admin يرى القسم (display=${res.adminDisplay} · table=${res.adminHasTable} · title=${res.adminHasTitle})`);

if (MODE) {
  const caught = MODE === "owner-row" ? ownerRowFail : isolFail;
  const flag = MODE === "owner-row" ? "--broken" : "--broken-ui";
  if (caught) { console.log(`✅ (${flag}) G-USERS مسك العطل.`); process.exit(0); }
  console.error(`✗ (${flag}) لم يُرصَد العطل — لا أسنان. ${JSON.stringify({ ownerRowFail, isolFail })}`); process.exit(1);
}
if (fails.length) { console.error("✗ G-USERS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-USERS: المالك يرى ٣ صفوف (أدوار عربية · مؤكَّد/بانتظار · «لم يدخل بعد») · صفّ المالك بلا seg والبقيّة تحمله · تغيير الصلاحية يستدعي setRole ويعيد الرسم · إعادة التعيين بالبريد · العزل (admin: لا قسم في DOM).`);

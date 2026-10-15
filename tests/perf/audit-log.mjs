// ============================================================================
// G-AUDIT — سجلّ التدقيق السلوكيّ تحت «مستخدم جديد» (القيمة، لا الشكل):
//   ① بنية العزل القاعديّ (كنمط G-ROLE-SALES): audit_recent و user_directory يشترطان get_my_role()='owner' ·
//      insert مُحصّن created_by=auth.uid() (لا ثغرة null) · trigger تغيير الصلاحية على user_roles.
//   ② التسجيل من المصدر: دخول يسجّل البريد لا كلمة المرور · البحث يسجّل نصّه (scope,q) · رفع الحراج مسجَّل (xbranch_sync_full).
//   ③ سلوكيّاً (owner): الجدول يعرض كل فعل بقيمته (من·ماذا·متى) · البحث بنصّه · role_change بـold=null ⇒ «—» · فلترا الأسماء/التاريخ · p_limit=100.
//   ④ العزل في الواجهة (طبقة ثانية): غير-owner ⇒ البطاقة مخفيّة. (الحاجز الفعليّ RLS — يُثبَّت بالاستعلام اليدويّ بالحسابات الثلاثة.)
//   ⑤ البحث: كبت المكرّر المتتالي · تجاهل الحرف الواحد · 🚫 لا كلمة مرور.
// --broken:    يُزال شرط owner من SQL ⇒ العزل القاعديّ منهار ⇒ يرسب (①).
// --broken-ui: يُلغى فحص الدور في renderAudit ⇒ غير-owner يرى البطاقة ⇒ يرسب (④).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { stripComments } from "../lib/strip-comments.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODE = process.argv.includes("--broken") ? "sql" : process.argv.includes("--broken-ui") ? "ui" : "";
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
let sql = readFileSync(join(root, "supabase_audit_log.sql"), "utf8").replace(/\r\n/g, "\n");
if (MODE === "sql") sql = sql.replace(/public\.get_my_role\(\) = 'owner'/g, "true");   // إزالة شرط owner (العطل القاعديّ)
if (MODE === "ui") {
  const A = 'if (myRole !== "owner") { card.style.display = "none"; return; }';
  if (!html.includes(A)) { console.error("✗ (--broken-ui) لم أجد فحص الدور في renderAudit"); process.exit(2); }
  html = html.replace(A, 'if (false) { card.style.display = "none"; return; }');
}

// ── ① بنية العزل القاعديّ (SQL) ──
const sqlFails = [];
const ownerGuards = (sql.match(/get_my_role\(\) = 'owner'/g) || []).length;
if (ownerGuards < 2) sqlFails.push(`① شرط owner غائب/ناقص في SQL (عدد=${ownerGuards}، المتوقّع ≥2: audit_recent ＋ user_directory)`);
if (!/create or replace function public\.audit_recent/.test(sql)) sqlFails.push("① دالّة audit_recent غائبة");
if (!/create or replace view public\.user_directory/.test(sql)) sqlFails.push("① عرض user_directory غائب");
if (!/with check \(created_by = auth\.uid\(\)\)/.test(sql)) sqlFails.push("① insert غير مُحصّن (created_by=auth.uid())");
if (/created_by is null/.test(sql)) sqlFails.push("① ثغرة created_by is null ما زالت في insert");
if (!/trg_log_role_change/.test(sql) || !/on public\.user_roles/.test(sql) || !/function public\.log_role_change/.test(sql)) sqlFails.push("① trigger تغيير الصلاحية على user_roles غائب");
for (const ev of ["'login'", "'logout'", "'search'", "'role_change'", "'xbranch_sync_full'"]) if (!sql.includes(ev)) sqlFails.push(`① نوع التدقيق ${ev} غير مُصفّى في audit_recent`);

// ── ② التسجيل من المصدر (بعد تجريد التعليقات) ──
const code = stripComments(html);
const srcFails = [];
const loginM = code.match(/logActivity\("login",\s*null,\s*\{\s*email\s*\}\)/);
if (!loginM) srcFails.push("② الدخول لا يُسجَّل بالبريد (logActivity(\"login\", null, { email }))");
if (loginM && /pass(word)?/i.test(loginM[0])) srcFails.push("② 🚫 الدخول يسجّل كلمة المرور");
if (!/logActivity\("search",\s*null,\s*\{\s*scope,\s*q\s*\}\)/.test(code)) srcFails.push("② البحث لا يُسجَّل بنصّه (scope,q)");
if (!/logActivity\("xbranch_sync_full"/.test(code)) srcFails.push("② رفع الحراج غير مسجَّل (xbranch_sync_full)");
if (MODE !== "ui" && !/myRole !== "owner"/.test(code)) srcFails.push("④ فحص الدور في renderAudit غائب");

// ── ③④⑤ سلوكيّ ──
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true;
  const DIR = [{ id: "u-own", email: "owner@asj.sa", role: "owner" }, { id: "u-adm", email: "mohammed@asj.sa", role: "admin" }, { id: "u-mkt", email: "mkt@asj.sa", role: "marketing" }];
  const ROWS = [
    { id: 5, event_type: "login", details: { email: "owner@asj.sa" }, created_at: "2026-10-15T07:00:00Z", created_by: "u-own", actor_email: "owner@asj.sa", actor_role: "owner" },
    { id: 4, event_type: "search", details: { scope: "warehouse", q: "خزانة ملابس" }, created_at: "2026-10-15T07:01:00Z", created_by: "u-own", actor_email: "owner@asj.sa", actor_role: "owner" },
    { id: 3, event_type: "role_change", details: { target: "u-mkt", old: null, new: "marketing", op: "INSERT" }, created_at: "2026-10-15T07:02:00Z", created_by: "u-own", actor_email: "owner@asj.sa", actor_role: "owner" },
    { id: 2, event_type: "xbranch_sync_full", details: { file: "haraj.xlsx", total: 120, location: "haraj_reh" }, created_at: "2026-10-15T07:03:00Z", created_by: "u-adm", actor_email: "mohammed@asj.sa", actor_role: "admin" }];
  let rpcArgs = null;
  sb = { rpc: async (fn, pr) => { if (fn === "audit_recent") rpcArgs = pr; return { data: fn === "audit_recent" ? ROWS : null, error: null }; }, from: (t) => ({ select: async () => ({ data: t === "user_directory" ? DIR : [], error: null }) }) };
  document.getElementById("page-newuser").classList.add("active");
  myRole = "owner"; await renderAudit(); await new Promise(r => setTimeout(r, 20));
  const tbl = document.getElementById("auditTbl"), txt = tbl.textContent;
  const rowsOwner = tbl.querySelectorAll(".audit-table tbody tr").length;
  const cardOwner = getComputedStyle(document.getElementById("auditCard")).display;
  const userOpts = document.querySelectorAll("#auditUserSel option").length;
  const dateChips = document.querySelectorAll("#auditDates .exp-chip").length;
  // ⑤ البحث
  const cap = []; logActivity = (ty, s, d) => cap.push({ ty, s, d });
  logSearch("warehouse", "خزانة"); logSearch("warehouse", "خزانة"); logSearch("warehouse", "a"); logSearch("zid", "سرير");
  const searchQs = cap.filter(c => c.ty === "search").map(c => c.d.q);
  const anyPassword = cap.some(c => /password/i.test(JSON.stringify(c.d || "")));
  // ④ عزل admin
  myRole = "admin"; await renderAudit();
  const cardAdmin = document.getElementById("auditCard").style.display;
  return { rowsOwner, cardOwner, userOpts, dateChips, searchQs, anyPassword, cardAdmin,
    hasSearchText: /خزانة ملابس/.test(txt), roleDash: txt.includes("—"), hasLoginEmail: /owner@asj\.sa/.test(txt),
    pLimit: rpcArgs && rpcArgs.p_limit, jsErr: "" };
});
await b.close();

const beh = [];
if (errs.length) beh.push("أخطاء JS: " + errs.join(" | "));
if (res.rowsOwner !== 4) beh.push(`③ الجدول لم يعرض كل الصفوف (=${res.rowsOwner}/4)`);
if (!res.hasSearchText) beh.push("③ نصّ البحث غير ظاهر في الجدول");
if (!res.roleDash) beh.push("③ role_change بـold=null لا يعرض «—»");
if (!res.hasLoginEmail) beh.push("③ المستخدم (البريد) غير ظاهر");
if (res.userOpts !== 4) beh.push(`③ فلتر الأسماء ليس 4 خيارات (الكل ＋ 3): ${res.userOpts}`);
if (res.dateChips !== 4) beh.push(`③ فلتر التاريخ ليس 4 شرائح: ${res.dateChips}`);
if (res.pLimit !== 100) beh.push(`③ الافتراض ليس آخر 100: p_limit=${res.pLimit}`);
if (res.cardOwner === "none") beh.push("③ البطاقة مخفيّة عن owner");
if (JSON.stringify(res.searchQs) !== JSON.stringify(["خزانة", "سرير"])) beh.push(`⑤ تسجيل البحث غير صحيح (كبت المكرّر/الحرف الواحد): ${JSON.stringify(res.searchQs)}`);
if (res.anyPassword) beh.push("⑤ 🚫 كلمة مرور في سجلّ البحث");
const isolFail = res.cardAdmin !== "none";   // ④ غير-owner يجب أن تُخفى البطاقة
if (isolFail) beh.push(`④ 🚨 العزل انكسر: البطاقة ظاهرة لغير-owner (display=${res.cardAdmin})`);

if (MODE) {
  const caught = MODE === "sql" ? sqlFails.some(f => f.includes("شرط owner")) : isolFail;
  const flag = MODE === "sql" ? "--broken" : "--broken-ui";
  if (caught) { console.log(`✅ (${flag}) G-AUDIT مسك العطل.`); process.exit(0); }
  console.error(`✗ (${flag}) لم يُرصَد العطل — لا أسنان. ${JSON.stringify({ sqlFails, isolFail })}`); process.exit(1);
}
const all = [...sqlFails, ...srcFails, ...beh];
if (all.length) { console.error("✗ G-AUDIT:\n  " + all.join("\n  ")); process.exit(1); }
console.log(`✅ G-AUDIT: عزل قاعديّ (owner في audit_recent/user_directory · insert مُحصّن · trigger الصلاحية) · التسجيل (دخول=بريد لا كلمة مرور · بحث بنصّه · حراج) · الجدول بقيمته (4 صفوف · «${res.searchQs.join("،")}» · role_change «—») · فلترا الأسماء(${res.userOpts})/التاريخ(${res.dateChips}) · آخر 100 · العزل: البطاقة مخفيّة لغير-owner.`);

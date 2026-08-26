// ============================================================================
// حارس انحدار الدفعة (أ) — تحقّق ثابت (static) على index.html
// يرسب البناء إن انكسر أيٌّ من عقود «القاعدة مصدر الحقيقة» أو «حجب عدم الاتصال».
// تشغيل: node tests/batch-a-invariants.mjs   (يخرج بـ1 عند أي فشل)
// ملاحظة: هذا فحص ثابت للنص — لا يختبر السلوك الحيّ (القاعدة/الجلسة/الرسم).
// مقياس الأداء الحيّ (300 صف headless) يأتي في الدفعة (ب) لأنه يقيس رسم قائمتها.
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const fails = [];
const ok = [];
const check = (cond, msg) => (cond ? ok : fails).push(msg);

// استخرج كتلة السكربت الرئيسية (آخر <script>…</script>) للفحوص الدالّية
const scriptStart = html.lastIndexOf("\n<script>\n");
const scriptEnd = html.lastIndexOf("\n</script>");
const script = scriptStart >= 0 && scriptEnd > scriptStart ? html.slice(scriptStart, scriptEnd) : html;

// دالة مساعدة: جسم أول تعريف دالة باسمها (heuristic: من "function name" حتى إغلاق تقريبي)
function fnBody(name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{", "");
  const m = re.exec(script);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  for (; i < script.length && depth > 0; i++) {
    if (script[i] === "{") depth++;
    else if (script[i] === "}") depth--;
  }
  return script.slice(m.index, i);
}

// (1) لا كتابة محلية لأيٍّ من مفاتيح القرارات الستة
for (const key of ["MAP_KEY", "IGN_KEY", "WAIT_KEY", "ALIAS_KEY", "TAGS_KEY"]) {
  check(!new RegExp("localStorage\\.setItem\\(\\s*" + key).test(script), `لا localStorage.setItem(${key}) [القاعدة حصراً]`);
}

// (2) دوال الحفظ المحلي للقرارات محذوفة
for (const fn of ["saveIgnored", "saveWaiting", "saveAliases", "saveLinkTags"]) {
  check(!new RegExp("function\\s+" + fn + "\\b").test(script), `الدالة ${fn} محذوفة`);
}

// (3) linkTags أُسقط نهائياً (لا كائن حيّ يُكتب/يُصدَّر)
check(!/\blinkTags\s*\[/.test(script) && !/JSON\.stringify\(linkTags/.test(script), "linkTags أُسقط (لا كتابة/تصدير)");

// (4) DB-first: القاعدة (requireOnline + await db.) قبل تعديل الذاكرة في كل غلاف كتابة
const dbFirst = [
  ["markWaiting", "waitingSet.add"],
  ["unmarkWaiting", "waitingSet.delete"],
  ["dbSetMapping", "manualMap["],
];
for (const [fn, memWrite] of dbFirst) {
  const body = fnBody(fn);
  if (!body) { fails.push(`الغلاف ${fn} غير موجود`); continue; }
  const iReq = body.indexOf("requireOnline");
  const iAwait = body.indexOf("await db.");
  const iMem = body.indexOf(memWrite);
  check(iReq >= 0 && iAwait >= 0 && iMem >= 0 && iReq < iMem && iAwait < iMem,
    `${fn}: القاعدة (requireOnline+await) قبل تعديل الذاكرة (${memWrite}) — فشل القاعدة لا يترك أثراً`);
  check(!new RegExp("localStorage\\.setItem").test(body), `${fn}: بلا localStorage`);
}

// (5) حجب عدم الاتصال: نقاط الدخول تحوي blockedOffline
for (const fn of ["runFromDB", "downloadSelected", "downloadOne", "downloadMerge"]) {
  const body = fnBody(fn);
  check(body && body.includes("blockedOffline"), `${fn} يحجب عند عدم الاتصال (blockedOffline)`);
}
check(/id="offlineBar"/.test(html), "عنصر بانر عدم الاتصال #offlineBar موجود");
check(/function\s+setOfflineGate\b/.test(script), "setOfflineGate معرّفة");
check(/if\s*\(\s*ok\s*&&\s*count\s*>\s*0\s*&&\s*dbOnline\s*\)/.test(script), "wireDl يشترط dbOnline لتفعيل التنزيل");

// (6) exportConfig/saveToRepo لا يكتبان ملفات القرارات الخمسة
for (const fn of ["exportConfig", "saveToRepo"]) {
  const body = fnBody(fn) || "";
  for (const f of ["mapping.json", "waiting.json", "aliases.json", "link-tags.json"]) {
    check(!body.includes(f), `${fn} لا يكتب ${f} (قرارات القاعدة)`);
  }
}

// (7) حارس انحدار run(): مسارات جوهرية سليمة (لم تُحذف سهواً)
const runBody = fnBody("run") || "";
for (const tok of ["verifyQuantities", "verifyPrices", "hasVarYesSet", "parentOf", "saleConflicts", "autoUnpubSimple", "finalQtyByRaw"]) {
  check(runBody.includes(tok), `run() ما زال يحوي «${tok}» (مطابقة/أب-متغيّر/تخفيض/إخفاء سليمة)`);
}

// ============================================================================
console.log(`✓ ${ok.length} تحقّق ناجح`);

// (6) حذف «تجاهل» (دفعة تبسيط التدفّق ١): لا بقايا لأي معرّف — الحارس الصحيح لأي حذف.
//     ignored_added/ignored_removed مستثناة عمداً: تبقى في ACT_META/actDescribe لفهم السجل التاريخي.
const goneNames = ["ignoredSet","dbAddIgnored","dbDelIgnored","loadIgnoredFromDB","db.ignored","undoIgnoreDecision","renderIgnored","unignore","ignoredCard","ignoredCount","ignoredBody","lastIgnored","bootLocalIgnored","baseIgnSet","IGN_KEY","cls.ignored","cat-ign","ignored.json","ignored_items"];
for (const g of goneNames) if (html.includes(g)) fails.push("بقايا «تجاهل» في index.html: " + g);
for (const k of ["ignored_added","ignored_removed"]) if (!html.includes(k)) fails.push(k + " حُذف من ACT_META/actDescribe — السجل التاريخي يصير غير مفهوم");

if (fails.length) {
  console.error(`\n✗ ${fails.length} فشل:`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("✅ كل عقود الدفعة (أ) سليمة.");

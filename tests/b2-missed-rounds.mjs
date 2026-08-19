// ============================================================================
// إثبات ميكانيكي (الدفعة ج، البند ٢): خطاف الرفع processWaitingOnUpload
//   · صنف انتظار كوده غائب عن المخزن ⇒ missed_rounds++  (ويُكتب في القاعدة)
//   · صنف انتظار عاد كوده للمخزن       ⇒ لا يُعدّ غائباً (تعالجه العودة — البند ٣)
//   · تحميل من القاعدة (whWasUploaded=false) ⇒ لا عدّ إطلاقاً (وإلا تضخّم كل جلسة)
//   · العَلَم يُستهلك (whWasUploaded ⇐ false بعد التنفيذ)
// يستخرج الدالّتين الحقيقيتين (normCode + processWaitingOnUpload) من index.html.
//
// تشغيل:  node tests/b2-missed-rounds.mjs
//         node tests/b2-missed-rounds.mjs --broken  (تحقّق ذاتي: إسقاط بوابة العَلَم ⇒ يجب أن يرسب)
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const script = html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>"));
const BROKEN = process.argv.includes("--broken");

function fnSrc(name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = re.exec(script); if (!m) throw new Error("لم تُوجد الدالّة " + name);
  let i = m.index + m[0].length, d = 1;
  for (; i < script.length && d > 0; i++) { if (script[i] === "{") d++; else if (script[i] === "}") d--; }
  return script.slice(m.index, i);
}

let hookSrc = fnSrc("processWaitingOnUpload");
if (BROKEN) hookSrc = hookSrc.replace("else if (uploaded && meta)", "else if (meta)");   // إسقاط بوابة الرفع ⇒ العدّ حتى بلا رفع (يجب أن يرسب)

function arrowConstSrc(name) {   // const NAME = v => { ... };
  const re = new RegExp("const\\s+" + name + "\\s*=\\s*[^=]*?=>\\s*\\{");
  const m = re.exec(script); if (!m) throw new Error("لم يُوجد الثابت " + name);
  let i = m.index + m[0].length, d = 1;
  for (; i < script.length && d > 0; i++) { if (script[i] === "{") d++; else if (script[i] === "}") d--; }
  return script.slice(m.index, i) + ";";
}
const normCodeSrc = arrowConstSrc("normCode");

// بيئة مُحاكاة: 111 عاد كوده (موجود في المخزن) · 222 ما زال غائباً (missed=2) · 333 غائب (missed=0)
function makeCtx(uploaded) {
  const bumped = [], removed = [];
  const ctx = {
    whWasUploaded: uploaded,
    reappearedSet: new Set(),
    lastReactivated: [],
    lastMerge: { unified: [{ code: "111" }], noPrice: [] },   // 111 فقط في المخزن
    waitingSet: new Set(["111", "222", "333"]),
    waitingMeta: new Map([
      ["111", { sku: "111", missed: 0 }],
      ["222", { sku: "222", missed: 2 }],
      ["333", { sku: "333", missed: 0 }],
    ]),
    dbOnline: true, sb: {},
    db: { waiting: { bumpMeta: rows => { bumped.push(...rows); return Promise.resolve(); }, bulkRemove: skus => { removed.push(...skus); return Promise.resolve(); } } },
    console,
  };
  const run = new Function("ctx", `with (ctx) {\n${normCodeSrc}\n${hookSrc}\nprocessWaitingOnUpload();\n}`);
  run(ctx);
  return { ctx, bumped, removed };
}

const fails = [];

// السيناريو أ: رفع فعلي — العودة + العدّ
{
  const { ctx, bumped, removed } = makeCtx(true);
  const m222 = ctx.waitingMeta.get("222").missed, m333 = ctx.waitingMeta.get("333").missed;
  if (m222 !== 3) fails.push(`222 (غائب) missed=${m222} ≠ 3`);
  if (m333 !== 1) fails.push(`333 (غائب) missed=${m333} ≠ 1`);
  if (!ctx.reappearedSet.has("111")) fails.push("111 (عاد) ليس في reappearedSet");
  if (ctx.waitingSet.has("111")) fails.push("111 (عاد) لم يُزَل من waitingSet");
  if (ctx.waitingMeta.has("111")) fails.push("111 (عاد) لم يُزَل من waitingMeta");
  const skusBumped = bumped.map(r => r.zid_sku).sort().join(",");
  if (skusBumped !== "222,333") fails.push(`عدّ القاعدة [${skusBumped}] ≠ [222,333]`);
  if (removed.join(",") !== "111") fails.push(`حذف القاعدة [${removed.join(",")}] ≠ [111]`);
  if (ctx.whWasUploaded !== false) fails.push("العَلَم whWasUploaded لم يُستهلَك");
  console.log(`  رفع فعلي: 222→${m222} · 333→${m333} · عاد=[${[...ctx.reappearedSet]}] · عُدّ=[${skusBumped}] · حُذف=[${removed}]`);
}

// السيناريو ب: تحميل من القاعدة (لا رفع) ⇒ العودة تُكتشَف، لكن لا عدّ missed
{
  const { ctx, bumped, removed } = makeCtx(false);
  const m222 = ctx.waitingMeta.get("222").missed;
  if (m222 !== 2) fails.push(`تحميل قاعدة: 222 missed=${m222} ≠ 2 (عُدّ رغم عدم الرفع)`);
  if (bumped.length !== 0) fails.push(`تحميل قاعدة: عُدّ ${bumped.length} صفّاً (يجب 0)`);
  if (!ctx.reappearedSet.has("111")) fails.push("تحميل قاعدة: 111 (عاد) لم يُكتشَف رغم أن العودة حالة لا رفع");
  if (removed.join(",") !== "111") fails.push(`تحميل قاعدة: حذف [${removed.join(",")}] ≠ [111]`);
  console.log(`  تحميل قاعدة: 222→${m222} (بلا عدّ) · عاد=[${[...ctx.reappearedSet]}] · حُذف=[${removed}]`);
}

if (BROKEN) {
  if (fails.length) { console.log("\n✅ تحقّق ذاتي: رسب على الكود المعطوب (بوابة الرفع مُسقَطة) — كما يجب."); process.exit(0); }
  console.error("\n✗ خلل منهجي: لم يرسب رغم إسقاط بوابة الرفع!"); process.exit(1);
}
if (fails.length) { console.error("\n✗ فشل إثبات missed_rounds:\n" + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("\n✅ خطاف الرفع: missed_rounds++ للغائب فقط · لا عدّ للعائد · لا عدّ لتحميل القاعدة · العَلَم يُستهلَك.");

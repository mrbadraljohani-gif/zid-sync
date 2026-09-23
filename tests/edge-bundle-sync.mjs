// ============================================================================
// G-EDGE-BUNDLE — المدمج المنشور: يطابق المصادر **ويُقلع فعلاً** (القيمة، لا الشكل):
//   ① مطابقة: ai-assistant.bundle.ts == ما يولّده build-edge-bundle من المصادر الثلاثة.
//   ② صفر imports محلّية (./) — الملفات المجاورة غير موجودة في النشر.
//   ③ 🚨 إقلاع فعليّ: يُستورَد/يُنفَّذ محلّياً (Deno/esm.sh مُستبدلان) ⇒ صفر خطأ صياغة/تصادم أسماء/نطاق.
//   الدرس: «الضمان البنيويّ يثبت أن الكود لم يُحذف لا أنه يُقلع» — المطابقة وحدها مرّت على انهيار الإقلاع.
// --broken:      يحقن تصريحاً مكرّراً في النطاق الأعلى ⇒ الإقلاع يرمي «already declared» ⇒ يرسب (يمسك عطل payload).
// --broken-sync: يحاكي مصدراً مُعدّلاً بلا إعادة توليد ⇒ المطابقة تفشل ⇒ يرسب.
// ============================================================================
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildBundle, BUNDLE_PATH } from "../scripts/build-edge-bundle.mjs";
const BROKEN = process.argv.includes("--broken");
const BROKEN_SYNC = process.argv.includes("--broken-sync");

let committed = "";
try { committed = readFileSync(BUNDLE_PATH, "utf8").replace(/\r\n/g, "\n"); }
catch { console.error("✗ لا يوجد ملفّ مدمج — شغّل: node scripts/build-edge-bundle.mjs"); process.exit(1); }
let built = buildBundle();
if (BROKEN_SYNC) built = built.replace("Deno.serve", "Deno.serve /*مصدر مُعدّل بلا إعادة توليد*/");

// يحوّل المدمج إلى قابل للإقلاع في node: يستبدل استيراد esm.sh ويهيّئ Deno (كلاهما غير متاح محلّياً)
function bootable(src) {
  return "globalThis.Deno = globalThis.Deno || { serve: () => {}, env: { get: () => undefined } };\n" +
    src.replace(/^import\s+\{[^}]*\}\s+from\s+["']https?:\/\/[^"']+["'];?\s*$/m,
      "const createClient = () => ({ auth: { getUser: async () => ({ data: {} }) }, from: () => ({}), rpc: async () => ({}) });");
}
async function tryBoot(src, tag) {
  const tmp = join(dirname(BUNDLE_PATH), "_boot_" + tag + ".mjs");
  writeFileSync(tmp, bootable(src));
  try { await import(pathToFileURL(tmp).href); return { ok: true }; }
  catch (e) { return { ok: false, err: String(e && e.message ? e.message : e) }; }
  finally { unlinkSync(tmp); }
}

// ————— الأسنان —————
if (BROKEN_SYNC) {
  if (committed !== built) { console.log("✅ (--broken-sync) مسك الانحراف: المدمج المحفوظ لا يطابق مصدراً مُعدّلاً."); process.exit(0); }
  console.error("✗ (--broken-sync) لم يُكتشف — لا أسنان."); process.exit(1);
}
if (BROKEN) {
  const broken = built + "\nlet __m_intents = 0;\n";   // تصريح مكرّر في النطاق الأعلى (نفس صنف عطل payload)
  const b = await tryBoot(broken, "broken");
  if (!b.ok && /already been declared|has already/i.test(b.err)) { console.log("✅ (--broken) مسك انهيار الإقلاع: «" + b.err.split("\n")[0] + "»."); process.exit(0); }
  console.error("✗ (--broken) الإقلاع لم يرمِ تصادم أسماء — لا أسنان (" + (b.ok ? "أقلع!" : b.err) + ")."); process.exit(1);
}

// ————— الوضع السليم: مطابقة ＋ صفر imports محلّية ＋ إقلاع فعليّ —————
const fails = [];
if (committed !== built) {
  let i = 0; while (i < committed.length && i < built.length && committed[i] === built[i]) i++;
  fails.push("المدمج المحفوظ لا يطابق المصادر — شغّل: node scripts/build-edge-bundle.mjs (أوّل اختلاف عند " + i + ")");
}
if (/from\s+["']\.\//.test(committed)) fails.push("المدمج يحوي import محلّياً (./) — لن يعمل في النشر");
const boot = await tryBoot(committed, "ok");
if (!boot.ok) fails.push("الإقلاع المحلّيّ فشل: " + boot.err);
if (fails.length) { console.error("✗ G-EDGE-BUNDLE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-EDGE-BUNDLE: مطابق للمصادر (" + built.length + " حرفاً) · صفر import محلّيّ · أقلع محلّياً بلا خطأ.");

// ============================================================================
// G-EDGE-BUNDLE — المدمج المنشور == المصادر الثلاثة (القيمة، لا الشكل):
//   ai-assistant.bundle.ts (الملف الذي يُلصَق للنشر) يطابق ما يولّده build-edge-bundle من
//   sales_compute.mjs + intents.mjs + index.ts. فلا ينحرف المنشور عن المصدر (نفس هاجس G-AI-PARITY).
// --broken: يحاكي تعديل مصدر بلا إعادة توليد ⇒ المدمج المحفوظ يختلف عن المبنيّ ⇒ يرسب.
// ============================================================================
import { readFileSync } from "node:fs";
import { buildBundle, BUNDLE_PATH } from "../scripts/build-edge-bundle.mjs";
const BROKEN = process.argv.includes("--broken");

let committed = "";
try { committed = readFileSync(BUNDLE_PATH, "utf8").replace(/\r\n/g, "\n"); }
catch { console.error("✗ لا يوجد ملفّ مدمج — شغّل: node scripts/build-edge-bundle.mjs"); process.exit(1); }

let built = buildBundle();
if (BROKEN) built = built.replace("Deno.serve", "Deno.serve /*تعديل مصدر بلا إعادة توليد*/");   // محاكاة انحراف المصدر عن المدمج

const match = committed === built;
if (BROKEN) {
  if (!match) { console.log("✅ (--broken) G-EDGE-BUNDLE مسك الانحراف: المدمج المحفوظ لا يطابق مصدراً مُعدّلاً."); process.exit(0); }
  console.error("✗ (--broken) لم يُكتشف الانحراف — لا أسنان."); process.exit(1);
}
if (!match) {
  // أظهِر أوّل موضع اختلاف
  let i = 0; while (i < committed.length && i < built.length && committed[i] === built[i]) i++;
  console.error("✗ G-EDGE-BUNDLE: المدمج المحفوظ لا يطابق المصادر — شغّل: node scripts/build-edge-bundle.mjs");
  console.error("  أوّل اختلاف عند الحرف " + i + ": محفوظ«" + JSON.stringify(committed.slice(i, i + 40)) + "» ≠ مبنيّ«" + JSON.stringify(built.slice(i, i + 40)) + "»");
  process.exit(1);
}
console.log("✅ G-EDGE-BUNDLE: المدمج (" + built.length + " حرفاً) يطابق المصادر الثلاثة تماماً.");

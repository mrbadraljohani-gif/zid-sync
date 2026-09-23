// ============================================================================
// build-edge-bundle.mjs — يولّد ملفاً واحداً للنشر من مصادر الدالّة الثلاثة (آلياً، لا دمج يدويّ).
//
// السبب: محرّر Supabase يُنشئ نسخة ثانية عند إضافة اسم ملف موجود (تكرّر معنا) — فالنشر بملف واحد.
//   المصدر يبقى ثلاثة ملفات (الحرّاس تستورد sales_compute.mjs/intents.mjs كما هي)، والمنشور واحد.
//   حارس tests/edge-bundle-sync.mjs يثبت أن المدمج == المصادر (فلا ينحرف المنشور عن المصدر).
//
// الآلية: يجمع كل import خارجيّ (esm.sh) أعلى الملف (يجب أن تتصدّر الوحدة)، يُسقط الاستيراد النسبيّ
//   (./sales_compute.mjs · ./intents.mjs) لأنّ محتواها يُدمَج في النطاق نفسه، ويصل الأجساد بالترتيب:
//   sales_compute ← intents ← index (فتُعرَّف الرموز قبل استعمالها).
//
// تشغيل:  node scripts/build-edge-bundle.mjs         (يكتب الملف المدمج)
//         node scripts/build-edge-bundle.mjs --check (يقارن فقط: يرسب إن اختلف — للـCI)
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const AIDIR = join(root, "supabase", "functions", "ai-assistant");
export const BUNDLE_PATH = join(AIDIR, "ai-assistant.bundle.ts");
const ORDER = ["sales_compute.mjs", "intents.mjs", "index.ts"];

export function buildBundle() {
  const externals = [];                       // استيراد خارجيّ (esm.sh) — يتصدّر
  const seenExt = new Set();
  const bodies = [];
  for (const f of ORDER) {
    const src = readFileSync(join(AIDIR, f), "utf8").replace(/\r\n/g, "\n");
    const body = [];
    for (const ln of src.split("\n")) {
      if (/^\s*import\b/.test(ln)) {
        if (/from\s+["']\.\//.test(ln)) continue;             // استيراد نسبيّ ⇒ محتواه مُدمَج، أسقطه
        const t = ln.trim(); if (!seenExt.has(t)) { seenExt.add(t); externals.push(t); }   // خارجيّ ⇒ للأعلى (بلا تكرار)
        continue;
      }
      body.push(ln);
    }
    bodies.push(`// ===================== ${f} =====================\n` + body.join("\n").trim());
  }
  const header =
    "// ⚠ ملفّ مُولَّد آلياً بـ scripts/build-edge-bundle.mjs — 🚫 لا تحرّره يدوياً.\n" +
    "// المصدر: sales_compute.mjs + intents.mjs + index.ts. حارس edge-bundle-sync يمنع انحرافه عن المصدر.\n" +
    "// النشر: الصق هذا الملف كاملاً في محرّر Supabase (index.ts) ثم Deploy — 🚫 بلا Add File.\n";
  return header + "\n" + externals.join("\n") + "\n\n" + bodies.join("\n\n") + "\n";
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const built = buildBundle();
  if (process.argv.includes("--check")) {
    let cur = ""; try { cur = readFileSync(BUNDLE_PATH, "utf8").replace(/\r\n/g, "\n"); } catch {}
    if (cur !== built) { console.error("✗ المدمج متقادم — شغّل: node scripts/build-edge-bundle.mjs"); process.exit(1); }
    console.log("✅ المدمج مطابق للمصادر."); process.exit(0);
  }
  writeFileSync(BUNDLE_PATH, built);
  console.log("✅ كُتب المدمج: " + BUNDLE_PATH + " (" + built.length + " حرفاً).");
}

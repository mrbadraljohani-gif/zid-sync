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

const nsOf = (f) => "__m_" + f.replace(/\.[^.]+$/, "").replace(/[^\w]/g, "_");   // sales_compute.mjs → __m_sales_compute

// 🚨 عزل النطاقات: كل وحدة IIFE مستقلّة تُصدِّر ما يحتاجه الباقي فقط — 🚫 لا لصق متسلسل في النطاق العامّ
//   (منع تصادم أسماء داخلية بين الملفات مهما تكرّرت). الأخيرة (index) IIFE تنفيذيّة (Deno.serve) بلا تصدير.
export function buildBundle() {
  const externals = []; const seenExt = new Set();
  const mods = [];
  for (const f of ORDER) {
    const src = readFileSync(join(AIDIR, f), "utf8").replace(/\r\n/g, "\n");
    const body = []; const relImports = []; const exportNames = [];
    for (const ln of src.split("\n")) {
      if (/^\s*import\b/.test(ln)) {
        const rel = ln.match(/^\s*import\s*\{([^}]*)\}\s*from\s*["']\.\/([\w.]+)["']/);
        if (rel) { relImports.push({ names: rel[1].split(",").map((x) => x.trim()).filter(Boolean), from: rel[2] }); continue; }   // نسبيّ ⇒ سيُفكَّك من فضاء الوحدة المصدر
        const t = ln.trim(); if (!seenExt.has(t)) { seenExt.add(t); externals.push(t); }   // خارجيّ ⇒ يتصدّر (خارج كل IIFE)
        continue;
      }
      const mE = ln.match(/^export\s+(?:async\s+)?function\s+([\w$]+)/) || ln.match(/^export\s+const\s+([\w$]+)/);
      if (mE) exportNames.push(mE[1]);
      body.push(ln.replace(/^export\s+/, ""));   // إسقاط export داخل IIFE (لا يصحّ في دالّة)
    }
    mods.push({ f, ns: nsOf(f), body: body.join("\n").trim(), relImports, exportNames });
  }
  const chunks = [];
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    const destructures = m.relImports.map((ri) => `  const { ${ri.names.join(", ")} } = ${nsOf(ri.from)};`).join("\n");
    const head = `// ===================== ${m.f} =====================\n`;
    if (i < mods.length - 1) {
      // وحدة مُصدِّرة: IIFE تُرجع صادراتها
      chunks.push(`${head}const ${m.ns} = (() => {\n${destructures ? destructures + "\n" : ""}${m.body}\n  return { ${m.exportNames.join(", ")} };\n})();`);
    } else {
      // الأخيرة (index): IIFE تنفيذيّة (Deno.serve) — تفكّ ما تستورد ولا تُصدِّر
      chunks.push(`${head}(() => {\n${destructures ? destructures + "\n" : ""}${m.body}\n})();`);
    }
  }
  const header =
    "// ⚠ ملفّ مُولَّد آلياً بـ scripts/build-edge-bundle.mjs — 🚫 لا تحرّره يدوياً.\n" +
    "// المصدر: sales_compute.mjs + intents.mjs + index.ts. حارس G-EDGE-BUNDLE يمنع انحرافه ويتحقّق من إقلاعه.\n" +
    "// 🚨 كل وحدة في IIFE مستقلّة (عزل نطاق) — لا تصادم أسماء بين الملفات.\n" +
    "// النشر: الصق هذا الملف كاملاً في محرّر Supabase (index.ts) ثم Deploy — 🚫 بلا Add File.\n";
  return header + "\n" + externals.join("\n") + "\n\n" + chunks.join("\n\n") + "\n";
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

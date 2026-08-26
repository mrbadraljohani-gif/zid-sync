// ============================================================================
// حارس المعرّفات اليتيمة — أي معرّف حرفي يُشار إليه من JS ولا وجود له في الترميز.
//
// سبب وجوده: هذا الصنف من العطل **تكرّر مرتين في يوم واحد**، وكلاهما فشل صامت:
//   · #batchBody  — comboPick يبحث فيها عن صندوق الاعتماد بعد حذف اللوحة القديمة
//                   ⇒ **كل ربط يدوي يفشل بلا رسالة**.
//   · #pills      — renderPills تكتب فيها قائمة الروابط بعد حذف قسم ③
//                   ⇒ **زرّ إلغاء الربط اختفى**، فلا سبيل لتصحيح رابط خاطئ.
// كلاهما محروس بـ`if (!el) return` فلا يرمي شيئاً — والميزة تموت بصمت.
//
// ⚠ حدّه (يُعلَن ولا يُخفى): يمسك «الحاوية غير موجودة» **لا** «الحاوية موجودة
// والمُحدِّد خاطئ». لو بقي #batchBody في الترميز بدور آخر لمرّ الحارس. تلك تحتاج
// اختباراً سلوكياً — كما حدث فعلاً في tests/manual-link.mjs.
//
// المعرّفات المُركَّبة ("whd-" + uid) خارج نطاقه عمداً: يلتقط الحرفية فقط.
//
// تشغيل:  node tests/dead-ids.mjs
//         node tests/dead-ids.mjs --broken   (تحقّق ذاتي: يحقن getElementById("ghost-xyz"))
// ============================================================================
import { readFileSync } from "node:fs";

let html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");
if (BROKEN) html = html.replace("function goPage(id, fromHash) {", 'function goPage(id, fromHash) {\n  const ghost = document.getElementById("ghost-xyz");   // حقن التحقّق الذاتي');

// ---- استثناءات صريحة: كل مدخل بتعليله. لا كتم صامت — القائمة فارغة اليوم. ----
const ALLOW = {
  // "some-id": "السبب: يُنشأ ديناميكياً في X / يخصّ مكتبة خارجية / …",
};

// معرّفات الترميز
const declared = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));

// كل إشارة حرفية من JS إلى معرّف
const used = new Map();
const add = (id, how, idx) => {
  if (!used.has(id)) used.set(id, { hows: new Set(), at: idx });
  used.get(id).hows.add(how);
};
for (const m of html.matchAll(/getElementById\(\s*"([\w-]+)"\s*\)/g)) add(m[1], 'getElementById("…")', m.index);
for (const m of html.matchAll(/querySelector(?:All)?\(\s*"#([\w-]+)"/g)) add(m[1], 'querySelector("#…")', m.index);
for (const m of html.matchAll(/setBusy\(\s*"([\w-]+)"/g)) add(m[1], 'setBusy("…")', m.index);

const lineOf = idx => html.slice(0, idx).split("\n").length;
const dead = [...used.entries()].filter(([id]) => !declared.has(id) && !(id in ALLOW));
const staleAllow = Object.keys(ALLOW).filter(id => declared.has(id) || !used.has(id));

if (BROKEN) {
  if (!dead.some(([id]) => id === "ghost-xyz")) {
    console.error("✗ التحقّق الذاتي: المعرّف المحقون ghost-xyz لم يُرصَد — الحارس بلا أسنان.");
    process.exit(1);
  }
  console.log("✅ تحقّق ذاتي: رُصد المعرّف المحقون ghost-xyz — للحارس أسنان.");
  process.exit(0);
}

if (staleAllow.length) {
  console.error("✗ استثناءات لم تعد لازمة (نظّفها حتى تبقى القائمة صادقة):");
  for (const id of staleAllow) console.error("  ✗ #" + id + " — " + ALLOW[id]);
  process.exit(1);
}

if (dead.length) {
  console.error(`✗ ${dead.length} معرّفاً يُشار إليه من JS ولا وجود له في الترميز (فشل صامت):`);
  for (const [id, v] of dead) console.error(`  ✗ #${id}  [${[...v.hows].join(", ")}]  سطر ${lineOf(v.at)}`);
  console.error("  إمّا أُزيل العنصر فيُحذف الكود الميت، أو تغيّر اسمه فيُصحَّح المُحدِّد.");
  console.error("  وإن كان يُنشأ ديناميكياً فأضِفه إلى ALLOW **بتعليله**.");
  process.exit(1);
}

console.log(`✅ لا معرّف يتيم: ${used.size} إشارة حرفية من JS، كلها موجودة ضمن ${declared.size} معرّفاً في الترميز.`);

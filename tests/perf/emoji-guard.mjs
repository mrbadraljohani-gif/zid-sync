// ============================================================================
// حارس الإيموجي (§ب-٤) — ثابت. أي محرف إيموجي تصويري في سياق واجهة (نصّ عنصر · شارة ·
// زرّ · تبويب · placeholder · aria-label داخل قوالب/HTML) ⇒ رسوب. المبقاة: ↩ ⚠ ⚙ (و ✓ ✕
// ليسا تصويريّين). يُستثنى: التعليقات · title="…" (لا يقبل SVG) · الرسائل العابرة
// (showToast/setMsg/repoStatus/showErr/textContent/innerHTML لعناصر لحظية).
// HTML_PATH لإثبات الرسوب على نسخة ما قبل الاستبدال.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let src = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");

// (1) جرّد تعليقات الكتلة /* */ و<!-- -->
src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
const ALLOW = new Set(["↩", "⚠", "⚙", "✓", "✕", "️"]);
const PICT = /\p{Extended_Pictographic}/u;
// نمط الرسائل العابرة: سطر يستدعي دالّة رسالة لحظية أو يكتب نصّاً في عنصر لحظي
const TRANSIENT = /(showToast|showErr|setLoginMsg|repoStatus|setMsg\(|\.textContent\s*=|\.innerHTML\s*=)/;

const hits = [];
const lines = src.split("\n");
for (let i = 0; i < lines.length; i++) {
  let ln = lines[i];
  // جرّد تعليق السطر // …  (تجنّب http:// و https://)
  const c = ln.search(/(^|[^:/])\/\/(?!\/)/);
  if (c >= 0) { const at = ln.indexOf("//", c); if (!/https?:$/.test(ln.slice(0, at))) ln = ln.slice(0, at); }
  // جرّد محتوى title="…"
  ln = ln.replace(/title="[^"]*"/g, "");
  if (TRANSIENT.test(ln)) continue;   // سطر رسالة عابرة — خارج النطاق
  for (const ch of ln) { if (ALLOW.has(ch)) continue; if (PICT.test(ch)) hits.push({ line: i + 1, ch, ctx: ln.trim().slice(0, 60) }); }
}
// فرِّد بالسطر+المحرف
const seen = new Set(), uniq = [];
for (const h of hits) { const k = h.line + h.ch; if (!seen.has(k)) { seen.add(k); uniq.push(h); } }

if (uniq.length) {
  console.error(`✗ إيموجي تصويري في سياق واجهة (${uniq.length}) — حوّله إلى أيقونة SVG (.ico) أو أبقِه ضمن ↩ ⚠ ⚙:`);
  for (const h of uniq.slice(0, 40)) console.error(`  ${h.line}: ${h.ch}  …${h.ctx}…`);
  process.exit(1);
}
console.log("✅ لا إيموجي تصويري في سياق الواجهة (عدا ↩ ⚠ ⚙ ✓ ✕) — عبر القوالب والـHTML.");

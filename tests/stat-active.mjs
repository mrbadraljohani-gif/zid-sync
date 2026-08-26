// ============================================================================
// حارس: لا بطاقة إحصاء (.stat) قابلة للنقر بلا حالة نشطة ممكنة.
// صنف عطل تكرّر مرّتين (البطاقة الصامتة «غائب» · الزرّ المعطّل بلا سبب): عنصر يبدو
// قابلاً للنقر (onclick) لكن لا يمكنه أن يُبرَز. القاعدة: أي .stat فيها onclick يجب
// أن تحمل data-card (مفتاح الإبراز)، و renderDetailBody يُبرز بـ data-card === activeCard.
// HTML_PATH لإثبات الرسوب على نسخة ما قبل الإصلاح («غائب» بلا data-card).
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const script = html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>"));
const fails = [];

// كل وسوم <button ... class="stat...">: إن كان فيها onclick فيلزمها data-card
for (const m of html.matchAll(/<button\b[^>]*\bclass="stat[^"]*"[^>]*>/g)) {
  const tag = m[0];
  if (/onclick=/.test(tag) && !/data-card=/.test(tag)) {
    const lbl = (tag.match(/aria-label="([^"]{0,30})/) || [])[1] || tag.slice(0, 50);
    fails.push(`بطاقة .stat قابلة للنقر بلا data-card (لا يمكن إبرازها): …${lbl}…`);
  }
}
// الإبراز يجب أن يُقاد بـ data-card === activeCard (مفصول عن الفلتر)
if (!/s\.dataset\.card === activeCard/.test(script))
  fails.push("renderDetailBody لا يُبرز بـ data-card === activeCard (حالة الإبراز غير مفصولة عن الفلتر)");

if (fails.length) { console.error("✗ بطاقة قابلة للنقر بلا حالة نشطة:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ كل بطاقة .stat قابلة للنقر تقبل حالة نشطة (data-card)، والإبراز مقاد بـ activeCard.");

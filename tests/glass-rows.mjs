// ============================================================================
// §٢ الزجاج — حارس ثابت: يمنع تسرّب backdrop-filter إلى صفوف القائمة الموحّدة.
// القاعدة: الزجاج للحاويات الثابتة فقط؛ صفوف القائمة (.batch-card/.mcard) — قد تبلغ
// 300 صفّاً — كلٌّ منها backdrop-filter = طبقة إعادة تركيب ⇒ تدهور تمرير مؤكّد.
// يمسح كتل قواعد CSS: أي كتلة تحوي backdrop-filter ويطابق مُحدِّدها صفّ قائمة ⇒ رسوب.
//
// self-check: node tests/glass-rows.mjs --broken   (يجب أن يرسب — يحقن انتهاكاً مصطنعاً)
// فحص حقيقي: node tests/glass-rows.mjs
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
const BROKEN = process.argv.includes("--broken");

// مُحدِّد صفّ قائمة موحّدة + أزراره التي تتكرّر 300×: .batch-card/.mcard (الصفّ) و.mc-btn/.mini-btn (أزرار داخله)
const ROW_SEL = /(^|[\s,>+~])\.(batch-card|mcard|mc-btn|mini-btn)(\b|[.:])/;

// يمسح كتل «selector { decls }» ويُعيد أول مُحدِّد صفّ يحمل backdrop-filter (أو null)
function glassLeaksToRows(cssText) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cssText))) {
    if (/backdrop-filter/i.test(m[2]) && ROW_SEL.test(m[1])) return m[1].trim().replace(/\s+/g, " ");
  }
  return null;
}

if (BROKEN) {
  // انتهاك مصطنع: صفّ قائمة يحمل زجاجاً — لا بدّ أن يُمسك
  const injected = css + "\n  .batch-card { backdrop-filter: blur(24px) saturate(150%); }\n";
  const leak = glassLeaksToRows(injected);
  if (leak === null) {
    console.error("✗ [self] الحارس أعمى: لم يمسك .batch-card { backdrop-filter } المصطنعة");
    process.exit(1);
  }
  console.log("✅ [self] الحارس يرسب على الانتهاك المصطنع — تسرّب: " + leak);
  process.exit(0);
}

const leak = glassLeaksToRows(css);
if (leak !== null) {
  console.error("✗ §٢ تسرّب الزجاج إلى صفّ قائمة — backdrop-filter على: " + leak);
  process.exit(1);
}
console.log("✅ §٢ لا صفّ قائمة (.batch-card/.mcard) يحمل backdrop-filter — الزجاج للحاويات الثابتة فقط.");

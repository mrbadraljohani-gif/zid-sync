// ============================================================================
// stripComments(src) — يزيل تعليقات JS (// و /* */) ويُبقي الكود والنصوص حرفياً.
//
// لماذا: حارس يفحص «هل تذكر الدالّة الكلمة X؟» يرسب زوراً إن وردت X في تعليق
// (G-MOVE: «sales_uploads» في تعليق بجوار renderStaleNote داخل run). المرساة تحرس
// المعنى لا الصياغة — فالتعليق ليس كوداً.
//
// يحترم النصوص ('…' "…") والـregex (/…/) والقوالب المتداخلة (`…${ `…` }…`) — فلا يقرأ
// "https://x" أو /"/g تعليقاً ولا يختلّ بعد قالب داخل قالب. ما يُزال يُستبدَل بمسافة
// وتُحفظ الأسطر فلا تلتصق كلمتان ولا تتغيّر أرقام الأسطر.
//
// ⚠ «يُحلَّل بعد التجريد» وحده لا يثبت السلامة: اختلال تتبّع القوالب لا يُحدث خطأ صياغة
// بالضرورة. الحارس tests/strip-comments-self.mjs يفحص حالات محدّدة بالقيمة.
// ============================================================================
const REGEX_PREV = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const REGEX_KW = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)$/;

export function stripComments(src) {
  const n = src.length;
  let out = "";
  let i = 0;

  const prevSig = () => {
    let k = out.length - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    return k < 0 ? "" : out[k];
  };

  // يقرأ قالباً يبدأ عند i (علامة `) حتى نهايته، ويعالج ${…} كوداً بتكرار
  function template() {
    out += src[i++];                                     // `
    while (i < n) {
      const c = src[i];
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { out += c; i++; return; }
      if (c === "$" && src[i + 1] === "{") { out += "${"; i += 2; code(true); continue; }
      out += c; i++;
    }
  }

  // يقرأ كوداً؛ إن كان untilBrace يتوقّف عند «}» الموازنة (نهاية ${…}) ويستهلكها
  function code(untilBrace) {
    let depth = 0;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (untilBrace) {
        if (c === "{") depth++;
        else if (c === "}") { if (depth === 0) { out += "}"; i++; return; } depth--; }
      }
      if (c === "/" && d === "/") {                     // تعليق سطر
        while (i < n && src[i] !== "\n") i++;
        out += " ";
        continue;
      }
      if (c === "/" && d === "*") {                     // تعليق كتلة (يحفظ الأسطر)
        const end = src.indexOf("*/", i + 2);
        const stop = end < 0 ? n : end + 2;
        out += " " + src.slice(i, stop).replace(/[^\n]/g, "");
        i = stop;
        continue;
      }
      if (c === "`") { template(); continue; }
      if (c === '"' || c === "'") {                      // نصّ — يُنسخ حرفياً
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== "\n") { if (src[j] === "\\") j++; j++; }
        out += src.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (c === "/") {                                   // regex؟ بحسب ما قبله
        const p = prevSig();
        if (p === "" || REGEX_PREV.has(p) || REGEX_KW.test(out.slice(-12))) {
          let j = i + 1, inClass = false;
          while (j < n && src[j] !== "\n") {
            const ch = src[j];
            if (ch === "\\") { j += 2; continue; }
            if (ch === "[") inClass = true;
            else if (ch === "]") inClass = false;
            else if (ch === "/" && !inClass) break;
            j++;
          }
          j++;
          while (j < n && /[a-z]/i.test(src[j])) j++;     // الأعلام g/i/m…
          out += src.slice(i, j);
          i = j;
          continue;
        }
      }
      out += c;
      i++;
    }
  }

  code(false);
  return out;
}

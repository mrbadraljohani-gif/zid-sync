// ============================================================================
// مشترك بين دوالّ تكامل زد — مصدر واحد للثوابت فلا تنحرف بين start وcallback.
//
// 🚨 لا يُطبع هنا توكن ولا سرّ ولا جسم استجابة من زد — في أي سجلّ أو رسالة.
//    سجلّات Supabase مقروءة؛ المسموح في console: الرمز المرجعي واسم المرحلة ورمز HTTP فقط.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🚨 مطابق **حرفياً** لـ Redirection URL المسجَّل في لوحة الشريك (بلا شرطة مائلة أخيرة).
//    أي اختلاف — ولو حرف — يرفضه خادم OAuth عند التبادل برسالة مبهمة.
export const REDIRECT_URI =
  "https://pfbcyxciqrttukayskkg.supabase.co/functions/v1/zid-oauth-callback";

export const ZID_OAUTH = "https://oauth.zid.sa";

// نطاقات قراءة فقط — المرحلة الأولى. لا نطاق كتابة إطلاقاً.
export const SCOPES = "products.read inventories.read";

// المتجر الوحيد المقبول. أي تفويض لمتجر آخر يُرفض ولا يُخزَّن.
export const EXPECTED_STORE_ID = "28494";

// عمر state ومهلة تنظيفه
export const STATE_TTL_MIN = 10;     // صلاحية state للاستهلاك
export const STATE_PURGE_MIN = 60;   // حذف ما تجاوز ساعة عند كل توليد

// عميل service_role — RLS يمنع كل من سواه على الجداول الثلاثة.
export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("env-missing");   // رسالة ثابتة بلا قيم
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// رمز مرجعي قصير يُعاد للمستخدم ويُطبع وحده في السجلّ — للربط بين البلاغ والسجلّ بلا تفاصيل.
export function newRef(): string {
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

// سجلّ آمن: المرحلة ＋ الرمز ＋ رمز HTTP اختياري. لا يقبل كائن خطأ عمداً
// (رسالة الخطأ قد تحمل جسم استجابة فيه توكن).
export function logSafe(stage: string, ref: string, httpStatus?: number) {
  console.error(`[zid] stage=${stage} ref=${ref}${httpStatus != null ? ` http=${httpStatus}` : ""}`);
}

// ⚠ نصّ عادي لا HTML: نطاق *.supabase.co قد يقدّم استجابات HTML للدوالّ كنصّ خام
//    (تُعرض الوسوم حرفياً). النصّ العادي يُقرأ صحيحاً في الحالتين.
export function textPage(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function failPage(ref: string, status = 400): Response {
  return textPage(
    `تعذّر إكمال الربط مع زد.\n\nالرمز المرجعي: ${ref}\n\nأعِد المحاولة من البداية، وإن تكرّر الخطأ فاحتفظ بالرمز.`,
    status,
  );
}

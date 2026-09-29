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

// النطاقات تُختار في **لوحة الشريك** لا في رابط التفويض (قراءة فقط: Products · Inventory
// · Product Inventory Stock). ⚠ لا يُرسل معامل scope في /oauth/authorize: مثال زد الرسمي
// لا يتضمّنه، وإرسالُه بأسماء مخمَّنة أسقط صفحة التفويض بـ«Oops! Something broke».
// هذه القيمة وصفية فقط — تُخزَّن في zid_tokens.scopes إن لم تُعِد زد حقل scope.
export const SCOPES = "products.read inventories.read";

// سطر تشخيص رابط التفويض — كل أجزائه عامّة (client_id عامّ · redirect_uri · response_type)،
// و**state يُحجب** (نونس CSRF لمرّة واحدة: يُطبع طوله وأوّل 4 أحرف فقط).
export function logAuthorizeUrl(ref: string, url: URL) {
  const shown = new URL(url.toString());
  const st = shown.searchParams.get("state") || "";
  if (st) shown.searchParams.set("state", `${st.slice(0, 4)}…(${st.length})`);
  console.log(`[zid] stage=start:authorize-url ref=${ref} url=${shown.toString()}`);
}

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

// سجلّ آمن: المرحلة ＋ الرمز ＋ رمز HTTP اختياري ＋ رمز خطأ القاعدة اختياري.
// لا يقبل كائن خطأ عمداً (رسالة الخطأ قد تحمل جسم استجابة فيه توكن).
export function logSafe(stage: string, ref: string, httpStatus?: number, dbCode?: string) {
  console.error(`[zid] stage=${stage} ref=${ref}${httpStatus != null ? ` http=${httpStatus}` : ""}${dbCode ? ` db=${dbCode}` : ""}`);
}

// رمز خطأ القاعدة وحده — SQLSTATE من 5 خانات (42501 صلاحية · 42P01 جدول · 42703 عمود
// · 23502 NOT NULL) أو PGRST### من PostgREST (PGRST301 مفتاح مرفوض). الرسالة لا تُطبع أبداً.
// أي قيمة لا تطابق الشكلين تُطبع «other» — فلا يتسرّب نصّ حرّ من الخطأ.
export function dbCode(err: unknown): string {
  const c = err && typeof err === "object" ? (err as Record<string, unknown>).code : null;
  if (typeof c === "string" && /^([0-9A-Z]{5}|PGRST\d{3})$/.test(c)) return c;
  return "other";
}

// نوع المفتاح لا قيمته: JWT قديم (eyJ…) · مفتاح جديد (sb_secret_…) · غيره · مفقود.
// يحسم «هل المفتاح المحقون معطَّل؟» بلا كشف أي حرف منه.
export function keyKind(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!k) return "missing";
  if (k.startsWith("eyJ")) return "jwt";
  if (k.startsWith("sb_secret_")) return "sb_secret";
  return "other";
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

// ⚠ ملف مُولَّد — لا تحرّره يدوياً. المصدر: zid-app-callback/index.ts ＋ _shared/zid.ts
//   أعِد التوليد: node supabase/functions/build-zid-bundles.mjs
// الصقه كاملاً في محرّر الدالّة بلوحة Supabase.

// ───────── _shared/zid.ts (مدمج) ─────────
// ============================================================================
// مشترك بين دوالّ تكامل زد — مصدر واحد للثوابت فلا تنحرف بين start وcallback.
//
// 🚨 لا يُطبع هنا توكن ولا سرّ ولا جسم استجابة من زد — في أي سجلّ أو رسالة.
//    سجلّات Supabase مقروءة؛ المسموح في console: الرمز المرجعي واسم المرحلة ورمز HTTP فقط.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🚨 مطابق **حرفياً** لـ Redirection URL المسجَّل في لوحة الشريك (بلا شرطة مائلة أخيرة).
//    أي اختلاف — ولو حرف — يرفضه خادم OAuth عند التبادل برسالة مبهمة.
const REDIRECT_URI =
  "https://pfbcyxciqrttukayskkg.supabase.co/functions/v1/zid-oauth-callback";

const ZID_OAUTH = "https://oauth.zid.sa";

// النطاقات تُختار في **لوحة الشريك** لا في رابط التفويض (قراءة فقط: Products · Inventory
// · Product Inventory Stock). ⚠ لا يُرسل معامل scope في /oauth/authorize: مثال زد الرسمي
// لا يتضمّنه، وإرسالُه بأسماء مخمَّنة أسقط صفحة التفويض بـ«Oops! Something broke».
// هذه القيمة وصفية فقط — تُخزَّن في zid_tokens.scopes إن لم تُعِد زد حقل scope.
const SCOPES = "products.read inventories.read";

// سطر تشخيص رابط التفويض — كل أجزائه عامّة (client_id عامّ · redirect_uri · response_type)،
// و**state يُحجب** (نونس CSRF لمرّة واحدة: يُطبع طوله وأوّل 4 أحرف فقط).
function logAuthorizeUrl(ref: string, url: URL) {
  const shown = new URL(url.toString());
  const st = shown.searchParams.get("state") || "";
  if (st) shown.searchParams.set("state", `${st.slice(0, 4)}…(${st.length})`);
  console.log(`[zid] stage=start:authorize-url ref=${ref} url=${shown.toString()}`);
}

// المتجر الوحيد المقبول. أي تفويض لمتجر آخر يُرفض ولا يُخزَّن.
const EXPECTED_STORE_ID = "28494";

// عمر state ومهلة تنظيفه
const STATE_TTL_MIN = 10;     // صلاحية state للاستهلاك
const STATE_PURGE_MIN = 60;   // حذف ما تجاوز ساعة عند كل توليد

// عميل service_role — RLS يمنع كل من سواه على الجداول الثلاثة.
function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("env-missing");   // رسالة ثابتة بلا قيم
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// رمز مرجعي قصير يُعاد للمستخدم ويُطبع وحده في السجلّ — للربط بين البلاغ والسجلّ بلا تفاصيل.
function newRef(): string {
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

// سجلّ آمن: المرحلة ＋ الرمز ＋ رمز HTTP اختياري ＋ رمز خطأ القاعدة اختياري.
// لا يقبل كائن خطأ عمداً (رسالة الخطأ قد تحمل جسم استجابة فيه توكن).
function logSafe(stage: string, ref: string, httpStatus?: number, dbCode?: string) {
  console.error(`[zid] stage=${stage} ref=${ref}${httpStatus != null ? ` http=${httpStatus}` : ""}${dbCode ? ` db=${dbCode}` : ""}`);
}

// رمز خطأ القاعدة وحده — SQLSTATE من 5 خانات (42501 صلاحية · 42P01 جدول · 42703 عمود
// · 23502 NOT NULL) أو PGRST### من PostgREST (PGRST301 مفتاح مرفوض). الرسالة لا تُطبع أبداً.
// أي قيمة لا تطابق الشكلين تُطبع «other» — فلا يتسرّب نصّ حرّ من الخطأ.
function dbCode(err: unknown): string {
  const c = err && typeof err === "object" ? (err as Record<string, unknown>).code : null;
  if (typeof c === "string" && /^([0-9A-Z]{5}|PGRST\d{3})$/.test(c)) return c;
  return "other";
}

// نوع المفتاح لا قيمته: JWT قديم (eyJ…) · مفتاح جديد (sb_secret_…) · غيره · مفقود.
// يحسم «هل المفتاح المحقون معطَّل؟» بلا كشف أي حرف منه.
function keyKind(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!k) return "missing";
  if (k.startsWith("eyJ")) return "jwt";
  if (k.startsWith("sb_secret_")) return "sb_secret";
  return "other";
}

// ⚠ نصّ عادي لا HTML: نطاق *.supabase.co قد يقدّم استجابات HTML للدوالّ كنصّ خام
//    (تُعرض الوسوم حرفياً). النصّ العادي يُقرأ صحيحاً في الحالتين.
function textPage(body: string, status = 200): Response {
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

function failPage(ref: string, status = 400): Response {
  return textPage(
    `تعذّر إكمال الربط مع زد.\n\nالرمز المرجعي: ${ref}\n\nأعِد المحاولة من البداية، وإن تكرّر الخطأ فاحتفظ بالرمز.`,
    status,
  );
}

// ───────── zid-app-callback/index.ts ─────────
// ============================================================================
// zid-app-callback — Callback URL المسجَّل في زد (أحداث التطبيق).
//   ① تكتب الحمولة الخام في zid_app_events (جدول service_role وحده)
//   ② تسجّل سطراً مختصراً في activity_log — بلا الحمولة
//   ③ تعيد 200 دائماً (وإلا أعادت زد المحاولة بلا نهاية)
//
// 🚫 لا تُبطل ولا تحذف ولا تعدّل أي توكن — مهما قالت الحمولة.
//    السبب: رابط عام بلا توقيع موثَّق من زد ⇒ أي أحد يستطيع مناداته.
//    مدخل عام غير موثَّق لا يفعل فعلاً هدّاماً — يسجّل فقط.
//    والإبطال يقع بالإثبات: حين تردّ زد 401/403 على توكننا، لا حين يدّعي طلبٌ ذلك.
//
// شكل الحدث غير موثَّق في docs.zid.sa — لذا لا نفترض بنية:
//    نخزّن الخام كما وصل، ونقرؤه بعد أول تثبيت/إلغاء لنعرف الشكل الحقيقي.
//
// تُنشر بـ --no-verify-jwt (زد تناديها من خادمها بلا جلسة).
// ============================================================================

const MAX_BODY = 64 * 1024;   // سقف الحمولة المخزَّنة

// قيم هذه الترويسات فقط تُخزَّن؛ غيرها يُخزَّن اسمه وقيمته محجوبة.
// (ترويسات قد تحمل توكنات أو أسراراً لا تُحفظ نصّاً حتى في جدول مغلق.)
const HEADER_ALLOW = new Set([
  "content-type", "content-length", "user-agent", "x-request-id",
  "x-forwarded-for", "cf-connecting-ip", "cf-ray", "x-real-ip",
]);

function pickLabel(p: unknown, keys: string[]): string | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v.slice(0, 100);
    if (typeof v === "number") return String(v);
  }
  return null;
}

function ok(ref: string): Response {
  return new Response(JSON.stringify({ ok: true, ref }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const ref = newRef();

  try {
    // الحمولة — نصّاً أولاً ثم محاولة JSON (لا نفترض الشكل)
    let raw = "";
    try { raw = await req.text(); } catch { /* جسم فارغ مقبول */ }
    const truncated = raw.length > MAX_BODY;
    if (truncated) raw = raw.slice(0, MAX_BODY);

    let payload: unknown;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { _raw_text: raw }; }

    // الترويسات — الأسماء كلها، والقيم للمسموح فقط
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      headers[key] = HEADER_ALLOW.has(key) ? v.slice(0, 300) : "[redacted]";
    });

    // تسميات للفهرسة فقط — لا يُبنى عليها أي فعل
    const eventType = pickLabel(payload, ["event", "event_type", "type", "action"]) ?? "unknown";
    let storeId = pickLabel(payload, ["store_id", "storeId"]);
    if (!storeId && payload && typeof payload === "object") {
      const s = (payload as Record<string, unknown>).store;
      storeId = pickLabel(s, ["id", "store_id"]);
    }

    const db = adminClient();

    // ① الخام في الجدول المغلق
    const { data: row, error: insErr } = await db
      .from("zid_app_events")
      .insert({
        event_type: eventType,
        store_id: storeId,
        payload: { method: req.method, truncated, body: payload },
        headers,
      })
      .select("id")
      .single();
    if (insErr) { logSafe("app:insert-failed:key=" + keyKind(), ref, undefined, dbCode(insErr)); return ok(ref); }

    // ② سطر مختصر في activity_log — **بلا الحمولة**:
    //    activity_log مقروء لكل موثَّق، والحمولة قد تحمل ما لا يُعرض.
    const { error: actErr } = await db.from("activity_log").insert({
      event_type: "zid_app_event",
      zid_sku: null,
      details: { event: eventType, store_id: storeId, zid_app_event_id: row?.id ?? null },
    });
    if (actErr) logSafe("app:activity-failed", ref, undefined, dbCode(actErr));

    return ok(ref);
  } catch {
    logSafe("app:unexpected", ref);
    return ok(ref);   // 200 دائماً
  }
});

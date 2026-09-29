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
import { adminClient, dbCode, keyKind, logSafe, newRef } from "../_shared/zid.ts";

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

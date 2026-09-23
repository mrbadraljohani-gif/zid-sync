-- ============================================================================
-- ASJ / zid-sync — عدّاد استخدام مساعد المبيعات (السقف اليوميّ)
--
-- ⚠ نفّذ **بعد** supabase_user_roles.sql. نفّذه مرّة واحدة. آمن لإعادة التنفيذ (idempotent).
--
-- الغرض: حصر عدد أسئلة المساعد لكل مستخدم في اليوم (بتوقيت الرياض) — حماية حصّة Gemini المجانية.
-- 🚫 لا يخزّن السؤال ولا الجواب ولا أي بيانات أعمال — معرّف المستخدم ＋ اليوم ＋ العدّاد فقط.
--
-- 🚨 الزيادة ذرّية (جملة واحدة، قفل صفّ) — لا SELECT ثمّ UPDATE (طلبان متزامنان يقرآن 19 فيصيران 20 كلاهما).
-- 🚨 الدالّة security definer تقرأ auth.uid() **داخلياً** — لا تقبل user_id معاملاً (وإلّا تلاعب بعدّاد الغير).
-- 🚨 السقف ثابت داخل الدالّة (لا معامل من العميل — وإلّا مرّر سقفاً ضخماً وتجاوز الحدّ). غيّره هنا وحده.
-- 🚨 الحاجز في الصلاحية لا في raise وحده: revoke من public/anon قبل المنح الصريح (نمط ملفاتنا).
-- 🚨 تمسّ جدول العدّاد وحده — صفر وصول لأي جدول أعمال.
--
-- (نفس نمط الملفات السابقة: RLS + grants بلا anon · begin/commit · تحقّق في الذيل)
-- ============================================================================
begin;

-- 1) الجدول — صفّ واحد لكل (مستخدم، يوم). القيد المركّب مفتاح الزيادة الذرّية عبر ON CONFLICT.
--    used_count: اسم صريح لا يلتبس بدالّة التجميع count().
create table if not exists public.ai_usage (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  usage_day  date    not null,
  used_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_day)
);

-- 2) RLS — يقرأ المستخدم صفوفه فقط · 🚫 لا سياسة كتابة للعملاء إطلاقاً (الكتابة عبر الدالّة الآمنة وحدها)
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon;                 -- 🚨 لا شيء لـ anon
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = auth.uid());
-- (لا insert/update/delete policies ⇒ RLS يمنع كل كتابة مباشرة من العميل؛ الدالّة security definer تكتب صفّ المستخدم وحده)

-- 3أ) 🚨 السقف اليوميّ — مصدر واحد. غيّره هنا وحده (تقرؤه الزيادة والحالة والواجهة عبر meta.cap).
--     ليست security definer (لا تقرأ جدولاً — ثابت بحت). 🚫 revoke من public فلا يقرؤها anon؛
--     الدالّتان bump/status (definer) تستدعيانها بصلاحية مالكهما فلا تحتاج منحاً لـauthenticated.
--     «لا يغيّرها أحد»: التبديل (create or replace) صلاحية DDL لمالك القاعدة، لا يملكها authenticated/anon.
create or replace function public.ai_daily_cap()
returns integer language sql immutable as $$ select 500 $$;
revoke execute on function public.ai_daily_cap() from public;

-- 3ب) دالّة الزيادة الذرّية — بلا معاملات (auth.uid داخلياً)، السقف من ai_daily_cap()، تمسّ ai_usage وحده.
--    ترجع (allowed, used, cap): allowed=false عند بلوغ السقف (الصفّ لا يُزاد فوقه).
--    داخل ON CONFLICT DO UPDATE: الصفّ الحاليّ يُشار إليه باسم الجدول غير المؤهّل ai_usage.used_count (لا public.ai_usage).
create or replace function public.ai_usage_bump()
returns table(allowed boolean, used integer, cap integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap  integer := public.ai_daily_cap();                                   -- السقف من المصدر الواحد
  v_uid  uuid := auth.uid();
  v_day  date := ((now() at time zone 'utc') + interval '3 hours')::date;    -- يوم الرياض (UTC+3)
  v_new  integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- زيادة ذرّية مشروطة: يُدرَج 1 أوّل اليوم، ثم يُزاد **فقط إن كان دون السقف**.
  -- عند بلوغ السقف: شرط DO UPDATE يفشل ⇒ لا صفّ يُرجَع ⇒ v_new = null.
  insert into public.ai_usage (user_id, usage_day, used_count, updated_at)
  values (v_uid, v_day, 1, now())
  on conflict (user_id, usage_day) do update
    set used_count = ai_usage.used_count + 1, updated_at = now()
    where ai_usage.used_count < v_cap
  returning ai_usage.used_count into v_new;

  if v_new is null then
    select ai_usage.used_count into v_new from public.ai_usage
      where ai_usage.user_id = v_uid and ai_usage.usage_day = v_day;
    return query select false, coalesce(v_new, v_cap), v_cap;
  else
    return query select true, v_new, v_cap;
  end if;
end $$;

-- 3ج) دالّة الحالة — قراءة غير مستهلِكة (بلا زيادة): للواجهة لعرض الرصيد عند الفتح («N من cap»).
--     بلا معاملات (auth.uid داخلياً)، تمسّ ai_usage قراءةً وحدها، السقف من المصدر الواحد.
create or replace function public.ai_usage_status()
returns table(used integer, cap integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_day  date := ((now() at time zone 'utc') + interval '3 hours')::date;
  v_used integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select used_count into v_used from public.ai_usage where user_id = v_uid and usage_day = v_day;
  return query select coalesce(v_used, 0), public.ai_daily_cap();
end $$;

-- 4) الصلاحيات — revoke من public أوّلاً (المنح يضيف ولا يمنع)، ثم منح صريح لـ authenticated
revoke execute on function public.ai_usage_bump()   from public;   -- 🚨 لا تنفيذ افتراضيّ من PUBLIC
revoke execute on function public.ai_usage_status() from public;
grant  select   on public.ai_usage                  to authenticated;
grant  execute  on function public.ai_usage_bump()   to authenticated;
grant  execute  on function public.ai_usage_status() to authenticated;

commit;

-- ============================================================================
-- تحقّق (بعد التنفيذ):
--   select count(*) from public.ai_usage;                 -- 0
--   select * from public.ai_usage_bump();                 -- أوّل نداء: allowed=t, used=1, cap=20
--   -- كرّر حتى used=20 ثم النداء التالي: allowed=f, used=20 (لا يتجاوز)
--   insert into public.ai_usage(user_id, usage_day, used_count) values (auth.uid(), current_date, 999);  -- يُرفض بـRLS
--   -- قراءة عدّاد غيرك تعيد 0 صفّ (select own فقط).
-- ============================================================================

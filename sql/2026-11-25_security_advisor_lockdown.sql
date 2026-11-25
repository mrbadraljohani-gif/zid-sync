-- ============================================================================
-- إغلاق ثغرات Supabase Security Advisor — 25 نوفمبر 2026
-- مشروع: pfbcyxciqrttukayskkg
-- ----------------------------------------------------------------------------
-- 🚨 هذا الملف أرشيفٌ لما نُفِّذ فعلاً في القاعدة (قاعدة المشروع: كل تعديل
--     صلاحية حيّ يُطابَق في الريبو فوراً، وإلا أعاد تشغيلُ ملفٍّ قديمٍ يوماً
--     سياسةً سبق إغلاقها). 🚫 لا تُعِد تشغيل أي ملف SQL قديم.
--
-- ما أُصلح:
--   • منع anon تماماً من العرضين (user_directory · sales_stock) ومن الدوال
--     الحساسة (audit_recent · get_my_role · log_role_change · rls_auto_enable).
--   • تثبيت search_path للدوال (يعالج Function Search Path Mutable).
--   • استبدال العرض user_directory بدالّة user_directory_list() — لأنّ لينت
--     auth_users_exposed يفحص الصلاحية لا المحتوى، فيبقى مشتعلاً ما دام
--     authenticated يقرأ عرضاً يلمس auth.users ولو كان فيه حارس دور.
--
-- ما تُرك عمداً (قرار موثّق):
--   • sales_stock يبقى security_invoker=false (SECURITY DEFINER) بحارس داخليّ
--     get_my_role() in ('owner','marketing') + cost_price بـCASE. قلبه إلى
--     security_invoker=on يُخضعه لـRLS الجداول المصدر، وهذا بالضبط ما أنتج
--     ثلاث علل «حجب صامت» في 24-26 سبتمبر. لذلك خطأ «Security Definer View ←
--     sales_stock» يبقى في اللينتر بقرار. نصيبه من الإصلاح: revoke from anon فقط.
--
-- التحذيرات الأربعة المقصودة الباقية بعد الإغلاق (Signed-In Can Execute —
-- ضروريّة للتطبيق بعد الدخول، لا تُلغى):
--   get_my_role() · audit_recent(...) · ai_usage_bump() · ai_usage_status()
--
-- المتوقَّع في Security Advisor بعد التنفيذ ＋ تفعيل Leaked Password Protection:
--   الأخطاء 3 ← 1 (يبقى Security Definer View ← sales_stock — مقصود)
--   التحذيرات 13 ← 4 (الأربعة أعلاه — مقصودة)
-- ============================================================================


-- ════════════════════════ سكربت A (نُفِّذ · مُتحقَّق منه) ════════════════════════
begin;
revoke all on public.user_directory from anon;
revoke all on public.sales_stock    from anon;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig, p.proname
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public'
             and p.proname in ('audit_recent','get_my_role','log_role_change','rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public',        r.sig);
    execute format('revoke execute on function %s from anon',          r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
    -- يحتاجها التطبيق بعد تسجيل الدخول فقط
    if r.proname in ('get_my_role','audit_recent') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname in ('set_updated_at','ai_daily_cap')
  loop execute format('alter function %s set search_path = public, pg_temp', r.sig); end loop;
end $$;
commit;


-- ════════════════════════ سكربت A2 (نُفِّذ) ════════════════════════
begin;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public'
             and p.proname in ('set_updated_at','log_role_change','rls_auto_enable')
  loop execute format('revoke execute on function %s from public, anon, authenticated', r.sig); end loop;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public'
             and p.proname in ('get_my_role','audit_recent','log_role_change',
                               'ai_usage_bump','ai_usage_status')
  loop execute format('alter function %s set search_path = public, pg_temp', r.sig); end loop;
end $$;
commit;


-- ════════════════════════ سكربت B1 (نُفِّذ) — دالّة بدل العرض ════════════════════════
-- user_directory_list(): نفس أعمدة العرض بالضبط (id uuid · email text · role text)
-- security definer (authenticated لا يقرأ auth.users) · حارس داخليّ get_my_role()='owner'
-- (غير المالك ⇒ WHERE false ⇒ صفر صفّ بلا خطأ). revoke public/anon · grant authenticated.
-- 🔎 تحقّق أنّ هذا يطابق الحيّ: select pg_get_functiondef('public.user_directory_list()'::regprocedure);
create or replace function public.user_directory_list()
  returns table (id uuid, email text, role text)
  language sql
  security definer
  set search_path = public, pg_temp
  stable
as $$
  select u.id, u.email::text, r.role
  from auth.users u
  left join public.user_roles r on r.user_id = u.id
  where public.get_my_role() = 'owner';
$$;

revoke execute on function public.user_directory_list() from public, anon;
grant  execute on function public.user_directory_list() to authenticated;


-- ════════════════════════ سكربت B2 — يُنفَّذ بعد نشر دفعة التطبيق ① ════════════════════════
-- 🚨 لا تُنفِّذه إلا بعد نشر commit تحويل index.html إلى rpc('user_directory_list')
--    ونجاح اختبار القبول من المتصفح (owner يرى الصفوف). قبل ذلك يبقى العرض
--    حتى لا تنكسر شاشة التدقيق على الأجهزة التي لم تُحدِّث بعد.
--    (ينفّذه بدر بنفسه بعد التحقق.)
-- drop view public.user_directory;


-- ════════════════════════ استعلامات التحقّق (قراءة فقط) ════════════════════════
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        has_function_privilege('anon',          p.oid,'EXECUTE') as anon_exec,
--        has_function_privilege('authenticated', p.oid,'EXECUTE') as auth_exec
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public'
--   and p.proname in ('audit_recent','get_my_role','log_role_change','rls_auto_enable',
--                     'ai_usage_bump','ai_usage_status','set_updated_at','ai_daily_cap',
--                     'user_directory_list')
-- order by 1;
--
-- select c.relname,
--        has_table_privilege('anon',          c.oid,'SELECT') as anon_read,
--        has_table_privilege('authenticated', c.oid,'SELECT') as auth_read
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname='public' and c.relname in ('user_directory','sales_stock');
--
-- المتوقَّع: anon_exec=false للأربع · anon_read=false للعرضين ·
--            auth_exec=true لـget_my_role/audit_recent/ai_usage_* ·
--            auth_exec=false لـlog_role_change/rls_auto_enable/set_updated_at ·
--            user_directory_list: anon_exec=false · auth_exec=true.

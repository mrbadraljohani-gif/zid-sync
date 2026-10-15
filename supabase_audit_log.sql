-- ============================================================================
-- ASJ / zid-sync — سجلّ تدقيق سلوكيّ (owner فقط) · توسيع activity_log (مصدر واحد)
-- 🚫 لا جدول جديد · القراءة المشتركة للجدول تبقى (لوحة الإشعارات/حركة الصنف لـadmin/marketing)
-- التدقيق أونر-فقط عبر get_my_role() داخل الدالّة/العرض — لا بتضييق select الجدول.
-- نفّذ كاملاً مرّة واحدة في Supabase → SQL Editor. آمن لإعادة التنفيذ.
-- (يُنفَّذ بعد supabase_user_roles.sql — يعتمد get_my_role())
-- ============================================================================

-- (1) فهرس «آخر N لكل مستخدم»
create index if not exists activity_log_by_user_idx
  on public.activity_log (created_by, created_at desc);

-- (2) تحصين الكتابة/العبث (select يبقى authenticated — لا يُكسر القرّاء: الإشعارات/حركة الصنف)
--     created_by = auth.uid() حصراً: لا حدث بلا فاعل، ولا تزوير null/فاعل آخر (الـdefault auth.uid() يملأ العمود المحذوف).
drop policy if exists activity_insert_auth on public.activity_log;
create policy activity_insert_auth on public.activity_log for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists activity_update_auth on public.activity_log;
create policy activity_update_owner on public.activity_log for update to authenticated
  using (public.get_my_role() = 'owner') with check (public.get_my_role() = 'owner');
drop policy if exists activity_delete_auth on public.activity_log;
create policy activity_delete_owner on public.activity_log for delete to authenticated
  using (public.get_my_role() = 'owner');

-- (3) دليل المستخدمين (owner فقط): id · email · role لا غير — لفلتر الأسماء وترجمة created_by→بريد
create or replace view public.user_directory with (security_invoker = false) as
  select u.id, u.email, r.role
  from auth.users u left join public.user_roles r on r.user_id = u.id
  where public.get_my_role() = 'owner';
grant select on public.user_directory to authenticated;

-- (4) دالّة التدقيق (owner فقط): «آخر p_limit لكل مستخدم» ＋ فلتر تاريخ (p_since) ＋ فلتر مستخدم (p_user)
--     غير-owner ⇒ get_my_role()<>'owner' ⇒ WHERE false ⇒ 0 صفّ (العزل في القاعدة لا الواجهة).
--     الأنواع المُصفّاة = أحداث التدقيق فقط (لا تحوّلات run() الآليّة qty_zeroed/price_changed…).
create or replace function public.audit_recent(
  p_user uuid default null, p_since timestamptz default null, p_limit int default 100)
  returns table (id bigint, event_type text, details jsonb, created_at timestamptz,
                 created_by uuid, actor_email text, actor_role text)
  language sql security definer set search_path = public stable as $$
  with base as (
    select a.id, a.event_type, a.details, a.created_at, a.created_by,
           u.email as actor_email, r.role as actor_role,
           row_number() over (partition by a.created_by order by a.created_at desc) as rn
    from public.activity_log a
    left join auth.users u on u.id = a.created_by
    left join public.user_roles r on r.user_id = a.created_by
    where public.get_my_role() = 'owner'
      and a.event_type in ('login','logout','search','role_change',
        'warehouse_sync_full','branch_sync_full','sync_full','xbranch_sync_full',
        'link_added','link_removed','file_generated')
      and (p_user  is null or a.created_by = p_user)
      and (p_since is null or a.created_at >= p_since)
  )
  select id, event_type, details, created_at, created_by, actor_email, actor_role
  from base where rn <= greatest(1, least(p_limit, 500))
  order by created_at desc;
$$;
grant execute on function public.audit_recent(uuid, timestamptz, int) to authenticated;

-- (5) تسجيل تغيير الصلاحية في القاعدة (لا يُتجاوَز بالواجهة) — الفاعل auth.uid() حتى داخل definer
--     عند أوّل تعيين OLD فارغ ⇒ old=null (سليم؛ الواجهة تعرضه «—»).
create or replace function public.log_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log(event_type, zid_sku, details, created_by)
  values ('role_change', null,
    jsonb_build_object('target', coalesce(new.user_id, old.user_id)::text,
      'old', old.role, 'new', new.role, 'op', tg_op), auth.uid());
  return coalesce(new, old);
end $$;
drop trigger if exists trg_log_role_change on public.user_roles;
create trigger trg_log_role_change after insert or update or delete on public.user_roles
  for each row execute function public.log_role_change();

-- تحقّق (بحساب owner): select count(*) from audit_recent();  ·  select * from user_directory;
-- بحساب admin: الاثنان ⇒ 0 صفّ (العزل القاعديّ).

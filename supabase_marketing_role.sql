-- ============================================================================
-- ASJ / zid-sync — دور «marketing» + عزل شاشة عرض المبيعات في القاعدة (RLS)
--
-- ⚠ نفّذ **بعد** supabase_user_roles.sql · supabase_sales_movements.sql · supabase_sales_suspect.sql.
-- نفّذه مرّة واحدة. idempotent. معاملة واحدة (الكل-أو-لا-شيء).
--
-- المصفوفة:
--   owner      → كل شيء (كما هو).
--   admin      → كل شيء كما هو اليوم ＋ يكتب جدولَي المبيعات ولا يقرؤهما · لا يرى شاشة المبيعات.
--   marketing  → يقرأ sales_movements/sales_uploads/sales_stock فقط · لا يصل أي جدول آخر.
--   viewer     → كما هو.
--
-- 🚨 لا تُعدَّل أيّ سياسة admin قائمة: عزل marketing يتمّ بسياسات **restrictive** إضافية (تُدمَج AND)
--    فتمنع marketing وحده، وتُبقي owner/admin/viewer/بلا-دور كما هم تماماً.
-- ⚠ قبل التشغيل: تحقّق أن كل القيم الحالية ضمن {owner,admin,viewer}:
--      select role, count(*) from public.user_roles group by role;
--      select conname from pg_constraint where conrelid='public.user_roles'::regclass and contype='c';
--    (إن خالف اسم القيد user_roles_role_check، عدّل سطر الإسقاط أدناه.)
-- ============================================================================
begin;

-- (1) توسيع قيد الدور ليقبل 'marketing' (القيم الحالية {owner,admin,viewer} كلّها تمرّ بالقيد الجديد — مجموعة أوسع)
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add  constraint user_roles_role_check
  check (role in ('owner','admin','viewer','marketing'));

-- (2) جدولا المبيعات: القراءة owner+marketing (admin يُرفض قراءةً) · الإدراج owner+admin (admin يكتب عند الرفع) · التعديل/الحذف owner
do $$
declare t text;
begin
  foreach t in array array['sales_uploads','sales_movements'] loop
    execute format('drop policy if exists %I_select_auth on public.%I', t, t);   -- كان using(true)
    execute format('drop policy if exists %I_select_ro   on public.%I', t, t);
    execute format('drop policy if exists %I_insert_wr   on public.%I', t, t);
    execute format('drop policy if exists %I_update_wr   on public.%I', t, t);
    execute format('drop policy if exists %I_delete_wr   on public.%I', t, t);
    execute format('drop policy if exists %I_update_ow   on public.%I', t, t);
    execute format('drop policy if exists %I_delete_ow   on public.%I', t, t);
    execute format('create policy %I_select_ro on public.%I for select to authenticated using (public.get_my_role() in (''owner'',''marketing''))', t, t);
    execute format('create policy %I_insert_wr on public.%I for insert to authenticated with check (public.get_my_role() in (''owner'',''admin''))', t, t);
    execute format('create policy %I_update_ow on public.%I for update to authenticated using (public.get_my_role() = ''owner'') with check (public.get_my_role() = ''owner'')', t, t);
    execute format('create policy %I_delete_ow on public.%I for delete to authenticated using (public.get_my_role() = ''owner'')', t, t);
  end loop;
end $$;

-- (3) عرض المخزون المُصغّر لشاشة المبيعات (القيمة والراكد) — يكشف الحدّ الأدنى فقط، ويُرشّح بالدور.
--     security_invoker=false ⇒ يقرأ الجداول الأساس بصلاحية **مالك العرض** (يتجاوز RLS الأساس)،
--     والـWHERE يعمل بدور **المُستدعي** (get_my_role عبر auth.uid()) ⇒ لا يمكن تجاوزه، وadmin يرى 0 صفّ.
drop view if exists public.sales_stock;
create view public.sales_stock
with (security_invoker = false) as
  select s.location, s.sku, s.name, s.qty, s.price_incl from (
    select 'wh'::text as location, code as sku, name, qty, price_incl from public.warehouse_items
    union all
    select branch_id::text as location, code as sku, name, qty, price_incl from public.branch_items
  ) s
  where public.get_my_role() in ('owner','marketing');
revoke all on public.sales_stock from authenticated, anon;
grant select on public.sales_stock to authenticated;

-- (4) عزل marketing عن كل جدول آخر: سياسة **restrictive** للقراءة تُدمَج AND مع القائمة (لا تلمس أيّ سياسة قائمة).
--     get_my_role() is distinct from 'marketing' ⇒ يمرّ الجميع (بمن فيهم بلا-دور=null) إلّا marketing.
--     get_my_role دالّة security definer فتعمل حتى على user_roles بلا recursion.
do $$
declare t text;
begin
  foreach t in array array[
    'warehouse_items','branch_items','inventory_sync_meta','branches',
    'mappings','waiting_items','zid_products','zid_sync_meta','activity_log',
    'aliases','matched_history','price_offsets','positional_exceptions',
    'excluded_skus','excluded_rules','ignored_items','user_roles'
  ] loop
    execute format('drop policy if exists %I_nomkt_sel on public.%I', t, t);
    execute format('create policy %I_nomkt_sel on public.%I as restrictive for select to authenticated using (public.get_my_role() is distinct from ''marketing'')', t, t);
  end loop;
end $$;

commit;

-- ============================================================================
-- التحقّق (بعد التنفيذ):
--   -- القيد يحوي marketing:
--   select pg_get_constraintdef(oid) from pg_constraint where conname='user_roles_role_check';
--
--   -- بحساب admin (سجّل دخوله):  القراءة تعيد 0 صفّ (RLS يُصفّي، لا خطأ)، والمخزون كما هو، والإدراج مسموح
--     select count(*) from public.sales_movements;   -- 0
--     select count(*) from public.sales_uploads;     -- 0
--     select count(*) from public.sales_stock;       -- 0
--     select count(*) from public.warehouse_items;   -- >0 (admin يقرأ المخزون كما اليوم — لم يتغيّر)
--
--   -- بحساب marketing:  يقرأ المبيعات والعرض · لا يقرأ أي جدول آخر (0 صفّ) · لا يكتب
--     select count(*) from public.sales_movements;   -- >0
--     select count(*) from public.sales_stock;       -- >0
--     select count(*) from public.warehouse_items;   -- 0  ✅ (restrictive يمنعه)
--     select count(*) from public.zid_products;      -- 0  ✅
--     insert into public.sales_uploads (location, captured_at) values ('wh', now());  -- يُرفض (insert owner+admin)
-- ============================================================================

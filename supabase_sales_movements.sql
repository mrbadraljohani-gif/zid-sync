-- ============================================================================
-- ASJ / zid-sync — لوحة المبيعات المقدّرة: رؤوس الرفعات (sales_uploads) + سجلّ الحركات (sales_movements)
--
-- ⚠ نفّذ **بعد** supabase_user_roles.sql (يعتمد الدالة get_my_role()).
-- ⚠ نفّذه مرة واحدة. آمن لإعادة التنفيذ (idempotent).
--
-- الغرض: مقارنة رفعة اليوم برفعة أمس لنفس الموقع (المستودع/فرع) لتقدير المبيعات.
--   نقص الكمية ⇒ «بيع مقدّر» (estimated_sale) · زيادة ⇒ شراء · كود جديد ⇒ new · اختفى ⇒ disappeared.
--   السعر يُثبَّت لحظة الحركة (يُستبدَل في المخزون كل رفعة، فلا يُقرأ لاحقاً). دلتا الصفر لا تُدرَج إطلاقاً.
--
-- 🚨 عزل تامّ: لا علاقة بـ zid_products / mappings / matched_history / waiting_items / excluded_* /
--   positional_exceptions. لوحة المبيعات تقرأ جداول المخزون وحدها (warehouse_items · branch_items ·
--   branches · هذين الجدولين). حذف اللوحة لا يمسّ المطابقة ولا التصدير.
--
-- (نفس نمط الجداول الخمسة السابقة: unique/FK · RLS + grants · trigger · begin/commit)
-- ============================================================================
begin;

-- 1) رؤوس الرفعات — هوية رفعة (upload_id) لم تكن موجودة في المشروع قبلها
create table if not exists public.sales_uploads (
  id           uuid primary key default gen_random_uuid(),
  location     text not null,                       -- 'wh' أو branches.id نصّاً (لا FK ليقبل قيمة 'wh')
  captured_at  timestamptz not null,                -- وقت الرفعة (أو تاريخ الأرشيف اليدويّ لاحقاً)
  file_name    text,
  item_count   integer,
  source       text not null default 'sync' check (source in ('sync','archive')),
  note         text,                                -- «كودان متشابهان» / «اختفاء شاذّ: تُخطّي التسجيل» / يدويّ
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sales_uploads_loc_cap_idx on public.sales_uploads (location, captured_at desc);

-- 2) سجلّ الحركات — سجلّ تاريخيّ لا يُعدَّل (لا updated_at). السعر مثبَّت. دلتا الصفر ممنوعة (طبقة ثانية فوق الكود).
create table if not exists public.sales_movements (
  id              bigint generated always as identity primary key,
  upload_id       uuid not null references public.sales_uploads(id) on delete cascade,
  sku             text not null,                    -- الكود كما في المخزون (بلا normCode — الأكواد نظيفة ومتّسقة)
  sku_name        text,                             -- اسم الصنف لحظة الحركة (الأسماء تتغيّر مع الوقت)
  location        text not null,                    -- 'wh' أو branches.id
  captured_at     timestamptz not null,
  period_start    timestamptz,                      -- captured_at للرفعة السابقة لنفس (location,sku)؛ null لأوّل ظهور
  period_days     numeric,                          -- (captured_at - period_start) بالأيام؛ null لأوّل ظهور
  qty_before      numeric,                          -- null = لم يكن موجوداً (new)
  qty_after       numeric,                          -- null = اختفى من الملف (disappeared)
  delta           numeric not null check (delta <> 0),   -- after-before (اختفى ⇒ -before). طبقة ثانية فوق تخطّي الصفر في الكود
  kind            text not null check (kind in ('estimated_sale','purchase','new','disappeared')),
  unit_price_incl numeric,                          -- مثبَّت من الرفعة (بعد الضريبة)
  unit_price_excl numeric,                          -- مثبَّت من الرفعة (قبل الضريبة)
  price_source    text,                             -- 'incl' / 'excl' / 'none'
  value_est       numeric,                          -- |delta المبيع| × السعر؛ null بلا سعر (لا صفر صامت)
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists sales_mov_loc_cap_idx on public.sales_movements (location, captured_at desc);
create index if not exists sales_mov_sku_idx      on public.sales_movements (sku, location, captured_at desc);
create index if not exists sales_mov_kind_idx     on public.sales_movements (kind);
create index if not exists sales_mov_upload_idx   on public.sales_movements (upload_id);

-- 3) updated_at لرؤوس الرفعات فقط (تعيد استخدام set_updated_at من الملفات السابقة). الحركات لا تُعدَّل.
drop trigger if exists sales_uploads_set_updated_at on public.sales_uploads;
create trigger sales_uploads_set_updated_at before update on public.sales_uploads
  for each row execute function public.set_updated_at();

-- 4) RLS — القراءة لكل موثّق · الكتابة لـ owner + admin (get_my_role من ملف الأدوار)
alter table public.sales_uploads   enable row level security;
alter table public.sales_movements enable row level security;
do $$
declare t text;
begin
  foreach t in array array['sales_uploads','sales_movements'] loop
    execute format('drop policy if exists %I_select_auth on public.%I', t, t);
    execute format('drop policy if exists %I_insert_wr  on public.%I', t, t);
    execute format('drop policy if exists %I_update_wr  on public.%I', t, t);
    execute format('drop policy if exists %I_delete_wr  on public.%I', t, t);
    execute format('create policy %I_select_auth on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert_wr on public.%I for insert to authenticated with check (public.get_my_role() in (''owner'',''admin''))', t, t);
    execute format('create policy %I_update_wr on public.%I for update to authenticated using (public.get_my_role() in (''owner'',''admin'')) with check (public.get_my_role() in (''owner'',''admin''))', t, t);
    execute format('create policy %I_delete_wr on public.%I for delete to authenticated using (public.get_my_role() in (''owner'',''admin''))', t, t);
  end loop;
end $$;

-- 5) grants صريحة — لا شيء لـ anon
grant select, insert, update, delete on public.sales_uploads   to authenticated;
grant select, insert, update, delete on public.sales_movements to authenticated;
grant usage, select on sequence public.sales_movements_id_seq to authenticated;

commit;

-- ============================================================================
-- تحقّق (شغّله بعد الهجرة):
--   select count(*) from public.sales_uploads;     -- == 0
--   select count(*) from public.sales_movements;   -- == 0
-- ============================================================================

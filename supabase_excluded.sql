-- ============================================================================
-- ASJ / zid-sync — استبعاد منتجات من المطابقة (excluded_skus + excluded_rules)
--   منتجات لا تدخل المطابقة إطلاقاً (عروض مركّبة بلا باركود في المخزن): لا تُطابَق ولا تُصنَّف
--   ولا تُصدَّر ولا تُعدّ — كأنها غير موجودة في تصدير زد. تبقى في zid_products (فلتر وقت تشغيل، لا حذف).
--   • excluded_skus  : استبعاد فرديّ (SKU بعينه).
--   • excluded_rules : قواعد بادئة (أيّ SKU يبدأ بـprefix يُستبعد — يسري على الجديد تلقائياً).
--
-- ⚠ نفّذه **بعد** supabase_user_roles.sql (يعتمد get_my_role())، مرّة واحدة، في Supabase → SQL Editor.
-- ⚠ آمن لإعادة التنفيذ (idempotent). نمط RLS/trigger/grants = matched_history حرفياً.
-- ============================================================================
begin;

-- 1) استبعاد فرديّ: sku الخام كما في التصدير (لا normCode — يطابق ما يراه المستخدم)
create table if not exists public.excluded_skus (
  id          bigint generated always as identity primary key,
  sku         text not null unique,
  note        text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) قواعد البادئة: prefix مُخزَّن uppercase (المطابقة غير حسّاسة للحالة · بادئة فقط)
create table if not exists public.excluded_rules (
  id          bigint generated always as identity primary key,
  prefix      text not null unique,
  note        text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- قيد الطول: بادئة ≥ حرفين بعد trim — يمنع الفارغة/المسافات/الحرف الواحد (طبقة أقوى من المعاينة)
-- بصيغة idempotent تعمل ولو كان الجدول موجوداً سلفاً (drop ثمّ add)
alter table public.excluded_rules drop constraint if exists excluded_rules_prefix_len;
alter table public.excluded_rules add  constraint excluded_rules_prefix_len check (length(trim(prefix)) >= 2);

-- 3) updated_at تلقائياً (تعيد استخدام set_updated_at من الملفات السابقة)
drop trigger if exists excluded_skus_set_updated_at on public.excluded_skus;
create trigger excluded_skus_set_updated_at before update on public.excluded_skus
  for each row execute function public.set_updated_at();
drop trigger if exists excluded_rules_set_updated_at on public.excluded_rules;
create trigger excluded_rules_set_updated_at before update on public.excluded_rules
  for each row execute function public.set_updated_at();

-- 4) RLS: قراءة لكل موثّق · كتابة owner+admin (نمط matched_history — صريح لكل جدول)
alter table public.excluded_skus enable row level security;
drop policy if exists excluded_skus_select_auth on public.excluded_skus;
drop policy if exists excluded_skus_insert_auth on public.excluded_skus;
drop policy if exists excluded_skus_update_auth on public.excluded_skus;
drop policy if exists excluded_skus_delete_auth on public.excluded_skus;
create policy excluded_skus_select_auth on public.excluded_skus for select to authenticated using (true);
create policy excluded_skus_insert_auth on public.excluded_skus for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy excluded_skus_update_auth on public.excluded_skus for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy excluded_skus_delete_auth on public.excluded_skus for delete to authenticated using (public.get_my_role() in ('owner','admin'));

alter table public.excluded_rules enable row level security;
drop policy if exists excluded_rules_select_auth on public.excluded_rules;
drop policy if exists excluded_rules_insert_auth on public.excluded_rules;
drop policy if exists excluded_rules_update_auth on public.excluded_rules;
drop policy if exists excluded_rules_delete_auth on public.excluded_rules;
create policy excluded_rules_select_auth on public.excluded_rules for select to authenticated using (true);
create policy excluded_rules_insert_auth on public.excluded_rules for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy excluded_rules_update_auth on public.excluded_rules for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy excluded_rules_delete_auth on public.excluded_rules for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- 5) grants
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.excluded_skus  to authenticated;
grant select, insert, update, delete on public.excluded_rules to authenticated;
grant usage, select on sequence public.excluded_skus_id_seq  to authenticated;
grant usage, select on sequence public.excluded_rules_id_seq to authenticated;

commit;

-- ============================================================================
-- استعلامات التحقّق (بعد التنفيذ):
--   select count(*) from public.excluded_skus;    -- == 0
--   select count(*) from public.excluded_rules;   -- == 0
--   select tablename from pg_tables where tablename in ('excluded_skus','excluded_rules');  -- صفّان
-- ============================================================================

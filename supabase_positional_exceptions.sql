-- ============================================================================
-- ASJ / zid-sync — استثناءات النسب الموضعيّ (positional_exceptions)
--   SKU زد أخطأ ترتيبُ تصدير زد فجعله «ابناً موضعيّاً» لأبٍ ليس أباه (اسم/مقاس مختلف)،
--   فورث كودَ الأب في المطابقة (resolveWhCode الباب ٤). إضافته هنا ⇒ يُحذف من parentOf
--   ⇒ يصير منتجاً مستقلاً ⇒ يسقط إلى «يحتاج ربط» ليُربَط يدوياً بالكود الصحيح.
--   ≠ الاستبعاد (excluded_*): ذاك يُخفي الصنف كليّاً؛ هذا يُبقيه للمطابقة اليدوية.
--
-- ⚠ نفّذه **بعد** supabase_user_roles.sql (يعتمد get_my_role())، مرّة واحدة، في Supabase → SQL Editor.
-- ⚠ آمن لإعادة التنفيذ (idempotent). نمط RLS/trigger/grants = matched_history حرفياً.
-- ============================================================================
begin;

-- الجدول (sku الخام كما في التصدير — يطابق مفتاح parentOf)
create table if not exists public.positional_exceptions (
  id          bigint generated always as identity primary key,
  sku         text not null unique,
  note        text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at تلقائياً
drop trigger if exists positional_exceptions_set_updated_at on public.positional_exceptions;
create trigger positional_exceptions_set_updated_at before update on public.positional_exceptions
  for each row execute function public.set_updated_at();

-- RLS: قراءة لكل موثّق · كتابة owner+admin
alter table public.positional_exceptions enable row level security;
drop policy if exists positional_exceptions_select_auth on public.positional_exceptions;
drop policy if exists positional_exceptions_insert_auth on public.positional_exceptions;
drop policy if exists positional_exceptions_update_auth on public.positional_exceptions;
drop policy if exists positional_exceptions_delete_auth on public.positional_exceptions;
create policy positional_exceptions_select_auth on public.positional_exceptions for select to authenticated using (true);
create policy positional_exceptions_insert_auth on public.positional_exceptions for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy positional_exceptions_update_auth on public.positional_exceptions for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy positional_exceptions_delete_auth on public.positional_exceptions for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- grants
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.positional_exceptions to authenticated;
grant usage, select on sequence public.positional_exceptions_id_seq to authenticated;

commit;

-- ============================================================================
-- تحقّق (بعد التنفيذ):
--   select count(*) from public.positional_exceptions;                                  -- == 0
--   select tablename from pg_tables where tablename = 'positional_exceptions';           -- موجود
--   -- بعد إضافة التسعة من زرّ «فكّ نسب الأب»:
--   select sku from public.positional_exceptions order by sku;                           -- التسعة
-- ============================================================================

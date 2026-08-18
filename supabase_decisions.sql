-- ============================================================================
-- ASJ / zid-sync — الدفعة (أ): نقل قرارات المستخدم إلى القاعدة مصدراً وحيداً
--   · public.ignored_items   — الأصناف المتجاهَلة (كانت ignored.json + localStorage)
--   · public.aliases         — أزواج «جذر زد|||جذر مستودع» المتعلَّمة (كانت aliases.json)
--   · ALTER waiting_items     — أعمدة kind / missed_rounds / last_seen_at
-- نفّذ هذا كاملاً **بعد** supabase_user_roles.sql (يعتمد get_my_role())، مرة واحدة.
-- آمن لإعادة التنفيذ. نفس نمط الجداول السابقة (RLS: قراءة كل موثّق · كتابة owner+admin).
-- ملاحظة: link-tags.json أُسقط — الوسم يُشتقّ من mappings.source (لا جدول له).
-- ============================================================================

-- تعيد استخدام public.set_updated_at() المعرّفة في الملفات السابقة (waiting/phase1)
-- إن لم تكن منفّذة بعد، أنشئها:
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 1) ignored_items
-- ============================================================================
create table if not exists public.ignored_items (
  id          bigint generated always as identity primary key,
  zid_sku     text not null unique,
  name        text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists ignored_items_set_updated_at on public.ignored_items;
create trigger ignored_items_set_updated_at
  before update on public.ignored_items
  for each row execute function public.set_updated_at();

alter table public.ignored_items enable row level security;

drop policy if exists ignored_select_auth on public.ignored_items;
drop policy if exists ignored_insert_auth on public.ignored_items;
drop policy if exists ignored_update_auth on public.ignored_items;
drop policy if exists ignored_delete_auth on public.ignored_items;

create policy ignored_select_auth on public.ignored_items
  for select to authenticated using (true);
create policy ignored_insert_auth on public.ignored_items
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy ignored_update_auth on public.ignored_items
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy ignored_delete_auth on public.ignored_items
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.ignored_items to authenticated;
grant usage, select on sequence public.ignored_items_id_seq to authenticated;

-- ============================================================================
-- 2) aliases  (المفتاح = السلسلة «جذر زد|||جذر مستودع» كما في batchAliases)
-- ============================================================================
create table if not exists public.aliases (
  id          bigint generated always as identity primary key,
  pair        text not null unique,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists aliases_set_updated_at on public.aliases;
create trigger aliases_set_updated_at
  before update on public.aliases
  for each row execute function public.set_updated_at();

alter table public.aliases enable row level security;

drop policy if exists aliases_select_auth on public.aliases;
drop policy if exists aliases_insert_auth on public.aliases;
drop policy if exists aliases_update_auth on public.aliases;
drop policy if exists aliases_delete_auth on public.aliases;

create policy aliases_select_auth on public.aliases
  for select to authenticated using (true);
create policy aliases_insert_auth on public.aliases
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy aliases_update_auth on public.aliases
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy aliases_delete_auth on public.aliases
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

grant select, insert, update, delete on public.aliases to authenticated;
grant usage, select on sequence public.aliases_id_seq to authenticated;

-- ============================================================================
-- 3) توسيع waiting_items — دمج «إلغاء النشر» مستقبلاً (kind) + خطة «الأصناف الميتة» (missed_rounds)
--    · kind          : 'wait' (يعود عند التوفّر) — لاحقاً 'unpublish' (دائم) في الدفعة (ج)
--    · missed_rounds : يزيد عند كل رفع مخزن يظلّ الصنف فيه غائباً — يُصفَّر عند التوفّر
--    · last_seen_at  : آخر ظهور للكود في ملف المخزن
-- ============================================================================
alter table public.waiting_items add column if not exists kind          text not null default 'wait';
alter table public.waiting_items add column if not exists missed_rounds int  not null default 0;
alter table public.waiting_items add column if not exists last_seen_at   timestamptz;

create index if not exists waiting_items_missed_rounds_idx on public.waiting_items (missed_rounds desc);
create index if not exists waiting_items_kind_idx on public.waiting_items (kind);

-- تحقق سريع (اختياري):
--   select * from public.ignored_items;
--   select * from public.aliases;
--   select zid_sku, kind, missed_rounds, last_seen_at from public.waiting_items;

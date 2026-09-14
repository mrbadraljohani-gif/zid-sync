-- ============================================================================
-- ASJ / zid-sync — دفعة ١أ: الفروع المتعدّدة (جدول branches + branch_id في branch_items)
--
-- ⚠ نفّذ **بعد** supabase_user_roles.sql (يعتمد get_my_role()) و supabase_inventory.sql.
-- ⚠ 🚨 قبل التنفيذ: خُذ نسخة كاملة من branch_items (راجع أمر التصدير في المحادثة/أسفله).
-- ⚠ نفّذه مرة واحدة (محميّ بحُرّاس idempotent، لكن الأصل مرة).
-- المعرّف uuid مستقلّ — تعديل اسم الفرع لا يُيتّم صفوفه. FK on delete cascade ⇒ لا صفوف يتيمة.
-- ============================================================================

-- ⚠ الهجرة كلّها في معاملة واحدة (الكل-أو-لا-شيء): أي خطأ ⇒ تراجع كامل، لا هجرة جزئية.
begin;

-- 1) جدول الفروع (معرّف مستقلّ + اسم للعرض + ميتا لكل فرع)
create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  item_count  integer default 0,
  file_name   text,
  header      jsonb,
  synced_at   timestamptz,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists branches_created_idx on public.branches (created_at);

-- 2) الهجرة: عمود branch_id + ترحيل الحالي إلى «العزيزية» + المفتاح المركّب (branch_id, code) + FK cascade
do $$
declare v_id uuid;
begin
  alter table public.branch_items add column if not exists branch_id uuid;
  -- ترحيل الصفوف الحالية (إن وُجدت غير مُرحّلة) إلى فرع افتراضي «العزيزية»
  if exists (select 1 from public.branch_items where branch_id is null) then
    v_id := gen_random_uuid();
    insert into public.branches (id, name) values (v_id, 'العزيزية');
    update public.branch_items set branch_id = v_id where branch_id is null;
    update public.branches set item_count = (select count(*) from public.branch_items where branch_id = v_id) where id = v_id;
  end if;
  alter table public.branch_items alter column branch_id set not null;
  -- استبدال المفتاح الفريد: من (code) إلى (branch_id, code) — نفس الكود يوجد في عدّة فروع
  alter table public.branch_items drop constraint if exists branch_items_code_key;
  if not exists (select 1 from pg_constraint where conname = 'branch_items_branch_code_key') then
    alter table public.branch_items add constraint branch_items_branch_code_key unique (branch_id, code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'branch_items_branch_fk') then
    alter table public.branch_items add constraint branch_items_branch_fk
      foreign key (branch_id) references public.branches(id) on delete cascade;
  end if;
end $$;
create index if not exists branch_items_branch_idx on public.branch_items (branch_id);

-- 3) updated_at تلقائياً (تعيد استخدام set_updated_at من الملفات السابقة)
drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at before update on public.branches for each row execute function public.set_updated_at();

-- 4) RLS (نفس النمط: قراءة لكل موثّق · كتابة owner+admin)
alter table public.branches enable row level security;
do $$
declare t text := 'branches';
begin
  execute format('drop policy if exists %I_select_auth on public.%I', t, t);
  execute format('drop policy if exists %I_insert_wr  on public.%I', t, t);
  execute format('drop policy if exists %I_update_wr  on public.%I', t, t);
  execute format('drop policy if exists %I_delete_wr  on public.%I', t, t);
  execute format('create policy %I_select_auth on public.%I for select to authenticated using (true)', t, t);
  execute format('create policy %I_insert_wr on public.%I for insert to authenticated with check (public.get_my_role() in (''owner'',''admin''))', t, t);
  execute format('create policy %I_update_wr on public.%I for update to authenticated using (public.get_my_role() in (''owner'',''admin'')) with check (public.get_my_role() in (''owner'',''admin''))', t, t);
  execute format('create policy %I_delete_wr on public.%I for delete to authenticated using (public.get_my_role() in (''owner'',''admin''))', t, t);
end $$;

-- 5) grants
grant select, insert, update, delete on public.branches to authenticated;

commit;

-- ============================================================================
-- استعلامات التحقّق (شغّلها بعد الهجرة — قارنها بالعدّ قبلها):
--   select count(*) as after_count      from public.branch_items;                 -- == العدّ قبل الهجرة (صفر صفّ ضائع)
--   select count(*) as null_branch_id   from public.branch_items where branch_id is null;   -- == 0
--   select count(distinct branch_id) as branches_used from public.branch_items;   -- == 1 (كلّها في العزيزية)
--   select b.name, b.item_count, (select count(*) from public.branch_items bi where bi.branch_id = b.id) as actual
--     from public.branches b;                                                     -- item_count == actual للعزيزية
-- ============================================================================

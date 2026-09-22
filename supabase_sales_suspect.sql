begin;
alter table public.sales_uploads
  add column if not exists suspect boolean not null default false;   -- رفعة موسومة مشبوهة (اختفاء شاذّ) — تُستبعد من الإجماليّ افتراضياً حتى المراجعة
commit;

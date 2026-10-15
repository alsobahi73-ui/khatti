-- ============================================================================
-- مخطط قاعدة البيانات السحابية المجانية لتطبيق «خطّي» (Khatti Supabase Schema)
-- طريقة الاستخدام: انسخ هذا الكود والصقه في قسم (SQL Editor -> New Query) داخل
-- حسابك المجاني في Supabase ثم اضغط (Run) لإنشاء الجداول وتفعيل البث اللحظي.
-- ============================================================================

-- 1. جدول الخطوط السريعة (Lines)
create table if not exists public.khatti_lines (
  id text primary key,
  from_area text not null,
  to_dest text not null,
  driver_name text not null,
  phone text not null,
  vehicle text not null,
  plate text default '',
  comp text default 'mixed',
  price integer not null default 60000,
  seats integer not null default 14,
  free integer not null default 14,
  go_time text default '07:00',
  back_time text default '14:30',
  rating numeric(3,2) default 5.0,
  rc integer default 1,
  trusted boolean default true,
  pickups jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- 2. جدول التتبع اللحظي المباشر لحركة ومكان السائق والراكب (Live GPS Locations)
create table if not exists public.khatti_live_locations (
  id text primary key, -- مثال: 'l1_driver' أو 'l1_pax_st_1'
  line_id text not null,
  user_role text not null check (user_role in ('driver', 'passenger')),
  user_name text not null,
  lat double precision not null,
  lng double precision not null,
  speed integer default 0,
  updated_at timestamptz default now()
);

-- 3. جدول الحضور والغياب اليومي للطلاب (Daily Student Attendance)
create table if not exists public.khatti_attendance (
  student_id text primary key,
  line_id text not null,
  student_name text not null,
  stop_name text not null,
  parent_code text not null,
  status text not null default 'waiting' check (status in ('waiting', 'boarded', 'arrived', 'absent')),
  trip_date text not null,
  updated_at timestamptz default now()
);

-- 4. جدول الحجوزات والاشتراكات (Bookings)
create table if not exists public.khatti_bookings (
  id text primary key,
  line_id text not null,
  passenger_name text not null,
  phone text not null,
  plan_label text not null,
  seats jsonb default '[]'::jsonb,
  pickup text default '',
  return_shift text default '14:30',
  status text default 'upcoming',
  created_at timestamptz default now()
);

-- 5. جدول الإشعارات والتنبيهات الفورية (Broadcasts & Alerts)
create table if not exists public.khatti_broadcasts (
  id text primary key,
  line_id text not null default 'l1',
  msg text not null,
  time_label text not null,
  created_at timestamptz default now()
);

-- تفعيل صلاحيات القراءة والكتابة للنسخة الأولية (Row Level Security)
alter table public.khatti_lines enable row level security;
alter table public.khatti_live_locations enable row level security;
alter table public.khatti_attendance enable row level security;
alter table public.khatti_bookings enable row level security;
alter table public.khatti_broadcasts enable row level security;

create policy "Allow public read/write on khatti_lines" on public.khatti_lines for all using (true) with check (true);
create policy "Allow public read/write on khatti_live_locations" on public.khatti_live_locations for all using (true) with check (true);
create policy "Allow public read/write on khatti_attendance" on public.khatti_attendance for all using (true) with check (true);
create policy "Allow public read/write on khatti_bookings" on public.khatti_bookings for all using (true) with check (true);
create policy "Allow public read/write on khatti_broadcasts" on public.khatti_broadcasts for all using (true) with check (true);

-- تفعيل البث اللحظي المباشر عبر WebSockets (Supabase Realtime)
alter publication supabase_realtime add table public.khatti_live_locations;
alter publication supabase_realtime add table public.khatti_attendance;
alter publication supabase_realtime add table public.khatti_broadcasts;

-- إدراج بيانات أولية للخط الأول
insert into public.khatti_lines (id, from_area, to_dest, driver_name, phone, vehicle, plate, comp, price, seats, free, go_time, back_time, pickups)
values (
  'l1',
  'الكرادة',
  'جامعة بغداد (الجادرية)',
  'أبو محمد الحسني',
  '07701234567',
  'تويوتا هايس 2022 (14 راكب)',
  'بغداد 45612 / أ',
  'girls',
  60000,
  14,
  11,
  '07:00',
  '14:30',
  '["تقاطع الكرادة داخل", "ساحة الحرية", "بوابة جامعة بغداد - الجادرية"]'::jsonb
) on conflict (id) do nothing;

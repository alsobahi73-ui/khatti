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
  verified boolean default false,
  pickups jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- ترقية المشاريع القائمة: إضافة عمود التوثيق الفعلي للسائق/الخط ومعرّف السائق
alter table public.khatti_lines add column if not exists verified boolean default false;
alter table public.khatti_lines add column if not exists driver_id uuid;

-- دالة ذرية لحجز المقاعد سحابيًا ومنع الحجز الزائد (Overbooking Protection)
create or replace function public.reserve_seat(p_line_id text, p_seats int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_seats is null or p_seats <= 0 then
    return false;
  end if;
  update public.khatti_lines
  set free = free - p_seats
  where id = p_line_id and free >= p_seats;
  return found;
end;
$$;

revoke execute on function public.reserve_seat(text, int) from anon;
grant execute on function public.reserve_seat(text, int) to authenticated;

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

alter table public.khatti_live_locations add column if not exists user_id uuid;

-- 3. جدول الحضور والغياب اليومي للطلاب (Daily Student Attendance)
create table if not exists public.khatti_attendance (
  student_id text not null,
  line_id text not null,
  student_name text not null,
  stop_name text not null,
  parent_code text not null,
  status text not null default 'waiting' check (status in ('waiting', 'boarded', 'arrived', 'absent')),
  trip_date text not null,
  updated_at timestamptz default now(),
  primary key (student_id, trip_date, line_id)
);

-- ترقية المشاريع القائمة: تحويل المفتاح الأساسي لجدول الحضور إلى مفتاح مركّب (student_id, trip_date, line_id)
alter table public.khatti_attendance drop constraint if exists khatti_attendance_pkey;
alter table public.khatti_attendance add primary key (student_id, trip_date, line_id);

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
  pay_method text default 'cash',
  pay_status text default 'pending',
  pay_ref text default '',
  created_at timestamptz default now()
);

-- ترقية المشاريع المنشأة من مخطط أقدم عبر إضافة أعمدة الدفع ومعرّف المستخدم إن لم تكن موجودة
alter table public.khatti_bookings add column if not exists pay_method text default 'cash';
alter table public.khatti_bookings add column if not exists pay_status text default 'pending';
alter table public.khatti_bookings add column if not exists pay_ref text default '';
alter table public.khatti_bookings add column if not exists user_id uuid;

-- 5. جدول الإشعارات والتنبيهات الفورية (Broadcasts & Alerts)
create table if not exists public.khatti_broadcasts (
  id text primary key,
  line_id text not null default 'l1',
  msg text not null,
  time_label text not null,
  created_at timestamptz default now()
);

-- 6. جدول تقييمات الرحلات المتبادلة (Ratings)
create table if not exists public.khatti_ratings (
  id text primary key,
  trip_id text not null,
  line_id text default '',
  rater_role text not null check (rater_role in ('passenger', 'driver')),
  stars integer not null check (stars between 1 and 5),
  comment text default '',
  created_at timestamptz default now()
);

-- ترقية المشاريع القائمة: إضافة قيد نطاق نجوم التقييم (1..5) بشكل آمن قابل لإعادة التشغيل
do $$
begin
  alter table public.khatti_ratings
    add constraint khatti_ratings_stars_check check (stars between 1 and 5);
exception
  when duplicate_object then null;
end;
$$;

-- 7. جدول ملفات السائقين للمراجعة والتوثيق (Driver Profiles)
create table if not exists public.khatti_driver_profiles (
  user_id uuid primary key,
  name text not null,
  phone text not null,
  licence_file text default '',
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

-- ============================================================================
-- تُطبَّق هذه السياسات بعد نشر الكود فقط، لا قبله
-- ============================================================================

alter table public.khatti_lines enable row level security;
alter table public.khatti_live_locations enable row level security;
alter table public.khatti_attendance enable row level security;
alter table public.khatti_bookings enable row level security;
alter table public.khatti_broadcasts enable row level security;
alter table public.khatti_ratings enable row level security;
alter table public.khatti_driver_profiles enable row level security;

-- حذف السياسات الست القديمة المفتوحة
drop policy if exists "Allow public read/write on khatti_lines" on public.khatti_lines;
drop policy if exists "Allow public read/write on khatti_live_locations" on public.khatti_live_locations;
drop policy if exists "Allow public read/write on khatti_attendance" on public.khatti_attendance;
drop policy if exists "Allow public read/write on khatti_bookings" on public.khatti_bookings;
drop policy if exists "Allow public read/write on khatti_broadcasts" on public.khatti_broadcasts;
drop policy if exists "Allow public read/write on khatti_ratings" on public.khatti_ratings;

-- سياسات khatti_lines: قراءة عامة؛ إدراج/تعديل/حذف للمستخدمين الموثّقين فقط بشرط driver_id = auth.uid()
drop policy if exists "khatti_lines_select_public" on public.khatti_lines;
create policy "khatti_lines_select_public" on public.khatti_lines
  for select using (true);

drop policy if exists "khatti_lines_insert_owner" on public.khatti_lines;
create policy "khatti_lines_insert_owner" on public.khatti_lines
  for insert to authenticated with check (driver_id = auth.uid());

drop policy if exists "khatti_lines_update_owner" on public.khatti_lines;
create policy "khatti_lines_update_owner" on public.khatti_lines
  for update to authenticated using (driver_id = auth.uid()) with check (driver_id = auth.uid());

drop policy if exists "khatti_lines_delete_owner" on public.khatti_lines;
create policy "khatti_lines_delete_owner" on public.khatti_lines
  for delete to authenticated using (driver_id = auth.uid());

-- سياسات khatti_bookings: قراءة وتعديل لصاحب الحجز أو سائق الخط؛ إدراج وحذف لصاحب الحجز فقط
drop policy if exists "khatti_bookings_select_auth" on public.khatti_bookings;
create policy "khatti_bookings_select_auth" on public.khatti_bookings
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_bookings.line_id and l.driver_id = auth.uid()
    )
  );

drop policy if exists "khatti_bookings_insert_own" on public.khatti_bookings;
create policy "khatti_bookings_insert_own" on public.khatti_bookings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "khatti_bookings_update_auth" on public.khatti_bookings;
create policy "khatti_bookings_update_auth" on public.khatti_bookings
  for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_bookings.line_id and l.driver_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_bookings.line_id and l.driver_id = auth.uid()
    )
  );

drop policy if exists "khatti_bookings_delete_own" on public.khatti_bookings;
create policy "khatti_bookings_delete_own" on public.khatti_bookings
  for delete to authenticated
  using (user_id = auth.uid());

-- سياسات khatti_live_locations: قراءة عامة (تتبع الأهل أثناء الرحلة)؛ إدراج/تعديل/حذف للمستخدمين الموثّقين فقط
drop policy if exists "khatti_live_locations_select_public" on public.khatti_live_locations;
create policy "khatti_live_locations_select_public" on public.khatti_live_locations
  for select using (true);

drop policy if exists "khatti_live_locations_insert_auth" on public.khatti_live_locations;
create policy "khatti_live_locations_insert_auth" on public.khatti_live_locations
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "khatti_live_locations_update_auth" on public.khatti_live_locations;
create policy "khatti_live_locations_update_auth" on public.khatti_live_locations
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "khatti_live_locations_delete_auth" on public.khatti_live_locations;
create policy "khatti_live_locations_delete_auth" on public.khatti_live_locations
  for delete to authenticated using (auth.uid() is not null);

-- سياسات khatti_attendance: كل العمليات للسائق صاحب الخط فقط
drop policy if exists "khatti_attendance_driver_all" on public.khatti_attendance;
create policy "khatti_attendance_driver_all" on public.khatti_attendance
  for all to authenticated
  using (
    exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_attendance.line_id and l.driver_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_attendance.line_id and l.driver_id = auth.uid()
    )
  );

-- سياسات khatti_broadcasts: قراءة عامة؛ كتابة للسائق صاحب الخط فقط
drop policy if exists "khatti_broadcasts_select_public" on public.khatti_broadcasts;
create policy "khatti_broadcasts_select_public" on public.khatti_broadcasts
  for select using (true);

drop policy if exists "khatti_broadcasts_insert_driver" on public.khatti_broadcasts;
create policy "khatti_broadcasts_insert_driver" on public.khatti_broadcasts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_broadcasts.line_id and l.driver_id = auth.uid()
    )
  );

drop policy if exists "khatti_broadcasts_update_driver" on public.khatti_broadcasts;
create policy "khatti_broadcasts_update_driver" on public.khatti_broadcasts
  for update to authenticated
  using (
    exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_broadcasts.line_id and l.driver_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_broadcasts.line_id and l.driver_id = auth.uid()
    )
  );

drop policy if exists "khatti_broadcasts_delete_driver" on public.khatti_broadcasts;
create policy "khatti_broadcasts_delete_driver" on public.khatti_broadcasts
  for delete to authenticated
  using (
    exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_broadcasts.line_id and l.driver_id = auth.uid()
    )
  );

-- سياسات khatti_ratings: قراءة وإدراج للمستخدمين الموثّقين فقط؛ لا سياسة تعديل أو حذف
drop policy if exists "khatti_ratings_select_auth" on public.khatti_ratings;
create policy "khatti_ratings_select_auth" on public.khatti_ratings
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "khatti_ratings_insert_auth" on public.khatti_ratings;
create policy "khatti_ratings_insert_auth" on public.khatti_ratings
  for insert to authenticated with check (auth.uid() is not null);

-- سياسات khatti_driver_profiles: قراءة/إدراج/تعديل للمستخدم نفسه فقط بشرط user_id = auth.uid()؛ لا سياسة حذف
drop policy if exists "khatti_driver_profiles_select_own" on public.khatti_driver_profiles;
create policy "khatti_driver_profiles_select_own" on public.khatti_driver_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "khatti_driver_profiles_insert_own" on public.khatti_driver_profiles;
create policy "khatti_driver_profiles_insert_own" on public.khatti_driver_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "khatti_driver_profiles_update_own" on public.khatti_driver_profiles;
create policy "khatti_driver_profiles_update_own" on public.khatti_driver_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- دفاع إضافي داخل كتلة DO آمنة تلتقط أي خطأ: سحب صلاحية قراءة عمود phone من anon
do $$
begin
  revoke select (phone) on public.khatti_lines from anon;
exception
  when others then null;
end;
$$;

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

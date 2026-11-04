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

-- تنظيف (أ-3): دالة الحجز القديمة غير الذرية محذوفة — لا يستدعيها أي كود بعد الآن
drop function if exists public.reserve_seat(text, int);

-- 2. جدول التتبع اللحظي المباشر لحركة ومكان السائق والراكب (Live GPS Locations)
create table if not exists public.khatti_live_locations (
  id text primary key, -- مثال: 'l1_driver_main' أو 'l1_pax_<device>'
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

-- 8. جدول رسائل محادثة الرحلة الجماعية بين السائق والركاب (Chat Messages)
-- قناة المحادثة = (line_id + trip_date) داخل نافذة الرحلة فقط
create table if not exists public.khatti_chat_messages (
  id text primary key,
  line_id text not null,
  trip_date text not null,
  sender_role text check (sender_role in ('passenger', 'driver')),
  sender_name text not null,
  sender_user_id uuid,
  msg text not null,
  created_at timestamptz default now()
);

-- 9. جدول طلبات التنبيه عند توفر مقاعد على الخطوط الممتلئة (Availability Notify Requests)
-- ملاحظة: التنبيه داخل التطبيق فقط في هذه الشريحة؛ لا رسائل SMS أو واتساب لأنها تحتاج مزودًا خارجيًا.
create table if not exists public.khatti_notify_requests (
  id text primary key,
  line_id text not null,
  user_id uuid not null,
  created_at timestamptz default now()
);

-- 10. جدول اشتراكات السائقين اليدوية (Driver Subscriptions)
-- تُطبَّق بعد نشر الكود فقط، لا قبله
-- ملاحظة: التأكيد وتغيير الحالة (status) وتواريخ البدء والانتهاء (starts_at / ends_at) للإدارة عبر لوحة التحكم فقط.
create table if not exists public.khatti_driver_subscriptions (
  id text primary key,
  driver_id uuid not null,
  plan_label text,
  months integer,
  amount integer,
  pay_method text check (pay_method in ('cash', 'zain', 'asia')),
  pay_ref text,
  status text check (status in ('pending', 'confirmed', 'rejected')) default 'pending',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now()
);

-- 11. جدول تقارير الأخطاء داخل التطبيق (In-App Error Reports)
-- تُطبَّق بعد نشر الكود فقط، لا قبله
create table if not exists public.khatti_error_reports (
  id text primary key,
  user_id uuid,
  page text,
  message text not null,
  details text,
  created_at timestamptz default now()
);

-- ============================================================================
-- تُطبَّق بعد نشر الكود فقط، لا قبله
-- ============================================================================

alter table public.khatti_lines enable row level security;
alter table public.khatti_live_locations enable row level security;
alter table public.khatti_attendance enable row level security;
alter table public.khatti_bookings enable row level security;
alter table public.khatti_broadcasts enable row level security;
alter table public.khatti_ratings enable row level security;
alter table public.khatti_driver_profiles enable row level security;
alter table public.khatti_chat_messages enable row level security;
alter table public.khatti_notify_requests enable row level security;
alter table public.khatti_driver_subscriptions enable row level security;
alter table public.khatti_error_reports enable row level security;

-- ترقية الأعمدة الأمنية الإضافية (قابلة لإعادة التشغيل)
alter table public.khatti_ratings add column if not exists rater_user_id uuid;
alter table public.khatti_attendance add column if not exists user_id uuid;

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

-- H2: منع تزوير الثقة على khatti_lines عند الإدراج أو التعديل من مستخدم موثّق
create or replace function public.enforce_khatti_lines_trust()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      NEW.verified := false;
      NEW.rc := 1;
      NEW.trusted := false;
    elsif tg_op = 'UPDATE' then
      NEW.verified := OLD.verified;
      NEW.rating := OLD.rating;
      NEW.rc := OLD.rc;
      NEW.trusted := OLD.trusted;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_lines_enforce_trust on public.khatti_lines;
create trigger trg_khatti_lines_enforce_trust
  before insert or update on public.khatti_lines
  for each row execute function public.enforce_khatti_lines_trust();

-- إصلاح أمني (أ-2): إنشاء/تعديل الخط للسائقين المعتمدين فقط (الموافقة من الإدارة عبر لوحة التحكم)
create or replace function public.enforce_khatti_lines_approved_driver()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from public.khatti_driver_profiles
    where user_id = auth.uid() and status = 'approved'
  ) then
    raise exception 'إنشاء الخط متاح للسائقين المعتمدين فقط';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_lines_require_approved_driver on public.khatti_lines;
create trigger trg_khatti_lines_require_approved_driver
  before insert or update on public.khatti_lines
  for each row execute function public.enforce_khatti_lines_approved_driver();

-- إصلاح (م-11): قيود عددية على الخطوط
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_khatti_lines_seats_range') then
    alter table public.khatti_lines add constraint chk_khatti_lines_seats_range check (seats between 1 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_khatti_lines_free_range') then
    alter table public.khatti_lines add constraint chk_khatti_lines_free_range check (free between 0 and seats);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_khatti_lines_price_nonneg') then
    alter table public.khatti_lines add constraint chk_khatti_lines_price_nonneg check (price >= 0);
  end if;
end;
$$;

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

-- إصلاح (م-10): منع تغيير الخط أو مالك الحجز عند التعديل، وقصر تغيير حالة الدفع على سائق الخط
create or replace function public.guard_khatti_booking_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    NEW.line_id := OLD.line_id;
    NEW.user_id := OLD.user_id;
    if OLD.pay_status is distinct from NEW.pay_status and not exists (
      select 1 from public.khatti_lines l
      where l.id = OLD.line_id and l.driver_id = auth.uid()
    ) then
      NEW.pay_status := OLD.pay_status;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_bookings_guard_update on public.khatti_bookings;
create trigger trg_khatti_bookings_guard_update
  before update on public.khatti_bookings
  for each row execute function public.guard_khatti_booking_update();

-- إصلاح أمني (أ-1): سياسات khatti_live_locations: قراءة للمشاركين فقط (سائق الخط أو صاحب حجز عليه)؛ تتبع الأهل عبر دالة get_driver_location_for_parent بكود الطالب؛ والكتابة حسب الدور (السائق مالك الخط أو الراكب صاحب الصف مع حجز على الخط)
drop policy if exists "khatti_live_locations_select_public" on public.khatti_live_locations;
drop policy if exists "khatti_live_locations_select_participants" on public.khatti_live_locations;
create policy "khatti_live_locations_select_participants" on public.khatti_live_locations
  for select to authenticated
  using (
    exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_live_locations.line_id and l.driver_id = auth.uid()
    )
    or exists (
      select 1 from public.khatti_bookings b
      where b.line_id = khatti_live_locations.line_id and b.user_id = auth.uid()
    )
  );

drop policy if exists "khatti_live_locations_insert_auth" on public.khatti_live_locations;
create policy "khatti_live_locations_insert_auth" on public.khatti_live_locations
  for insert to authenticated
  with check (
    (user_role = 'driver' and exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_live_locations.line_id and l.driver_id = auth.uid()
    ))
    or
    (user_role = 'passenger' and user_id = auth.uid() and exists (
      select 1 from public.khatti_bookings b
      where b.line_id = khatti_live_locations.line_id and b.user_id = auth.uid()
    ))
  );

drop policy if exists "khatti_live_locations_update_auth" on public.khatti_live_locations;
create policy "khatti_live_locations_update_auth" on public.khatti_live_locations
  for update to authenticated
  using (
    (user_role = 'driver' and exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_live_locations.line_id and l.driver_id = auth.uid()
    ))
    or
    (user_role = 'passenger' and user_id = auth.uid())
  )
  with check (
    (user_role = 'driver' and exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_live_locations.line_id and l.driver_id = auth.uid()
    ))
    or
    (user_role = 'passenger' and user_id = auth.uid())
  );

drop policy if exists "khatti_live_locations_delete_auth" on public.khatti_live_locations;
create policy "khatti_live_locations_delete_auth" on public.khatti_live_locations
  for delete to authenticated
  using (
    (user_role = 'driver' and exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_live_locations.line_id and l.driver_id = auth.uid()
    ))
    or
    (user_role = 'passenger' and user_id = auth.uid())
  );

-- إصلاح (م-4): صيغة معرّف صف الموقع مرتبطة بالدور — يمنع حجز معرّف صف السائق من راكب
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_khatti_locations_id_role') then
    alter table public.khatti_live_locations add constraint chk_khatti_locations_id_role check (
      (user_role = 'driver' and id = line_id || '_driver_main')
      or (user_role = 'passenger' and id like line_id || '\_pax\_%' escape '\')
    );
  end if;
end;
$$;

-- سياسات khatti_attendance: كل العمليات للسائق صاحب الخط فقط (وغياب الراكب يمر عبر دالة mark_absent الآمنة)
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

-- M2: سياسات khatti_ratings: قراءة وإدراج للمالك فقط (rater_user_id = auth.uid())؛ لا سياسة تعديل أو حذف
drop policy if exists "khatti_ratings_select_auth" on public.khatti_ratings;
drop policy if exists "khatti_ratings_select_own" on public.khatti_ratings;
create policy "khatti_ratings_select_own" on public.khatti_ratings
  for select to authenticated using (rater_user_id = auth.uid());

drop policy if exists "khatti_ratings_insert_auth" on public.khatti_ratings;
drop policy if exists "khatti_ratings_insert_own" on public.khatti_ratings;
create policy "khatti_ratings_insert_own" on public.khatti_ratings
  for insert to authenticated with check (rater_user_id = auth.uid());

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

-- سياسات khatti_chat_messages (تُطبَّق بعد نشر الكود فقط، لا قبله):
-- قراءة وإدراج للموثّقين المشاركين فقط (صاحب حجز على الخط أو سائق الخط) مع sender_user_id = auth.uid() عند الإدراج، وضمن يوم الرحلة فقط (بتوقيت بغداد)
drop policy if exists "khatti_chat_messages_select_participants" on public.khatti_chat_messages;
create policy "khatti_chat_messages_select_participants" on public.khatti_chat_messages
  for select to authenticated
  using (
    trip_date = to_char(now() at time zone 'Asia/Baghdad', 'YYYY-MM-DD')
    and (
      exists (
        select 1 from public.khatti_bookings b
        where b.line_id = khatti_chat_messages.line_id and b.user_id = auth.uid()
      )
      or exists (
        select 1 from public.khatti_lines l
        where l.id = khatti_chat_messages.line_id and l.driver_id = auth.uid()
      )
    )
  );

drop policy if exists "khatti_chat_messages_insert_participants" on public.khatti_chat_messages;
create policy "khatti_chat_messages_insert_participants" on public.khatti_chat_messages
  for insert to authenticated
  with check (
    sender_user_id = auth.uid()
    and trip_date = to_char(now() at time zone 'Asia/Baghdad', 'YYYY-MM-DD')
    and (
      exists (
        select 1 from public.khatti_bookings b
        where b.line_id = khatti_chat_messages.line_id and b.user_id = auth.uid()
      )
      or exists (
        select 1 from public.khatti_lines l
        where l.id = khatti_chat_messages.line_id and l.driver_id = auth.uid()
      )
    )
  );

-- إصلاح (م-8): فرض هوية مرسل المحادثة خادميًا — الدور من ملكية الخط، والاسم من الملف أو آخر حجز
create or replace function public.enforce_khatti_chat_sender()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_driver boolean;
  v_name text;
begin
  if auth.uid() is not null then
    NEW.sender_user_id := auth.uid();
    select exists (
      select 1 from public.khatti_lines l
      where l.id = NEW.line_id and l.driver_id = auth.uid()
    ) into v_is_driver;
    if v_is_driver then
      NEW.sender_role := 'driver';
      select name into v_name from public.khatti_driver_profiles where user_id = auth.uid() limit 1;
      NEW.sender_name := coalesce(nullif(btrim(coalesce(v_name, '')), ''), 'السائق');
    else
      NEW.sender_role := 'passenger';
      select passenger_name into v_name from public.khatti_bookings
      where line_id = NEW.line_id and user_id = auth.uid()
      order by created_at desc limit 1;
      NEW.sender_name := coalesce(nullif(btrim(coalesce(v_name, '')), ''), 'راكب');
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_chat_enforce_sender on public.khatti_chat_messages;
create trigger trg_khatti_chat_enforce_sender
  before insert on public.khatti_chat_messages
  for each row execute function public.enforce_khatti_chat_sender();

-- سياسات khatti_notify_requests (تُطبَّق بعد نشر الكود فقط، لا قبله):
-- إدراج/قراءة لصاحب الطلب نفسه، وقراءة لسائق الخط
drop policy if exists "khatti_notify_requests_select_auth" on public.khatti_notify_requests;
create policy "khatti_notify_requests_select_auth" on public.khatti_notify_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.khatti_lines l
      where l.id = khatti_notify_requests.line_id and l.driver_id = auth.uid()
    )
  );

drop policy if exists "khatti_notify_requests_insert_own" on public.khatti_notify_requests;
create policy "khatti_notify_requests_insert_own" on public.khatti_notify_requests
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "khatti_notify_requests_update_own" on public.khatti_notify_requests;
create policy "khatti_notify_requests_update_own" on public.khatti_notify_requests
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "khatti_notify_requests_delete_own" on public.khatti_notify_requests;
create policy "khatti_notify_requests_delete_own" on public.khatti_notify_requests
  for delete to authenticated
  using (user_id = auth.uid());

-- إصلاح (ل-4): منع تغيير الخط أو مالك طلب التنبيه عند التعديل
create or replace function public.guard_khatti_notify_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    NEW.line_id := OLD.line_id;
    NEW.user_id := OLD.user_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_notify_guard_update on public.khatti_notify_requests;
create trigger trg_khatti_notify_guard_update
  before update on public.khatti_notify_requests
  for each row execute function public.guard_khatti_notify_update();

-- سياسات khatti_driver_subscriptions (تُطبَّق بعد نشر الكود فقط، لا قبله):
-- قراءة/إدراج لصاحب الاشتراك نفسه (driver_id = auth.uid()) فقط؛
-- لا توجد سياسة تعديل (UPDATE) أو حذف (DELETE) لأن تأكيد الاشتراك وتغيير الحالة (pending -> confirmed / rejected) يُترك للإدارة عبر لوحة التحكم فقط.
drop policy if exists "khatti_driver_subscriptions_select_own" on public.khatti_driver_subscriptions;
create policy "khatti_driver_subscriptions_select_own" on public.khatti_driver_subscriptions
  for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists "khatti_driver_subscriptions_insert_own" on public.khatti_driver_subscriptions;
create policy "khatti_driver_subscriptions_insert_own" on public.khatti_driver_subscriptions
  for insert to authenticated
  with check (driver_id = auth.uid());

-- إصلاح (م-3): فرض حالة pending وتواريخ فارغة على أي إدراج اشتراك من مستخدم موثّق
create or replace function public.force_khatti_subscription_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    NEW.status := 'pending';
    NEW.starts_at := null;
    NEW.ends_at := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_subscriptions_force_pending on public.khatti_driver_subscriptions;
create trigger trg_khatti_subscriptions_force_pending
  before insert on public.khatti_driver_subscriptions
  for each row execute function public.force_khatti_subscription_pending();

-- سياسات khatti_error_reports (تُطبَّق بعد نشر الكود فقط، لا قبله):
-- إدراج لأي موثّق (user_id = auth.uid())، وقراءة لصاحب التقرير فقط (user_id = auth.uid()).
drop policy if exists "khatti_error_reports_select_own" on public.khatti_error_reports;
create policy "khatti_error_reports_select_own" on public.khatti_error_reports
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "khatti_error_reports_insert_own" on public.khatti_error_reports;
create policy "khatti_error_reports_insert_own" on public.khatti_error_reports
  for insert to authenticated
  with check (user_id = auth.uid());

-- إصلاح (ل-3): سقف 20 تقرير خطأ يوميًا لكل مستخدم موثّق
create or replace function public.limit_khatti_error_reports()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.khatti_error_reports
    where user_id = auth.uid() and created_at >= now() - interval '1 day'
  ) >= 20 then
    raise exception 'تم تجاوز الحد اليومي لتقارير الأخطاء';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_error_reports_rate_limit on public.khatti_error_reports;
create trigger trg_khatti_error_reports_rate_limit
  before insert on public.khatti_error_reports
  for each row execute function public.limit_khatti_error_reports();

-- M1: منع تعديل حالة ملف السائق ذاتيًا (تغيير status متاح للإدارة عبر لوحة التحكم فقط)
create or replace function public.prevent_driver_profile_status_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and OLD.status is distinct from NEW.status then
    raise exception 'لا يُسمح بتغيير حالة ملف السائق ذاتيًا؛ التعديل للإدارة فقط';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_driver_profiles_lock_status on public.khatti_driver_profiles;
create trigger trg_khatti_driver_profiles_lock_status
  before update on public.khatti_driver_profiles
  for each row execute function public.prevent_driver_profile_status_self_update();

-- إصلاح (م-2): فرض حالة pending على أي إدراج ملف سائق من مستخدم موثّق (مع قفل التعديل أعلاه، لا اعتماد ذاتي أبدًا)
create or replace function public.force_khatti_driver_profile_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    NEW.status := 'pending';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_khatti_driver_profiles_force_pending on public.khatti_driver_profiles;
create trigger trg_khatti_driver_profiles_force_pending
  before insert on public.khatti_driver_profiles
  for each row execute function public.force_khatti_driver_profile_pending();

-- H1: سحب صلاحية قراءة عمود phone من anon ومن authenticated داخل كتلة DO آمنة
do $$
begin
  revoke select (phone) on public.khatti_lines from anon;
  revoke select (phone) on public.khatti_lines from authenticated;
exception
  when others then null;
end;
$$;

-- تنظيف (ك-1): دالة كشف الهاتف محذوفة — لا يستدعيها أي كود بعد الآن
drop function if exists public.get_line_phone(text);

-- إصلاح أمني (أ-1): عرض الأهل عبر دالتي كود الطالب (تعملان بدور مالك الجدول، دون كشف جدول المواقع؛ كود الطالب في السحابة هو parent_code)
create or replace function public.get_parent_view(p_parent_code text)
returns table(line_id text, student_name text, student_code text, status text, trip_date text)
language sql
security definer
set search_path = public
stable
as $$
  select a.line_id, a.student_name, a.parent_code, a.status, a.trip_date
  from public.khatti_attendance a
  where a.parent_code = p_parent_code
  order by a.trip_date desc, a.updated_at desc
  limit 1;
$$;

grant execute on function public.get_parent_view(text) to anon, authenticated;

create or replace function public.get_driver_location_for_parent(p_parent_code text)
returns table(id text, line_id text, lat double precision, lng double precision, speed double precision, updated_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.line_id, l.lat, l.lng, l.speed, l.updated_at
  from public.khatti_live_locations l
  where l.user_role = 'driver'
    and l.line_id = (
      select a.line_id from public.khatti_attendance a
      where a.parent_code = p_parent_code
      order by a.trip_date desc, a.updated_at desc
      limit 1
    )
  limit 1;
$$;

grant execute on function public.get_driver_location_for_parent(text) to anon, authenticated;

-- H4: دالة ذرية لإنشاء الحجز وخصم المقاعد مع أخذ user_id من auth.uid() حصرًا
create or replace function public.create_booking_atomic(
  p_line_id text,
  p_passenger_name text,
  p_phone text,
  p_plan_label text,
  p_seats jsonb,
  p_pickup text,
  p_return_shift text,
  p_pay_method text,
  p_pay_status text,
  p_pay_ref text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seat_count int;
  v_booking_id text;
begin
  if v_uid is null or p_line_id is null or btrim(p_line_id) = '' then
    return null;
  end if;
  if p_seats is null or jsonb_typeof(p_seats) <> 'array' then
    return null;
  end if;
  v_seat_count := jsonb_array_length(p_seats);
  if v_seat_count < 1 or v_seat_count > 3 then
    return null;
  end if;
  if (select count(*) from jsonb_array_elements_text(p_seats))
     <> (select count(distinct x) from jsonb_array_elements_text(p_seats) as x) then
    return null;
  end if;

  update public.khatti_lines
  set free = free - v_seat_count
  where id = p_line_id and free >= v_seat_count;

  if not found then
    return null;
  end if;

  v_booking_id := 'bk_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_' || substr(md5(random()::text), 1, 6);

  insert into public.khatti_bookings (
    id, line_id, user_id, passenger_name, phone, plan_label,
    seats, pickup, return_shift, status, pay_method, pay_status, pay_ref
  ) values (
    v_booking_id,
    p_line_id,
    v_uid,
    coalesce(p_passenger_name, ''),
    coalesce(p_phone, ''),
    coalesce(p_plan_label, ''),
    p_seats,
    coalesce(p_pickup, ''),
    coalesce(p_return_shift, '14:30'),
    'upcoming',
    case when coalesce(p_pay_method, 'cash') in ('cash', 'zaincash', 'asiahawala') then coalesce(p_pay_method, 'cash') else 'cash' end,
    'pending',
    coalesce(p_pay_ref, '')
  );

  return v_booking_id;
end;
$$;

revoke execute on function public.create_booking_atomic(text, text, text, text, jsonb, text, text, text, text, text) from anon;
grant execute on function public.create_booking_atomic(text, text, text, text, jsonb, text, text, text, text, text) to authenticated;

-- M2: دالة للتحقق من وجود تقييم الطرف المقابل دون كشف محتواه قبل التقييم المتبادل
create or replace function public.has_other_rating(p_trip_id text, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opposite_role text;
begin
  if auth.uid() is null or p_trip_id is null or btrim(p_trip_id) = '' then
    return false;
  end if;
  if p_role = 'passenger' then
    v_opposite_role := 'driver';
  elsif p_role = 'driver' then
    v_opposite_role := 'passenger';
  else
    return false;
  end if;
  return exists (
    select 1 from public.khatti_ratings r
    where r.trip_id = p_trip_id and r.rater_role = v_opposite_role
  );
end;
$$;

revoke execute on function public.has_other_rating(text, text) from anon;
grant execute on function public.has_other_rating(text, text) to authenticated;

-- M3: دالة آمنة لتسجيل غياب الراكب بعد التحقق من وجود حجز له على الخط
create or replace function public.mark_absent(
  p_line_id text,
  p_student_id text,
  p_trip_date text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking record;
  v_digits text;
  v_parent_code text;
begin
  if v_uid is null
     or p_line_id is null or btrim(p_line_id) = ''
     or p_student_id is null or btrim(p_student_id) = ''
     or p_trip_date is null or btrim(p_trip_date) = '' then
    return false;
  end if;

  select b.passenger_name, b.pickup, b.phone
  into v_booking
  from public.khatti_bookings b
  where b.line_id = p_line_id and b.user_id = v_uid
  order by b.created_at desc
  limit 1;

  if not found then
    return false;
  end if;

  v_digits := regexp_replace(coalesce(v_booking.phone, ''), '\D', '', 'g');
  v_parent_code := 'KH-' || coalesce(nullif(right(v_digits, 4), ''), '4829');

  -- إصلاح (م-9): لا يكتب الغياب فوق صعود/وصول سجّله السائق
  if exists (
    select 1 from public.khatti_attendance
    where student_id = p_student_id and trip_date = p_trip_date and line_id = p_line_id
      and status in ('boarded', 'arrived')
  ) then
    return false;
  end if;

  insert into public.khatti_attendance (
    student_id, line_id, student_name, stop_name, parent_code, status, trip_date, user_id, updated_at
  ) values (
    p_student_id,
    p_line_id,
    coalesce(nullif(btrim(v_booking.passenger_name), ''), 'راكب'),
    coalesce(v_booking.pickup, ''),
    v_parent_code,
    'absent',
    p_trip_date,
    v_uid,
    now()
  )
  on conflict (student_id, trip_date, line_id) do update
  set status = 'absent',
      user_id = v_uid,
      updated_at = now();

  return true;
end;
$$;

revoke execute on function public.mark_absent(text, text, text) from anon;
grant execute on function public.mark_absent(text, text, text) to authenticated;

-- ملاحظة: لا يستخدم التطبيق Supabase Realtime (التتبع استطلاع HTTP فقط)؛ أُزيلت الجداول من المنشور

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

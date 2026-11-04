const { test } = require('node:test');
const assert = require('node:assert/strict');
const KhattiCloud = require('../assets/cloud');

function setupEnv() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; }
  };
  return store;
}

test('fetchLines returns null when unconfigured or on fetch/response error, and maps Supabase rows to LINES shape', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    // 1. Unconfigured -> returns null without throwing
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error('network error'); };
    assert.equal(await KhattiCloud.fetchLines(), null);
    assert.equal(called, false);

    // Configure valid url and key
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    // 2. Network exception -> returns null without throwing
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(await KhattiCloud.fetchLines(), null);

    // 3. Non-OK HTTP status -> returns null
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'err' }) });
    assert.equal(await KhattiCloud.fetchLines(), null);

    // 4. Successful response -> maps columns to LINES shape with proper types and defaults
    let capturedUrl = '';
    let capturedHeaders = {};
    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return {
        ok: true,
        json: async () => ([
          {
            id: 'l1',
            from_area: 'الكرادة',
            to_dest: 'جامعة بغداد (الجادرية)',
            driver_name: 'أبو محمد الحسني',
            phone: '07701234567',
            vehicle: 'تويوتا هايس 2022 (14 راكب)',
            plate: 'بغداد 45612 / أ',
            comp: '',
            price: '60000',
            seats: '14',
            free: '11',
            go_time: '07:00',
            back_time: '14:30',
            rating: '4.9',
            rc: '18',
            trusted: 1,
            pickups: null
          }
        ])
      };
    };

    const lines = await KhattiCloud.fetchLines();
    assert.ok(capturedUrl.startsWith('https://test-proj.supabase.co/rest/v1/khatti_lines?select='));
    assert.ok(!capturedUrl.includes('select=*') && !capturedUrl.split('?select=')[1].split(',').includes('phone'));
    assert.equal(capturedHeaders.apikey, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key');
    assert.equal(capturedHeaders.Authorization, 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key');
    assert.ok(Array.isArray(lines));
    assert.equal(lines.length, 1);

    const l = lines[0];
    assert.equal(l.id, 'l1');
    assert.equal(l.from, 'الكرادة');
    assert.equal(l.to, 'جامعة بغداد (الجادرية)');
    assert.equal(l.driver, 'أبو محمد الحسني');
    assert.equal(l.driverName, 'أبو محمد الحسني');
    assert.equal(l.phone, undefined);
    assert.equal(l.vehicle, 'تويوتا هايس 2022 (14 راكب)');
    assert.equal(l.plate, 'بغداد 45612 / أ');
    assert.equal(l.comp, 'mixed');
    assert.strictEqual(l.price, 60000);
    assert.strictEqual(l.seats, 14);
    assert.strictEqual(l.free, 11);
    assert.strictEqual(l.go, '07:00');
    assert.strictEqual(l.back, '14:30');
    assert.strictEqual(l.rating, 4.9);
    assert.strictEqual(l.rc, 18);
    assert.strictEqual(l.trusted, true);
    assert.strictEqual(l.verified, false);
    assert.deepEqual(l.pickups, []);

    // Verify verified=true is passed when row has verified: true
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ([{ id: 'l2', verified: true }])
    });
    const verifiedLines = await KhattiCloud.fetchLines();
    assert.strictEqual(verifiedLines[0].verified, true);

    // 5. AbortSignal is passed and abort/timeout returns null in fetchLines and false in init
    let signalPassed = false;
    globalThis.fetch = async (_url, opts) => {
      signalPassed = Boolean(opts && opts.signal && typeof opts.signal.aborted === 'boolean');
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };
    assert.equal(await KhattiCloud.fetchLines(), null);
    assert.equal(signalPassed, true);

    signalPassed = false;
    assert.equal(await KhattiCloud.init(), false);
    assert.equal(signalPassed, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('pushBooking returns false when unconfigured and sends payment fields in request body', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    let fetchCalled = false;
    globalThis.fetch = async () => { fetchCalled = true; return { ok: true }; };

    // 1. Unconfigured -> returns false without calling fetch
    assert.equal(await KhattiCloud.pushBooking({ id: 'b1' }), false);
    assert.equal(fetchCalled, false);

    // Configure valid url and key
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    const payloads = [];
    globalThis.fetch = async (_url, opts) => {
      payloads.push(JSON.parse(opts.body));
      return { ok: true };
    };

    // 2. Reads payment fields from booking.payment (method/status/ref)
    assert.equal(await KhattiCloud.pushBooking({
      id: 'b1',
      lineId: 'l1',
      passengerName: 'سارة علي',
      phone: '07701112233',
      plan: 'شهري',
      payment: { method: 'zaincash', status: 'paid', ref: 'ZC-123' }
    }), true);
    assert.equal(payloads[0].pay_method, 'zaincash');
    assert.equal(payloads[0].pay_status, 'paid');
    assert.equal(payloads[0].pay_ref, 'ZC-123');

    // 3. Falls back to flat fields pay_method, pay_status, pay_ref
    assert.equal(await KhattiCloud.pushBooking({
      id: 'b2',
      pay_method: 'asiahawala',
      pay_status: 'paid',
      pay_ref: 'AH-456'
    }), true);
    assert.equal(payloads[1].pay_method, 'asiahawala');
    assert.equal(payloads[1].pay_status, 'paid');
    assert.equal(payloads[1].pay_ref, 'AH-456');

    // 4. Uses defaults ('cash', 'pending', '') when payment info is omitted
    assert.equal(await KhattiCloud.pushBooking({ id: 'b3' }), true);
    assert.equal(payloads[2].pay_method, 'cash');
    assert.equal(payloads[2].pay_status, 'pending');
    assert.equal(payloads[2].pay_ref, '');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('pushRating and pullRatings handle unconfigured state, composite ID, payload fields, and row mapping', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    let fetchCalled = false;
    globalThis.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => [] }; };

    // 1. Unconfigured -> pushRating returns false, pullRatings returns [] without calling fetch
    assert.equal(await KhattiCloud.pushRating({ tripId: 't1', lineId: 'l1', role: 'passenger', stars: 5, comment: 'ممتاز' }), false);
    assert.deepEqual(await KhattiCloud.pullRatings('t1'), []);
    assert.equal(fetchCalled, false);

    // Configure valid url and key
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    // 2. pushRating sends composite id `${tripId}:${role}`, role, stars, comment with merge-duplicates
    let capturedPushUrl = '';
    let capturedPushOpts = null;
    globalThis.fetch = async (url, opts) => {
      capturedPushUrl = url;
      capturedPushOpts = opts;
      return { ok: true };
    };

    const pushed = await KhattiCloud.pushRating({
      tripId: 't1',
      lineId: 'l1',
      role: 'driver',
      stars: 4,
      comment: 'راكب ملتزم بالوقت'
    });
    assert.equal(pushed, true);
    assert.equal(capturedPushUrl, 'https://test-proj.supabase.co/rest/v1/khatti_ratings');
    assert.equal(capturedPushOpts.method, 'POST');
    assert.equal(capturedPushOpts.headers.Prefer, 'resolution=merge-duplicates');
    const body = JSON.parse(capturedPushOpts.body);
    assert.equal(body.id, 't1:driver');
    assert.equal(body.trip_id, 't1');
    assert.equal(body.line_id, 'l1');
    assert.equal(body.rater_role, 'driver');
    assert.strictEqual(body.stars, 4);
    assert.equal(body.comment, 'راكب ملتزم بالوقت');

    // 3. pullRatings filters by trip_id and maps rows to {role, stars, comment}
    let capturedPullUrl = '';
    globalThis.fetch = async (url) => {
      capturedPullUrl = url;
      return {
        ok: true,
        json: async () => ([
          { id: 't1:passenger', trip_id: 't1', line_id: 'l1', rater_role: 'passenger', stars: 5, comment: 'رحلة مريحة' },
          { id: 't1:driver', trip_id: 't1', line_id: 'l1', rater_role: 'driver', stars: 4, comment: '' }
        ])
      };
    };

    const ratings = await KhattiCloud.pullRatings('t1');
    assert.equal(capturedPullUrl, 'https://test-proj.supabase.co/rest/v1/khatti_ratings?trip_id=eq.t1&select=*');
    assert.deepEqual(ratings, [
      { role: 'passenger', stars: 5, comment: 'رحلة مريحة' },
      { role: 'driver', stars: 4, comment: '' }
    ]);

    // 4. Error / non-OK response returns false for pushRating and [] for pullRatings
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    assert.equal(await KhattiCloud.pushRating({ tripId: 't1', lineId: 'l1', role: 'passenger', stars: 5 }), false);
    assert.deepEqual(await KhattiCloud.pullRatings('t1'), []);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('reserveSeats, loadLines _cloud tagging, and K.line cloud vs local seat deduction', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    // 1. Unconfigured reserveSeats returns false without calling fetch
    let fetchCalled = false;
    globalThis.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => true }; };
    assert.equal(await KhattiCloud.reserveSeats('l1', 2), false);
    assert.equal(fetchCalled, false);

    // Configure cloud
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    // 2. reserveSeats sends POST to /rest/v1/rpc/reserve_seat with AbortSignal and checks res.ok & boolean return
    let rpcUrl = '';
    let rpcOpts = null;
    globalThis.fetch = async (url, opts) => {
      rpcUrl = url;
      rpcOpts = opts;
      return { ok: true, json: async () => true };
    };
    assert.equal(await KhattiCloud.reserveSeats('l1', 2), true);
    assert.equal(rpcUrl, 'https://test-proj.supabase.co/rest/v1/rpc/reserve_seat');
    assert.equal(rpcOpts.method, 'POST');
    assert.ok(rpcOpts.signal);
    assert.deepEqual(JSON.parse(rpcOpts.body), { p_line_id: 'l1', p_seats: 2 });

    // When RPC returns false (insufficient seats) or HTTP error
    globalThis.fetch = async () => ({ ok: true, json: async () => false });
    assert.equal(await KhattiCloud.reserveSeats('l1', 3), false);

    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => true });
    assert.equal(await KhattiCloud.reserveSeats('l1', 1), false);

    // 3. loadLines tags cloud lines with _cloud=true and K.line skips local deduction only for _cloud lines
    globalThis.LINES = [
      { id: 'l1', seats: 14, free: 11 }
    ];
    globalThis.COMP = { girls: 'طالبات', boys: 'طلاب', mixed: 'مختلط' };
    globalThis.KhattiCore = require('../assets/core');
    globalThis.document = {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    };
    globalThis.location = { pathname: '/passenger/search.html' };
    const { loadLines } = require('../assets/data-source');
    delete require.cache[require.resolve('../assets/app')];
    if (!globalThis.K) {
      const fs = require('node:fs');
      const vm = require('node:vm');
      vm.runInThisContext(fs.readFileSync(require.resolve('../assets/app'), 'utf8') + '\n;globalThis.K = K;');
    }

    // Add a local upcoming booking of 2 seats on l1
    localStorage.setItem('khatti_demo_v1_bookings', JSON.stringify([
      { id: 'bk_1', lineId: 'l1', when: '07:00', status: 'upcoming', seats: ['مقعد 1', 'مقعد 2'] }
    ]));

    // Demo line (no _cloud) subtracts 2 seats from 11 -> 9
    assert.equal(globalThis.K.line('l1').free, 9);

    // Now load cloud lines via loadLines (which sets _cloud=true)
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ([
        { id: 'l1', from_area: 'الكرادة', to_dest: 'الجادرية', driver_name: 'سائق', phone: '07701234567', vehicle: 'باص', seats: 14, free: 8 }
      ])
    });
    const loaded = await loadLines();
    assert.equal(loaded[0]._cloud, true);
    assert.equal(globalThis.LINES[0]._cloud, true);
    // Cloud line free comes directly from DB (8) without subtracting local 2 seats again
    assert.equal(globalThis.K.line('l1').free, 8);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('pushLocation, pullLocations, pushAttendance, pushBooking, pushRating enforce 10s AbortSignal and res.ok, deviceId format, and attendance on_conflict', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    // 1. Device ID is generated once, 16 hex chars, persisted in khatti_demo_v1_device_id
    const devId1 = KhattiCloud.getDeviceId();
    assert.match(devId1, /^[0-9a-f]{16}$/);
    assert.equal(localStorage.getItem('khatti_demo_v1_device_id'), devId1);
    const devId2 = KhattiCloud.getDeviceId();
    assert.equal(devId2, devId1);

    // 2. pushLocation uses ${lineId}_driver_main for driver and ${lineId}_pax_${deviceId} for passenger, passes signal, checks res.ok
    const locBodies = [];
    const signals = [];
    globalThis.fetch = async (_url, opts) => {
      signals.push(Boolean(opts && opts.signal));
      locBodies.push(JSON.parse(opts.body));
      return { ok: true };
    };
    assert.equal(await KhattiCloud.pushLocation('l1', 'driver', 'أبو محمد', 33.3, 44.4, 25), true);
    assert.equal(await KhattiCloud.pushLocation('l1', 'passenger', 'أحمد', 33.31, 44.41, 0), true);
    assert.equal(locBodies[0].id, 'l1_driver_main');
    assert.equal(locBodies[1].id, `l1_pax_${devId1}`);
    assert.deepEqual(signals, [true, true]);

    // 3. pushAttendance includes on_conflict=student_id,trip_date,line_id and signal
    let attUrl = '';
    let attSignal = false;
    globalThis.fetch = async (url, opts) => {
      attUrl = url;
      attSignal = Boolean(opts && opts.signal);
      return { ok: true };
    };
    assert.equal(await KhattiCloud.pushAttendance({ id: 'st_1', name: 'أحمد', stop: 'الكرادة', code: 'KH-2233', status: 'boarded' }, 'l1', '2026-10-15'), true);
    assert.equal(attUrl, 'https://test-proj.supabase.co/rest/v1/khatti_attendance?on_conflict=student_id,trip_date,line_id');
    assert.equal(attSignal, true);

    // 4. Non-OK responses return false (or null for pullLocations) and pullLocations passes signal
    let pullSignal = false;
    globalThis.fetch = async (_url, opts) => {
      pullSignal = Boolean(opts && opts.signal);
      return { ok: false, status: 503 };
    };
    assert.equal(await KhattiCloud.pullLocations('l1'), null);
    assert.equal(pullSignal, true);
    assert.equal(await KhattiCloud.pushLocation('l1', 'driver', 'أبو محمد', 33.3, 44.4, 0), false);
    assert.equal(await KhattiCloud.pushAttendance({ id: 'st_1', name: 'أحمد', stop: 'الكرادة', code: 'KH-2233', status: 'waiting' }, 'l1', '2026-10-15'), false);
    assert.equal(await KhattiCloud.pushBooking({ id: 'b1', lineId: 'l1' }), false);
    assert.equal(await KhattiCloud.pushRating({ tripId: 't1', lineId: 'l1', role: 'passenger', stars: 5 }), false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('pushLine and deleteLine enforce session driver_id, choose PATCH vs POST, send Bearer token, and handle missing session', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    // 1. Without session in cloud mode -> returns false without making network request
    let fetchCount = 0;
    globalThis.fetch = async () => { fetchCount++; return { ok: true }; };
    assert.equal(await KhattiCloud.pushLine({ from: 'الكرادة', to: 'الجادرية' }), false);
    assert.equal(await KhattiCloud.deleteLine('l1'), false);
    assert.equal(fetchCount, 0);

    // 2. With active driver session -> POST when id is absent, forces driver_id from session (ignoring payload driver_id), sends Bearer header
    localStorage.setItem('khatti_demo_v1_auth', JSON.stringify({
      access_token: 'driver_jwt_token_abc',
      refresh_token: 'driver_ref_token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'session-driver-uuid', email: 'driver@khatti.iq', role: 'driver' }
    }));

    const requests = [];
    globalThis.fetch = async (url, opts) => {
      requests.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
      return { ok: true };
    };

    const created = await KhattiCloud.pushLine({
      driver_id: 'spoofed-other-driver-id',
      driverId: 'spoofed-other-driver-id-2',
      from: 'المنصور',
      to: 'جامعة بغداد (الجادرية)',
      vehicle: 'كيا بيجاس 2023',
      plate: 'بغداد 99881',
      comp: 'girls',
      price: 75000,
      seats: 14,
      free: 10,
      go: '07:15',
      back: '14:45',
      pickups: ['الرواد', '14 رمضان']
    });
    assert.equal(created, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://test-proj.supabase.co/rest/v1/khatti_lines');
    assert.equal(requests[0].opts.method, 'POST');
    assert.equal(requests[0].opts.headers.Authorization, 'Bearer driver_jwt_token_abc');
    assert.equal(requests[0].opts.headers.apikey, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key');
    assert.ok(requests[0].opts.signal);
    assert.match(requests[0].body.id, /^l_[0-9a-z]+$/);
    assert.equal(requests[0].body.driver_id, 'session-driver-uuid');
    assert.equal(requests[0].body.from_area, 'المنصور');
    assert.equal(requests[0].body.to_dest, 'جامعة بغداد (الجادرية)');

    // 3. With existing id -> uses PATCH on /rest/v1/khatti_lines?id=eq.<id> and still forces session driver_id
    const updated = await KhattiCloud.pushLine({
      id: 'l_existing_42',
      driver_id: 'attacker-id',
      from: 'الأعظمية',
      to: 'الباب المعظم',
      price: 65000,
      seats: 12,
      free: 4
    });
    assert.equal(updated, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].url, 'https://test-proj.supabase.co/rest/v1/khatti_lines?id=eq.l_existing_42');
    assert.equal(requests[1].opts.method, 'PATCH');
    assert.equal(requests[1].opts.headers.Authorization, 'Bearer driver_jwt_token_abc');
    assert.equal(requests[1].body.id, 'l_existing_42');
    assert.equal(requests[1].body.driver_id, 'session-driver-uuid');

    // 4. deleteLine sends DELETE to /rest/v1/khatti_lines?id=eq.<id> with Bearer header
    const deleted = await KhattiCloud.deleteLine('l_existing_42');
    assert.equal(deleted, true);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].url, 'https://test-proj.supabase.co/rest/v1/khatti_lines?id=eq.l_existing_42');
    assert.equal(requests[2].opts.method, 'DELETE');
    assert.equal(requests[2].opts.headers.Authorization, 'Bearer driver_jwt_token_abc');

    // 5. Non-OK response returns false
    globalThis.fetch = async () => ({ ok: false, status: 403 });
    assert.equal(await KhattiCloud.pushLine({ id: 'l_existing_42', from: 'الكرادة', to: 'الجادرية' }), false);
    assert.equal(await KhattiCloud.deleteLine('l_existing_42'), false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('H1, H4, H5, M2, M3: getLinePhone, createBookingAtomic, K.pname session identity, rater_user_id & hasOtherRating, and markAbsent', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    // Unconfigured guards
    assert.equal(await KhattiCloud.getLinePhone('l1'), null);
    assert.equal(await KhattiCloud.createBookingAtomic({ lineId: 'l1', seats: ['مقعد 1'] }), null);
    assert.equal(await KhattiCloud.hasOtherRating('t1', 'passenger'), false);
    assert.equal(await KhattiCloud.markAbsent('l1', 'st_1', '2026-10-15'), false);

    // Configure cloud + session
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));
    localStorage.setItem('khatti_demo_v1_auth', JSON.stringify({
      access_token: 'pax_jwt_123',
      refresh_token: 'pax_ref_123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'pax-uuid-55', email: 'zainab.iq@khatti.iq', role: 'passenger', name: 'زينب قاسم' }
    }));

    // 1. H1: getLinePhone calls /rest/v1/rpc/get_line_phone
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
      return { ok: true, json: async () => '07701234567' };
    };
    assert.equal(await KhattiCloud.getLinePhone('l1'), '07701234567');
    assert.equal(calls[0].url, 'https://test-proj.supabase.co/rest/v1/rpc/get_line_phone');
    assert.deepEqual(calls[0].body, { p_line_id: 'l1' });

    globalThis.fetch = async () => ({ ok: true, json: async () => null });
    assert.equal(await KhattiCloud.getLinePhone('l2'), null);

    // 2. H4: createBookingAtomic sends atomic RPC payload without user_id and returns booking id or null
    let atomicCall = null;
    globalThis.fetch = async (url, opts) => {
      atomicCall = { url, body: JSON.parse(opts.body) };
      return { ok: true, json: async () => 'bk_server_9001' };
    };
    const bkId = await KhattiCloud.createBookingAtomic({
      lineId: 'l1',
      user_id: 'attacker-uid',
      passengerName: 'زينب قاسم',
      phone: '07701112233',
      plan: 'دوام كامل',
      seats: ['مقعد 1', 'مقعد 2'],
      pickup: 'الكرادة',
      returnShift: '14:30',
      payment: { method: 'zaincash', status: 'pending', ref: 'REF-77' }
    });
    assert.equal(bkId, 'bk_server_9001');
    assert.equal(atomicCall.url, 'https://test-proj.supabase.co/rest/v1/rpc/create_booking_atomic');
    assert.deepEqual(atomicCall.body, {
      p_line_id: 'l1',
      p_passenger_name: 'زينب قاسم',
      p_phone: '07701112233',
      p_plan_label: 'دوام كامل',
      p_seats: ['مقعد 1', 'مقعد 2'],
      p_pickup: 'الكرادة',
      p_return_shift: '14:30',
      p_pay_method: 'zaincash',
      p_pay_status: 'pending',
      p_pay_ref: 'REF-77'
    });

    globalThis.fetch = async () => ({ ok: true, json: async () => null });
    assert.equal(await KhattiCloud.createBookingAtomic({ lineId: 'l1', seats: ['مقعد 1'] }), null);

    // 3. M2: pushRating sets rater_user_id from session; hasOtherRating calls /rest/v1/rpc/has_other_rating
    let ratingBody = null;
    globalThis.fetch = async (_url, opts) => {
      ratingBody = JSON.parse(opts.body);
      return { ok: true };
    };
    assert.equal(await KhattiCloud.pushRating({ tripId: 't99', lineId: 'l1', role: 'passenger', stars: 5, comment: 'رائع' }), true);
    assert.equal(ratingBody.rater_user_id, 'pax-uuid-55');

    let otherCall = null;
    globalThis.fetch = async (url, opts) => {
      otherCall = { url, body: JSON.parse(opts.body) };
      return { ok: true, json: async () => true };
    };
    assert.equal(await KhattiCloud.hasOtherRating('t99', 'passenger'), true);
    assert.equal(otherCall.url, 'https://test-proj.supabase.co/rest/v1/rpc/has_other_rating');
    assert.deepEqual(otherCall.body, { p_trip_id: 't99', p_role: 'passenger' });

    // 4. M3: markAbsent calls /rest/v1/rpc/mark_absent
    let absentCall = null;
    globalThis.fetch = async (url, opts) => {
      absentCall = { url, body: JSON.parse(opts.body) };
      return { ok: true, json: async () => true };
    };
    assert.equal(await KhattiCloud.markAbsent('l1', 'st_1', '2026-10-15'), true);
    assert.equal(absentCall.url, 'https://test-proj.supabase.co/rest/v1/rpc/mark_absent');
    assert.deepEqual(absentCall.body, { p_line_id: 'l1', p_student_id: 'st_1', p_trip_date: '2026-10-15' });

    // 5. H5: K.pname() derives passenger name from KhattiAuth session when cloud-configured, and uses local me when unconfigured
    globalThis.KhattiCore = require('../assets/core');
    globalThis.KhattiAuth = require('../assets/auth');
    globalThis.document = {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    };
    globalThis.location = { pathname: '/passenger/booking.html' };
    if (!globalThis.K) {
      const fs = require('node:fs');
      const vm = require('node:vm');
      vm.runInThisContext(fs.readFileSync(require.resolve('../assets/app'), 'utf8') + '\n;globalThis.K = K;');
    }

    localStorage.setItem('khatti_demo_v1_me', JSON.stringify({ name: 'أحمد علي المحلي', phone: '07701112233' }));
    assert.equal(globalThis.K.pname(), 'زينب قاسم');

    // When session has only email without name -> uses email prefix
    localStorage.setItem('khatti_demo_v1_auth', JSON.stringify({
      access_token: 'pax_jwt_123',
      refresh_token: 'pax_ref_123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'pax-uuid-55', email: 'huda.student@khatti.iq', role: 'passenger' }
    }));
    assert.equal(globalThis.K.pname(), 'huda.student');

    // When cloud is unconfigured -> falls back to local me.name
    localStorage.removeItem('khatti_supabase_config_v1');
    assert.equal(globalThis.K.pname(), 'أحمد علي المحلي');
    globalThis.KhattiAuth.cancelRefreshTimer();
  } finally {
    globalThis.fetch = origFetch;
  }
});

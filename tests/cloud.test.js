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
    assert.equal(capturedUrl, 'https://test-proj.supabase.co/rest/v1/khatti_lines?select=*');
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
    assert.equal(l.phone, '07701234567');
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
    assert.deepEqual(l.pickups, []);

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

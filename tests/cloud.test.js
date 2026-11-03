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

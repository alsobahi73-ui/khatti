const { test } = require('node:test');
const assert = require('node:assert/strict');
const KhattiAuth = require('../assets/auth');
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

test('isSessionValid and getSession enforce >= 60s margin and refresh once when expiring/expired', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    const nowSec = 1700000000;
    const nowMs = nowSec * 1000;

    // 1. Valid when expires_at is >= 60s in the future
    assert.equal(KhattiAuth.isSessionValid({ access_token: 'tok', expires_at: nowSec + 60 }, nowMs), true);
    assert.equal(KhattiAuth.isSessionValid({ access_token: 'tok', expires_at: nowSec + 300 }, nowMs), true);

    // 2. Invalid when expires_at is < 60s away or missing token
    assert.equal(KhattiAuth.isSessionValid({ access_token: 'tok', expires_at: nowSec + 59 }, nowMs), false);
    assert.equal(KhattiAuth.isSessionValid({ access_token: 'tok', expires_at: nowSec - 10 }, nowMs), false);
    assert.equal(KhattiAuth.isSessionValid({ access_token: '', expires_at: nowSec + 300 }, nowMs), false);
    assert.equal(KhattiAuth.isSessionValid(null, nowMs), false);

    // 3. getSession returns stored session without calling fetch when valid (>= 60s left)
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    const futureExp = Math.floor(Date.now() / 1000) + 120;
    localStorage.setItem('khatti_demo_v1_auth', JSON.stringify({
      access_token: 'valid_tok',
      refresh_token: 'ref_tok',
      expires_at: futureExp,
      user: { id: 'u1', email: 'a@b.com', role: 'passenger' }
    }));

    let fetchCount = 0;
    globalThis.fetch = async () => { fetchCount++; return { ok: true }; };
    const sess1 = await KhattiAuth.getSession();
    assert.equal(sess1.access_token, 'valid_tok');
    assert.equal(fetchCount, 0);

    // 4. getSession refreshes once when expires_at is < 60s from now
    const nearExp = Math.floor(Date.now() / 1000) + 30;
    localStorage.setItem('khatti_demo_v1_auth', JSON.stringify({
      access_token: 'expiring_tok',
      refresh_token: 'ref_tok_2',
      expires_at: nearExp,
      user: { id: 'u1', email: 'a@b.com', role: 'driver' }
    }));

    let refreshUrl = '';
    globalThis.fetch = async (url) => {
      fetchCount++;
      refreshUrl = url;
      return {
        ok: true,
        json: async () => ({
          access_token: 'refreshed_tok',
          refresh_token: 'ref_tok_3',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'u1', email: 'a@b.com', user_metadata: { role: 'driver' } }
        })
      };
    };

    const sess2 = await KhattiAuth.getSession();
    assert.equal(fetchCount, 1);
    assert.equal(refreshUrl, 'https://test-proj.supabase.co/auth/v1/token?grant_type=refresh_token');
    assert.equal(sess2.access_token, 'refreshed_tok');
    assert.equal(sess2.user.role, 'driver');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('translateError translates common GoTrue errors into clear Arabic messages', () => {
  assert.match(
    KhattiAuth.translateError({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    /بيانات دخول خاطئة/
  );
  assert.match(
    KhattiAuth.translateError({ error_code: 'email_not_confirmed', msg: 'Email not confirmed' }),
    /البريد غير مؤكّد بعد/
  );
  assert.match(
    KhattiAuth.translateError({ code: 'user_already_exists', message: 'User already registered' }),
    /بريد مسجّل مسبقًا/
  );
  assert.match(
    KhattiAuth.translateError({ error_code: 'weak_password', message: 'Password should be at least 6 characters' }),
    /كلمة مرور ضعيفة/
  );
});

test('authHeaders always returns apikey and adds Authorization Bearer when session exists', () => {
  setupEnv();
  localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
    url: 'https://test-proj.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
  }));

  // 1. Without session -> only apikey
  const hNoSess = KhattiAuth.authHeaders();
  assert.deepEqual(hNoSess, {
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
  });
  assert.equal('Authorization' in hNoSess, false);

  // 2. With session -> apikey + Authorization Bearer
  localStorage.setItem('khatti_demo_v1_auth', JSON.stringify({
    access_token: 'jwt_user_token_123',
    refresh_token: 'ref_123',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'u-99', email: 'driver@khatti.iq', role: 'driver' }
  }));

  const hWithSess = KhattiAuth.authHeaders();
  assert.deepEqual(hWithSess, {
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key',
    Authorization: 'Bearer jwt_user_token_123'
  });
});

test('stripLinePhone and fetchLines remove phone for non-owners and keep it only when session user.id === line.driver_id', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    // 1. Pure unit check on stripLinePhone
    const sampleLine = { id: 'l1', driver_id: 'drv-uuid-1', phone: '07701234567', from: 'الكرادة' };
    const strippedAnon = KhattiAuth.stripLinePhone(sampleLine, null);
    assert.equal('phone' in strippedAnon, false);

    const strippedOther = KhattiAuth.stripLinePhone(sampleLine, {
      user: { id: 'other-uuid', role: 'passenger' }
    });
    assert.equal('phone' in strippedOther, false);

    const keptOwner = KhattiAuth.stripLinePhone(sampleLine, {
      user: { id: 'drv-uuid-1', role: 'driver' }
    });
    assert.equal(keptOwner.phone, '07701234567');

    // 2. fetchLines requests explicit columns without phone and strips phone for non-owner
    let requestedUrl = '';
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ([
          { id: 'l1', driver_id: 'drv-uuid-1', driver_name: 'أبو محمد', phone: '07701112222', from_area: 'الكرادة', to_dest: 'الجادرية' },
          { id: 'l2', driver_id: 'drv-uuid-2', driver_name: 'سائق آخر', phone: '07709998888', from_area: 'المنصور', to_dest: 'الجادرية' }
        ])
      };
    };

    localStorage.setItem('khatti_demo_v1_auth', JSON.stringify({
      access_token: 'tok_drv_1',
      refresh_token: 'ref_1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'drv-uuid-1', email: 'd1@khatti.iq', role: 'driver' }
    }));

    const lines = await KhattiCloud.fetchLines();
    assert.equal(requestedUrl.includes('select=*'), false);
    assert.equal(requestedUrl.includes('phone'), false);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].phone, '07701112222'); // owner keeps phone
    assert.equal('phone' in lines[1], false);    // non-owner has phone deleted
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('recover/reset: builds recover payload with redirect_to, parses recovery hash into session, and sends PUT /auth/v1/user with Bearer token', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  const origLocation = globalThis.location;
  try {
    globalThis.location = {
      origin: 'https://khatti.example.iq',
      pathname: '/auth.html',
      hash: ''
    };

    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    // 1. buildRecoverPayload builds { email, redirect_to } using current origin + /auth.html by default
    const payloadDefault = KhattiAuth.buildRecoverPayload('  user@khatti.iq  ');
    assert.deepEqual(payloadDefault, {
      email: 'user@khatti.iq',
      redirect_to: 'https://khatti.example.iq/auth.html'
    });

    const payloadCustom = KhattiAuth.buildRecoverPayload('driver@khatti.iq', 'https://custom.domain/auth.html');
    assert.deepEqual(payloadCustom, {
      email: 'driver@khatti.iq',
      redirect_to: 'https://custom.domain/auth.html'
    });

    // 2. recoverPassword sends POST to {url}/auth/v1/recover with payload
    let recoverReq = null;
    globalThis.fetch = async (url, opts) => {
      recoverReq = { url, opts, body: JSON.parse(opts.body) };
      return { ok: true, json: async () => ({}) };
    };
    const recRes = await KhattiAuth.recoverPassword('user@khatti.iq');
    assert.equal(recRes.ok, true);
    assert.equal(recoverReq.url, 'https://test-proj.supabase.co/auth/v1/recover');
    assert.equal(recoverReq.opts.method, 'POST');
    assert.equal(recoverReq.opts.headers.apikey, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key');
    assert.deepEqual(recoverReq.body, {
      email: 'user@khatti.iq',
      redirect_to: 'https://khatti.example.iq/auth.html'
    });

    // 3. parseRecoveryHash ignores non-recovery hashes and parses valid recovery hash while saving session
    assert.equal(KhattiAuth.parseRecoveryHash(''), null);
    assert.equal(KhattiAuth.parseRecoveryHash('#access_token=abc&type=signup'), null);
    assert.equal(KhattiAuth.parseRecoveryHash('#type=recovery'), null);

    const parsed = KhattiAuth.parseRecoveryHash('#access_token=rec_jwt_999&refresh_token=rec_ref_888&expires_in=3600&type=recovery');
    assert.ok(parsed);
    assert.equal(parsed.type, 'recovery');
    assert.equal(parsed.access_token, 'rec_jwt_999');
    assert.equal(parsed.refresh_token, 'rec_ref_888');
    const storedSess = KhattiAuth.readStoredSession();
    assert.ok(storedSess);
    assert.equal(storedSess.access_token, 'rec_jwt_999');
    assert.equal(storedSess.refresh_token, 'rec_ref_888');

    // 4. resetPassword sends PUT to {url}/auth/v1/user with Bearer token and updates password
    let resetReq = null;
    globalThis.fetch = async (url, opts) => {
      resetReq = { url, opts, body: JSON.parse(opts.body) };
      return {
        ok: true,
        json: async () => ({
          id: 'u-rec-1',
          email: 'driver@khatti.iq',
          user_metadata: { role: 'driver' }
        })
      };
    };

    const weakRes = await KhattiAuth.resetPassword('123');
    assert.equal(weakRes.ok, false);
    assert.match(weakRes.error, /كلمة مرور ضعيفة/);

    const resetRes = await KhattiAuth.resetPassword('newStrongPass123');
    assert.equal(resetRes.ok, true);
    assert.equal(resetReq.url, 'https://test-proj.supabase.co/auth/v1/user');
    assert.equal(resetReq.opts.method, 'PUT');
    assert.equal(resetReq.opts.headers.Authorization, 'Bearer rec_jwt_999');
    assert.deepEqual(resetReq.body, { password: 'newStrongPass123' });
    assert.equal(resetRes.user.role, 'driver');
  } finally {
    globalThis.fetch = origFetch;
    globalThis.location = origLocation;
  }
});

test('L1 & H5: schedules silent refresh 60s before expiry, reschedules after refresh, and derives passenger name from session', async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  try {
    localStorage.setItem('khatti_supabase_config_v1', JSON.stringify({
      url: 'https://test-proj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_length_key'
    }));

    const nowMs = 1700000000000;
    const expSec = 1700000300; // 300s in future -> refresh delay should be (300 - 60) * 1000 = 240000ms
    const delay = KhattiAuth.computeRefreshDelayMs({ access_token: 'tok', expires_at: expSec }, nowMs);
    assert.equal(delay, 240000);

    // Saving a valid session schedules the refresh timer and preserves user name
    const futureExp1 = Math.floor(Date.now() / 1000) + 300;
    const saved = KhattiAuth.saveSession({
      access_token: 'tok_initial',
      refresh_token: 'ref_initial',
      expires_at: futureExp1,
      user: { id: 'u10', email: 'noor.iq@khatti.iq', user_metadata: { name: 'نور الهدى', role: 'passenger' } }
    });
    assert.equal(saved.user.name, 'نور الهدى');
    assert.equal(KhattiAuth.getPassengerName(saved), 'نور الهدى');
    assert.ok(KhattiAuth._refreshTimer !== null);
    assert.equal(KhattiAuth._refreshScheduledExp, futureExp1);

    // Email prefix fallback when name metadata is absent
    assert.equal(KhattiAuth.getPassengerName({
      access_token: 'tok_2',
      user: { id: 'u11', email: 'karar.ali@khatti.iq', role: 'passenger' }
    }), 'karar.ali');

    // Refreshing session reschedules timer for the new expires_at
    const futureExp2 = Math.floor(Date.now() / 1000) + 1800;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        access_token: 'tok_refreshed',
        refresh_token: 'ref_next',
        expires_at: futureExp2,
        user: { id: 'u10', email: 'noor.iq@khatti.iq', user_metadata: { name: 'نور الهدى', role: 'passenger' } }
      })
    });
    const refreshed = await KhattiAuth.refreshSession();
    assert.ok(refreshed);
    assert.equal(refreshed.access_token, 'tok_refreshed');
    assert.ok(KhattiAuth._refreshTimer !== null);
    assert.equal(KhattiAuth._refreshScheduledExp, futureExp2);

    // Clearing session cancels the timer
    KhattiAuth.clearSession();
    assert.equal(KhattiAuth._refreshTimer, null);
  } finally {
    KhattiAuth.cancelRefreshTimer();
    globalThis.fetch = origFetch;
  }
});

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { pathname: '/signup.html', search: '', hash: '' };
const requests = [];
let mode = 'signup';
const user = { id: '99999999-9999-4999-8999-999999999999', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', email_confirmed_at: '2026-11-25T00:00:00Z', user_metadata: {}, identities: [], created_at: '2026-11-25T00:00:00Z' };
const profile = { id: user.id, nickname: '테스트회원', created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T00:00:00Z' };
const originalFetch = globalThis.fetch;
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } }); }
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const body = init.body ? JSON.parse(init.body) : null;
  requests.push({ url, method: init.method || 'GET', body });
  if (url.pathname.endsWith('/signup')) {
    if (mode === 'signup-error') return json({ code: 'weak_password', msg: 'Weak password' }, 422);
    return json({ ...user, email_confirmed_at: null, identities: [{ provider: 'email' }] });
  }
  if (url.pathname.endsWith('/token')) {
    if (mode === 'login-error') return json({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
    return json({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.test', refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user });
  }
  if (url.pathname.endsWith('/user')) return json(user);
  if (url.pathname.includes('/rest/v1/harupick_members')) {
    if (mode === 'profile-error') return json({ code: '42501', message: 'permission denied' }, 403);
    if (init.method === 'POST') return json({ ...profile, nickname: body.nickname }, 201);
    return json(mode === 'profile-missing' ? [] : [profile]);
  }
  if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
  throw new Error('Unexpected network call: ' + url.pathname);
};
const { authClient, registerMember, getCurrentMember, createMember, authError } = await import('../auth-client.js');
after(async () => { await authClient.auth.stopAutoRefresh(); globalThis.fetch = originalFetch; });

test('signup reaches Auth with a scoped app marker and confirmation URL', async () => {
  mode = 'signup';
  const result = await registerMember({ nickname: '테스트회원', email: 'test@example.com', password: 'NotARealPassword-1' });
  assert.equal(result.signedIn, false);
  const request = requests.find(r => r.url.pathname.endsWith('/signup'));
  assert.deepEqual(request.body.data, { harupick_app: 'harupick', harupick_nickname: '테스트회원' });
  assert.equal(request.url.searchParams.get('redirect_to'), 'https://harupick-travel.vercel.app/email-confirmed.html');
  assert.ok(request.body.code_challenge);
  assert.equal(request.body.data.password, undefined);
});

test('server rejection never becomes a successful signup', async () => {
  mode = 'signup-error';
  await assert.rejects(registerMember({ nickname: '테스트회원', email: 'test@example.com', password: 'NotARealPassword-1' }), error => error.code === 'weak_password');
  assert.match(authError({ code: 'weak_password' }), /비밀번호/);
});

test('invalid credentials remain signed out', async () => {
  mode = 'login-error';
  const result = await authClient.auth.signInWithPassword({ email: 'test@example.com', password: 'NotARealPassword-1' });
  assert.equal(result.error.code, 'invalid_credentials');
  assert.equal(await getCurrentMember(), null);
});

test('login retrieves only the authenticated member profile', async () => {
  mode = 'login';
  const result = await authClient.auth.signInWithPassword({ email: 'test@example.com', password: 'NotARealPassword-1' });
  assert.equal(result.error, null);
  const current = await getCurrentMember();
  assert.equal(current.profile.nickname, profile.nickname);
  assert.equal(requests.at(-1).url.searchParams.get('id'), 'eq.' + user.id);
});

test('existing shared Auth account can create only its own Harupick profile', async () => {
  mode = 'profile-missing';
  const member = await createMember('  새여행자  ');
  assert.equal(member.nickname, '새여행자');
  const request = requests.at(-1);
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.body, { id: user.id, nickname: '새여행자' });
});

test('profile failures are not hidden; logout clears the local session', async () => {
  mode = 'profile-error';
  await assert.rejects(getCurrentMember(), error => error.code === '42501');
  mode = 'login';
  const result = await authClient.auth.signOut({ scope: 'local' });
  assert.equal(result.error, null);
  assert.equal(await getCurrentMember(), null);
});

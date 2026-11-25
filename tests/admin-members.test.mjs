import test, { after } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { pathname: '/admin.html', search: '', hash: '' };
const originalFetch = globalThis.fetch;
let response, code = 200, calls = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  assert.ok(url.pathname.startsWith('/rest/v1/rpc/harupick_admin_member'));
  calls.push({ path: url.pathname, body: JSON.parse(init.body) });
  return new Response(JSON.stringify(response), { status: code, headers: { 'Content-Type': 'application/json' } });
};
const { listMembers, getMember, accessFailure } = await import('../admin-members-client.js');
const { authClient } = await import('../auth-client.js');
after(async () => { await authClient.auth.stopAutoRefresh(); globalThis.fetch = originalFetch; });
const id = '77777777-7777-4777-8777-777777777777';
test('directory RPC sends bounded pagination and literal search parameters', async () => {
  code = 200; response = { members: [{ id }], total: 21, page: 2, page_size: 20, pages: 2 };
  const result = await listMembers({ query: '  여행_%  ', page: 2 });
  assert.equal(result.total, 21);
  assert.deepEqual(calls.at(-1), { path: '/rest/v1/rpc/harupick_admin_members', body: { p_query: '여행_%', p_page: 2, p_page_size: 20 } });
});
test('invalid input is rejected before network calls', async () => {
  const count = calls.length;
  for (const params of [{ query: 'a'.repeat(101) }, { page: 0 }, { page: 1.5 }, { pageSize: 51 }]) await assert.rejects(listMembers(params));
  await assert.rejects(getMember('../auth/users'));
  assert.equal(calls.length, count);
});
test('member detail uses selected UUID and supports a missing profile', async () => {
  code = 200; response = { id, nickname: '<img src=x onerror=alert(1)>' };
  assert.equal((await getMember(id)).id, id);
  assert.deepEqual(calls.at(-1).body, { p_member_id: id });
  response = null; assert.equal(await getMember(id), null);
});
test('permission and server errors never become empty successful lists', async () => {
  code = 403; response = { code: '42501', message: 'Administrator access required' };
  await assert.rejects(listMembers(), error => accessFailure(error) === 'denied');
  code = 400; response = { code: 'PGRST000', message: 'Unavailable' };
  await assert.rejects(getMember(id), error => accessFailure(error) === null);
  assert.equal(accessFailure({ status: 401 }), 'signed-out');
});
test('unexpected data fails closed instead of displaying another member', async () => {
  code = 200; response = { id: 'different' };
  await assert.rejects(getMember(id));
  response = { members: [], total: 0, page: 1, page_size: 200, pages: 1 };
  await assert.rejects(listMembers());
});


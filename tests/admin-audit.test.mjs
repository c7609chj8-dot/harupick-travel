import test, { after } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { pathname: '/admin.html', search: '', hash: '' };
const originalFetch = globalThis.fetch;
let response, status = 200, calls = [];
globalThis.fetch = async (input, init) => {
  assert.ok(String(input).endsWith('/rpc/harupick_admin_audit'));
  assert.equal(init.method, 'POST');
  calls.push(JSON.parse(init.body));
  return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
};
const { listAudit, getAudit } = await import('../admin-audit-client.js');
const { authClient } = await import('../auth-client.js');
const { accessFailure } = await import('../admin-members-client.js');
after(async () => { await authClient.auth.stopAutoRefresh(); globalThis.fetch = originalFetch; });
const id = '77777777-7777-4777-8777-777777777777';
const event = { id, event: 'trip.archived', actor_type: 'admin', actor_label: '<img src=x onerror=alert(1)>', target_label: '여행_%', changed_fields: ['status','revision'], occurred_at: '2026-11-25T15:00:00Z' };
test('audit search sends literal query and inclusive Korean calendar boundaries', async () => {
  status = 200; response = { events: [event], total: 21, page: 2, pages: 2 };
  await listAudit({ query: '  여행_%  ', event: 'trip.archived', page: 2, from: '2026-11-25', until: '2026-11-26' });
  assert.deepEqual(calls.at(-1), { p_query: '여행_%', p_event: 'trip.archived', p_page: 2, p_from: '2026-11-25', p_until: '2026-11-26' });
});
test('invalid calendar ranges, event filters and pagination make no requests', async () => {
  const count = calls.length;
  for (const params of [{ from: '2026-02-30' }, { from: '2026-11-26', until: '2026-11-25' }, { event: 'constructor' }, { query: 'x'.repeat(101) }, { page: 0 }, { page: 1.5 }]) await assert.rejects(listAudit(params));
  await assert.rejects(getAudit('../auth/users'));
  assert.equal(calls.length, count);
});
test('detail includes before/after values for the requested record only', async () => {
  response = { ...event, before_data: { status: 'active' }, after_data: { status: 'archived' } };
  const result = await getAudit(id);
  assert.deepEqual(calls.at(-1), { p_id: id });
  assert.equal(result.after_data.status, 'archived');
  assert.equal(result.actor_label, event.actor_label);
});
test('a missing record is distinct from transport or permission errors', async () => {
  response = null; assert.equal(await getAudit(id), null);
  status = 403; response = { code: '42501', message: 'Denied' };
  await assert.rejects(listAudit(), error => accessFailure(error) === 'denied');
  status = 401; response = { code: 'PGRST301', message: 'Expired' };
  await assert.rejects(getAudit(id), error => accessFailure(error) === 'signed-out');
  status = 400; response = { code: 'PGRST000', message: 'Unavailable' };
  await assert.rejects(listAudit(), error => accessFailure(error) === null);
});
test('invalid server pages and event payloads fail closed', async () => {
  status = 200;
  for (const data of [
    { events: [], total: -1, page: 1, pages: 1 },
    { events: [], total: 0, page: 2, pages: 1 },
    { events: Array(21).fill(event), total: 21, page: 1, pages: 2 },
    { events: [{ ...event, event: 'unsupported' }], total: 1, page: 1, pages: 1 },
    { events: [{ ...event, occurred_at: 'invalid' }], total: 1, page: 1, pages: 1 }
  ]) { response = data; await assert.rejects(listAudit()); }
});
test('wrong record identity or malformed change objects are rejected', async () => {
  response = { ...event, id: '88888888-8888-4888-8888-888888888888', before_data: null, after_data: {} };
  await assert.rejects(getAudit(id));
  response = { ...event, before_data: [], after_data: {} };
  await assert.rejects(getAudit(id));
  response = { ...event, before_data: {}, after_data: 'malformed' };
  await assert.rejects(getAudit(id));
});
test('empty filter dates are passed as null instead of limiting the history', async () => {
  response = { events: [], total: 0, page: 1, pages: 1 };
  const result = await listAudit();
  assert.equal(result.total, 0);
  assert.deepEqual(calls.at(-1), { p_query: '', p_event: 'all', p_page: 1, p_from: null, p_until: null });
});


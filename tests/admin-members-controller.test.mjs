import test, { after } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { pathname: '/admin.html', search: '', hash: '' };
const { createMembersController } = await import('../admin-members-controller.js');
const { authClient } = await import('../auth-client.js');
after(async () => { await authClient.auth.stopAutoRefresh(); });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setup(list, detail = async id => ({ id })) {
  const lists = [], details = [], failures = [];
  const controller = createMembersController({ list, detail, onList: value => lists.push(value), onDetail: value => details.push(value), onAccessFailure: value => failures.push(value) });
  return { controller, lists, details, failures };
}
test('inactive console does not request personal data', async () => {
  const { controller, lists, details } = setup(() => { throw Error('unexpected'); });
  await controller.loadList({}); await controller.loadDetail('x');
  assert.equal(lists.length + details.length, 0);
});
test('latest search wins even if an older response arrives last', async () => {
  const old = deferred(), current = deferred();
  const { controller, lists } = setup(({ query }) => query === 'old' ? old.promise : current.promise);
  controller.activate();
  const a = controller.loadList({ query: 'old' }), b = controller.loadList({ query: 'new' });
  current.resolve({ total: 1, marker: 'new' }); await b;
  old.resolve({ total: 99, marker: 'old' }); await a;
  assert.equal(lists.at(-1).data.marker, 'new');
});
test('sign-out invalidates in-flight member list and detail', async () => {
  const list = deferred(), detail = deferred();
  const { controller, lists, details } = setup(() => list.promise, () => detail.promise);
  controller.activate();
  const a = controller.loadList({}), b = controller.loadDetail('x');
  controller.deactivate(); list.resolve({ total: 1 }); detail.resolve({ id: 'x' });
  await Promise.all([a, b]);
  assert.equal(lists.at(-1).state, 'idle'); assert.equal(details.at(-1).state, 'idle');
});
test('choosing another member discards a late detail response', async () => {
  const old = deferred();
  const { controller, details } = setup(async () => ({}), id => id === 'old' ? old.promise : Promise.resolve({ id }));
  controller.activate(); const a = controller.loadDetail('old');
  await controller.loadDetail('new'); old.resolve({ id: 'old' }); await a;
  assert.equal(details.at(-1).data.id, 'new');
});
test('searching or closing a detail prevents it from reopening late', async () => {
  const pending = deferred();
  const { controller, details } = setup(async () => ({}), () => pending.promise);
  controller.activate(); const request = controller.loadDetail('x');
  await controller.loadList({ query: 'new' }); pending.resolve({ id: 'x' }); await request;
  assert.equal(details.at(-1).state, 'idle');
});
test('revocation clears all personal data and disables further reads', async () => {
  const { controller, lists, details, failures } = setup(async () => { throw { code: '42501' }; });
  controller.activate(); await controller.loadList({});
  assert.deepEqual(failures, ['denied']);
  assert.equal(lists.at(-1).state, 'idle'); assert.equal(details.at(-1).state, 'idle');
  await controller.loadDetail('x'); assert.equal(details.at(-1).state, 'idle');
});
test('network errors and missing members have distinct recoverable states', async () => {
  const { controller, lists, details } = setup(async () => { throw Error('offline'); }, async () => null);
  controller.activate(); await controller.loadList({}); await controller.loadDetail('x');
  assert.equal(lists.at(-1).state, 'error'); assert.equal(details.at(-1).state, 'missing');
});
test('a closed detail ignores both late success and late authorization errors', async () => {
  const pending = deferred();
  const { controller, details, failures } = setup(async () => ({}), () => pending.promise);
  controller.activate(); const request = controller.loadDetail('x'); controller.closeDetail();
  pending.reject({ code: '42501' }); await request;
  assert.equal(details.at(-1).state, 'idle'); assert.deepEqual(failures, []);
});


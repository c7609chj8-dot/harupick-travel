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
const member = (changes={}) => ({id,nickname:'하루픽회원',email:'member@example.com',created_at:'2026-11-25T15:00:00.000001Z',email_confirmed:true,status:'active',...changes});
const listing = (members=[member()]) => ({members,total:members.length,page:1,page_size:20,pages:1});
test('directory RPC sends bounded pagination and literal search parameters', async () => {
  code = 200; response = { members: [member()], total: 21, page: 2, page_size: 20, pages: 2 };
  const result = await listMembers({ query: '  여행_%  ', page: 2 });
  assert.equal(result.total, 21);
  assert.deepEqual(calls.at(-1), { path: '/rest/v1/rpc/harupick_admin_members_filtered', body: { p_query: '여행_%', p_page: 2, p_page_size: 20, p_status:'all', p_from:null, p_until:null, p_sort:'created_desc' } });
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

test('combined filters use inclusive Korean dates and named sorting parameters',async()=>{
 code=200;response=listing([member({created_at:'2026-11-25T15:00:00Z',status:'unconfirmed',email_confirmed:false})]);
 await listMembers({query:'  회원_%  ',status:'unconfirmed',from:'2026-11-26',until:'2026-11-26',sort:'created_asc'});
 assert.deepEqual(calls.at(-1).body,{p_query:'회원_%',p_page:1,p_page_size:20,p_status:'unconfirmed',p_from:'2026-11-26',p_until:'2026-11-26',p_sort:'created_asc'});
 response=listing();await listMembers({from:null,until:''});assert.equal(calls.at(-1).body.p_from,null);assert.equal(calls.at(-1).body.p_until,null);
});
test('invalid states, dates, reversed ranges and sort expressions never reach the server',async()=>{
 const before=calls.length;
 for(const params of [{status:'admin'},{status:null},{sort:'created_at;drop table'},{sort:null},{from:'2026-02-29'},{until:'2026-04-31'},{from:'0000-01-01'},{from:'infinity'},{from:'2026-11-26T00:00:00Z'},{from:0},{from:'2026-11-27',until:'2026-11-26'}])await assert.rejects(listMembers(params));
 assert.equal(calls.length,before);
});
test('date range accepts midnight and the last microsecond but rejects adjacent days',async()=>{
 code=200;
 for(const created_at of ['2026-11-25T15:00:00Z','2026-11-26T14:59:59.999999Z']){response=listing([member({created_at})]);await listMembers({from:'2026-11-26',until:'2026-11-26'});}
 for(const created_at of ['2026-11-25T14:59:59.999999Z','2026-11-26T15:00:00Z']){response=listing([member({created_at})]);await assert.rejects(listMembers({from:'2026-11-26',until:'2026-11-26'}));}
});
test('both sort directions preserve microsecond ordering and deterministic UUID ties',async()=>{
 code=200;const low='11111111-1111-4111-8111-111111111111';
 response=listing([member({id:low,created_at:'2026-11-25T15:00:00.000002Z'}),member()]);await listMembers();
 response.members.reverse();await assert.rejects(listMembers());await listMembers({sort:'created_asc'});
 response=listing([member(),member({id:low})]);await listMembers();await assert.rejects(listMembers({sort:'created_asc'}));
 response.members.reverse();await listMembers({sort:'created_asc'});
});
test('wrong states, malformed rows, duplicated IDs and private fields fail closed',async()=>{
 code=200;
 const changes=[m=>{m.status='unknown';},m=>{m.email_confirmed=false;},m=>{m.created_at='2026-02-30T00:00:00Z';},m=>{m.created_at='2026-11-26T24:00:00Z';},m=>{m.snapshot={private:true};},m=>{delete m.nickname;},m=>{m.id='invalid';}];
 for(const change of changes){response=listing();change(response.members[0]);await assert.rejects(listMembers());}
 response=listing();await assert.rejects(listMembers({status:'suspended'}));
 response=listing([member(),member()]);await assert.rejects(listMembers());
 for(const status of ['suspended','deleted','unconfirmed']){response=listing([member({status,email_confirmed:status!=='unconfirmed'})]);await listMembers({status});}
});
test('empty results and clipped final pages are valid but inconsistent pagination is rejected',async()=>{
 code=200;response=listing([]);await listMembers({page:999});
 response={...listing(),total:21,page:2,pages:2};await listMembers({page:999});
 for(const change of [d=>{d.total=0;},d=>{d.pages=3;},d=>{d.page=1;},d=>{d.members=[];},d=>{d.total=Number.MAX_SAFE_INTEGER+1;}]){
  response={...listing(),total:21,page:2,pages:2};change(response);await assert.rejects(listMembers({page:2}));
 }
});

test('historical Korean daylight-saving dates use the same named zone as Postgres',async()=>{
 code=200;response=listing([member({created_at:'1987-06-30T14:00:00Z'})]);
 await listMembers({from:'1987-07-01',until:'1987-07-01'});
 response=listing([member({created_at:'1987-06-30T13:59:59.999999Z'})]);
 await assert.rejects(listMembers({from:'1987-07-01',until:'1987-07-01'}));
});

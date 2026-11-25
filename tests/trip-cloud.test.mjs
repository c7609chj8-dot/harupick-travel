import test, { after } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { pathname: '/my-trip.html', search: '', hash: '' };
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,String(value)), removeItem: key => values.delete(key) };
const originalFetch = globalThis.fetch;
let status = 200, response, call;
globalThis.fetch = async (input,init) => {
  assert.ok(String(input).endsWith('/rpc/harupick_trip_action'));
  call = JSON.parse(init.body);
  return new Response(JSON.stringify(response), { status, headers: { 'Content-Type':'application/json' } });
};
const {tripRequest,tripError} = await import('../trip-cloud-client.js');
const {authClient} = await import('../auth-client.js');
const {data} = await import('../travel-data.js');
const {copyCloudTrip} = await import('../trip-cloud-copy.js');
const {readItinerary,normalizeItinerary,itineraryKey} = await import('../itinerary.js');
const {savedCourseIds,setCourseSaved} = await import('../demo-storage.js');
const {findTrip} = await import('../trip-records.js');
const {readTripBudget} = await import('../trip-budget.js');
const {readChecklist} = await import('../trip-checklist.js');
after(async () => { await authClient.auth.stopAutoRefresh(); globalThis.fetch=originalFetch; });
const id='77777777-7777-4777-8777-777777777777';
test('account save carries explicit owner and expected revision to server',async()=>{
  status=200; response={id,revision:2,title:'일정'};
  await tripRequest('save',{owner_id:id,local_id:'course',revision:1,snapshot:{}});
  assert.equal(call.p_action,'save'); assert.equal(call.p_args.owner_id,id); assert.equal(call.p_args.revision,1);
});
test('server conflicts propagate without retrying or overwriting',async()=>{
  status=409; response={code:'40001',message:'Trip changed'};
  await assert.rejects(tripRequest('admin_update',{id,revision:1}),error=>error.code==='40001');
  assert.match(tripError(response),/다른 곳에서 수정/);
});
test('permission errors cannot become an empty successful list',async()=>{
  status=403; response={code:'42501',message:'denied'};
  await assert.rejects(tripRequest('list',{owner_id:id}),error=>error.code==='42501');
});
test('wrong detail identity and invalid list bounds fail closed',async()=>{
  status=200; response={id:'88888888-8888-4888-8888-888888888888',revision:1};
  await assert.rejects(tripRequest('admin_get',{id}));
  response={trips:[],total:0,page:2,pages:1};
  await assert.rejects(tripRequest('admin_list',{}));
  response=null; assert.equal(await tripRequest('get',{id,owner_id:id}),null);
});
test('cloud import creates a separate local copy with schedule, budget, checklist',()=>{
  values.clear();
  const course=data.find(item=>item.type===4);
  const local=normalizeItinerary(course,{title:'기존 브라우저 일정',date:'2026-12-01'});
  localStorage.setItem(itineraryKey(course.id),JSON.stringify(local)); setCourseSaved(course.id,true);
  const itinerary=normalizeItinerary(course,{title:'관리자가 수정한 제목',date:'2026-12-02'});
  const budget={travelers:2,costs:{transport:10000,stay:20000,food:30000,entry:4000}};
  const record={local_id:course.id,snapshot:{id:course.id,itinerary,budget,checklist:['hours','booking']}};
  const copyId=copyCloudTrip(record);
  assert.notEqual(copyId,course.id); assert.equal(savedCourseIds().length,2);
  assert.equal(readItinerary(course).title,'기존 브라우저 일정');
  assert.equal(readItinerary(findTrip(copyId)).title,'관리자가 수정한 제목');
  assert.equal(readItinerary(findTrip(copyId)).date,'2026-12-02');
  assert.deepEqual(readTripBudget(copyId),budget); assert.deepEqual([...readChecklist(copyId)],['hours','booking']);
});
test('unsupported or damaged server snapshot writes no local changes',()=>{
  const before=new Map(values);
  assert.throws(()=>copyCloudTrip({local_id:'unknown',snapshot:{}}));
  const course=data.find(item=>item.type===4);
  assert.throws(()=>copyCloudTrip({local_id:course.id,snapshot:{id:course.id,itinerary:{stops:[]},budget:null,checklist:['invalid']}}));
  assert.deepEqual(values,before);
});


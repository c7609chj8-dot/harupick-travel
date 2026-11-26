import test,{after} from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={pathname:'/admin.html',search:'',hash:''};
const originalFetch=globalThis.fetch;
let response,status=200,calls=[];
globalThis.fetch=async(input,init)=>{
 assert.ok(String(input).endsWith('/rpc/harupick_admin_dashboard'));
 assert.equal(init.method,'POST');calls.push(JSON.parse(init.body));
 return new Response(JSON.stringify(response),{status,headers:{'Content-Type':'application/json'}});
};
const {getDashboard}=await import('../admin-dashboard-client.js');
const {authClient}=await import('../auth-client.js');
after(async()=>{await authClient.auth.stopAutoRefresh();globalThis.fetch=originalFetch;});
const small='11111111-1111-4111-8111-111111111111';
const large='ffffffff-ffff-4fff-8fff-ffffffffffff';
function fixture(days=7){
 const until='2026-11-26',start=new Date(until+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-(days-1));
 const rows=Array.from({length:days},(_,index)=>{const value=new Date(start);value.setUTCDate(value.getUTCDate()+index);return {date:value.toISOString().slice(0,10),count:0};});
 return {as_of:'2026-11-25T15:00:00.123456Z',timezone:'Asia/Seoul',trend_days:days,trend_from:rows[0].date,trend_until:until,
 metrics:{registered_members:0,total_trips:0,active_trips:0,archived_trips:0,upcoming_trips_30d:0,changes_7d:0},
 upcoming_trips:[],recent_changes:[],trends:{member_registrations:structuredClone(rows),trip_creations:structuredClone(rows)}};
}
function populated(){
 const value=fixture();
 value.metrics={registered_members:2,total_trips:2,active_trips:1,archived_trips:1,upcoming_trips_30d:1,changes_7d:1};
 value.upcoming_trips=[{id:small,title:'실제 서버 일정',travel_date:'2026-11-26',nickname:'하루픽회원'}];
 value.recent_changes=[{id:small,event:'trip.updated',occurred_at:'2026-11-25T15:00:00.123455Z',actor_label:'관리자',actor_type:'admin',target_label:'실제 서버 일정'}];
 value.trends.member_registrations.at(-1).count=2;value.trends.trip_creations.at(-1).count=2;
 return value;
}
test('default 7-day request preserves genuine zero values and zero-filled dates',async()=>{
 status=200;response=fixture();const result=await getDashboard();
 assert.deepEqual(calls.at(-1),{p_days:7});assert.equal(result.metrics.registered_members,0);assert.equal(result.trends.trip_creations.length,7);
});
test('30-day request requires the matching full date range',async()=>{
 response=fixture(30);const result=await getDashboard(30);
 assert.deepEqual(calls.at(-1),{p_days:30});assert.equal(result.trend_from,'2026-10-28');
});
test('unsupported periods are rejected before sending a request',async()=>{
 const before=calls.length;for(const days of [null,0,14,'7',7.5,false])await assert.rejects(getDashboard(days));
 assert.equal(calls.length,before);
});
test('valid counts and bounded summaries pass without deriving counts in the browser',async()=>{
 response=populated();const result=await getDashboard();assert.equal(result.metrics.total_trips,2);assert.equal(result.upcoming_trips.length,1);
});
test('permission, expired-session and server failures never become zero metrics',async()=>{
 for(const [code,http] of [['42501',403],['PGRST301',401],['PGRST000',400]]){
   status=http;response={code,message:'mock rejection'};await assert.rejects(getDashboard(),error=>error.code===code);
 }status=200;response=null;await assert.rejects(getDashboard());
});
test('inconsistent totals, impossible counts and broken trend dates fail closed',async()=>{
 status=200;
 const changes=[
  data=>{data.metrics.total_trips=3;},
  data=>{data.metrics.registered_members=-1;},
  data=>{data.metrics.active_trips=0;data.metrics.total_trips=1;},
  data=>{data.trends.trip_creations.pop();},
  data=>{data.trends.trip_creations[0].date=data.trend_until;},
  data=>{data.trends.member_registrations[0].count=Number.MAX_SAFE_INTEGER;},
  data=>{data.trend_until='2026-11-25';},
  data=>{data.timezone='UTC';}
 ];
 for(const change of changes){response=populated();change(response);await assert.rejects(getDashboard());}
});
test('emails, full snapshots and other unexpected summary fields are rejected',async()=>{
 response=populated();response.upcoming_trips[0].email='private@example.com';await assert.rejects(getDashboard());
 response=populated();response.recent_changes[0].before_data={snapshot:'private'};await assert.rejects(getDashboard());
});
test('future, archived-range and oversized upcoming summaries are rejected',async()=>{
 response=populated();response.upcoming_trips[0].travel_date='2026-12-26';await assert.rejects(getDashboard());
 response=populated();response.upcoming_trips[0].travel_date='2026-11-25';await assert.rejects(getDashboard());
 response=populated();response.upcoming_trips=[];await assert.rejects(getDashboard());
 response=populated();response.recent_changes=Array(6).fill(response.recent_changes[0]);await assert.rejects(getDashboard());
});
test('microsecond event ordering survives millisecond truncation and ties are deterministic',async()=>{
 response=populated();const entry=response.recent_changes[0];
 response.recent_changes=[{...entry,id:small,occurred_at:'2026-11-25T15:00:00.123455Z'},{...entry,id:large,occurred_at:'2026-11-25T15:00:00.123454Z'}];
 assert.equal((await getDashboard()).recent_changes[0].id,small);
 response.recent_changes=[{...entry,id:large},{...entry,id:small}];await getDashboard();
 response.recent_changes.reverse();await assert.rejects(getDashboard());
 response=populated();response.recent_changes[0].occurred_at='2026-11-25T15:00:00.123457Z';await assert.rejects(getDashboard());
});


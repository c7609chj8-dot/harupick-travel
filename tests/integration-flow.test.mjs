import test, { after } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { pathname:'/my-trip.html',search:'',hash:'' };
const local = new Map();
globalThis.localStorage = { getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,String(value)),removeItem:key=>local.delete(key) };
const originalFetch = globalThis.fetch;
const user={id:'55555555-5555-4555-8555-555555555555',aud:'authenticated',role:'authenticated',email:'integration@example.com',email_confirmed_at:'2026-11-26T00:00:00Z',created_at:'2026-11-26T00:00:00Z',user_metadata:{}};
let profile=null, trip=null, audit=[];
const calls=[];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','x-supabase-api-version':'2024-01-01'}});
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url),body=init.body?JSON.parse(init.body):{};
 calls.push({path:url.pathname,method:init.method||'GET',body,url});
 if(url.pathname.endsWith('/signup')){
   assert.equal(body.data.harupick_app,'harupick');
   profile={id:user.id,nickname:body.data.harupick_nickname,created_at:user.created_at,updated_at:user.created_at};
   return json({...user,email_confirmed_at:null});
 }
 if(url.pathname.endsWith('/token')){
   const payload=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
   return json({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.mock',refresh_token:'mock-refresh',expires_in:3600,token_type:'bearer',user});
 }
 if(url.pathname.endsWith('/user'))return json(user);
 if(url.pathname.endsWith('/recover'))return json({});
 if(url.pathname.endsWith('/logout'))return new Response(null,{status:204});
 if(url.pathname==='/rest/v1/harupick_members')return json(profile?[profile]:[]);
 if(url.pathname.endsWith('/harupick_admin_context'))return json({user_id:user.id,role:'admin',capabilities:['access_admin_console']});
 if(url.pathname.endsWith('/harupick_admin_members_filtered'))return json({members:[{id:profile.id,nickname:profile.nickname,created_at:profile.created_at,email:user.email,email_confirmed:true,status:'active'}],total:1,page:1,pages:1,page_size:20});
 if(url.pathname.endsWith('/harupick_admin_member'))return json({...profile,email:user.email,email_confirmed_at:user.email_confirmed_at,last_sign_in_at:user.created_at,status:'active'});
 if(url.pathname.endsWith('/harupick_trip_action')){
   const args=body.p_args;
   if(!body.p_action.startsWith('admin_'))assert.equal(args.owner_id,user.id);
   if(body.p_action==='save'){
     trip={id:'66666666-6666-4666-8666-666666666666',owner_id:user.id,local_id:args.local_id,title:args.title,travel_date:args.snapshot.itinerary.date,status:'active',revision:1,snapshot:structuredClone(args.snapshot),created_at:user.created_at,updated_at:user.created_at};
     return json(trip);
   }
   if(body.p_action==='admin_update'){
     assert.equal(args.revision,trip.revision);
     const before={title:trip.title,travel_date:trip.travel_date,status:trip.status,revision:trip.revision};
     Object.assign(trip,{title:args.title,travel_date:args.date,status:args.status,revision:trip.revision+1});
     Object.assign(trip.snapshot.itinerary,{title:trip.title,date:trip.travel_date});
     audit=[{id:'77777777-7777-4777-8777-777777777777',occurred_at:user.created_at,event:'trip.archived',actor_id:user.id,actor_type:'admin',actor_label:profile.nickname,target_type:'trip',target_id:trip.id,target_label:trip.title,changed_fields:['title','status','revision','snapshot'],before_data:before,after_data:{title:trip.title,travel_date:trip.travel_date,status:trip.status,revision:trip.revision}}];
     return json(trip);
   }
   if(body.p_action.endsWith('list'))return json({trips:trip?[trip]:[],total:trip?1:0,page:1,pages:1});
   if(body.p_action.endsWith('get'))return json(trip);
 }
 if(url.pathname.endsWith('/harupick_admin_dashboard')){
   const days=body.p_days, until='2026-11-26', start=new Date(until+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-(days-1));
   const dates=Array.from({length:days},(_,index)=>{const day=new Date(start);day.setUTCDate(day.getUTCDate()+index);return {date:day.toISOString().slice(0,10),count:0};});
   const registrations=structuredClone(dates),creations=structuredClone(dates);registrations.at(-1).count=profile?1:0;creations.at(-1).count=trip?1:0;
   const active=trip?.status==='active'?1:0;
   return json({as_of:'2026-11-26T03:00:00Z',timezone:'Asia/Seoul',trend_days:days,trend_from:dates[0].date,trend_until:until,
     metrics:{registered_members:profile?1:0,total_trips:trip?1:0,active_trips:active,archived_trips:trip&&!active?1:0,upcoming_trips_30d:active,changes_7d:audit.length},
     upcoming_trips:active?[{id:trip.id,title:trip.title,travel_date:trip.travel_date,nickname:profile.nickname}]:[],
     recent_changes:audit.map(({id,event,occurred_at,actor_label,actor_type,target_label})=>({id,event,occurred_at,actor_label,actor_type,target_label})),
     trends:{member_registrations:registrations,trip_creations:creations}});
 }
 if(url.pathname.endsWith('/harupick_admin_audit')){
   if(body.p_id)return json(audit.find(entry=>entry.id===body.p_id)||null);
   return json({events:audit.map(({before_data,after_data,...entry})=>entry),total:audit.length,page:1,pages:1});
 }
 throw Error('Unexpected request '+url.pathname);
};
const {authClient,registerMember,getCurrentMember,recoveryUrl}=await import('../auth-client.js');
const {getDashboard}=await import('../admin-dashboard-client.js');
const {trendChartModel}=await import('../admin-dashboard-chart.js');
const {checkAdminAccess}=await import('../admin-access.js');
const {listMembers,getMember}=await import('../admin-members-client.js');
const {tripRequest}=await import('../trip-cloud-client.js');
const {listAudit,getAudit}=await import('../admin-audit-client.js');
const {data}=await import('../travel-data.js');
const {itineraryKey,normalizeItinerary,readItinerary}=await import('../itinerary.js');
const {setCourseSaved}=await import('../demo-storage.js');
const {findTrip}=await import('../trip-records.js');
const {createTripBackup}=await import('../trip-backup.js');
const {copyCloudTrip}=await import('../trip-cloud-copy.js');
after(async()=>{await authClient.auth.stopAutoRefresh();globalThis.fetch=originalFetch;});
test('signup, member lookup, cloud save, dashboard, administrator edit, audit and member restore interoperate',async()=>{
 const signup=await registerMember({nickname:'통합검증회원',email:user.email,password:'MockOnlyPassword-1'});
 assert.equal(signup.signedIn,false);
 const signIn=await authClient.auth.signInWithPassword({email:user.email,password:'MockOnlyPassword-1'});
 assert.equal(signIn.error,null);
 const member=await getCurrentMember();assert.equal(member.profile.nickname,'통합검증회원');
 const initial=await getDashboard();assert.equal(initial.metrics.registered_members,1);assert.equal(initial.metrics.total_trips,0);
 const course=data.find(item=>item.type===4);
 localStorage.setItem(itineraryKey(course.id),JSON.stringify(normalizeItinerary(course,{title:'원래 여행',date:'2026-12-01'})));
 setCourseSaved(course.id,true);
 const snapshot=createTripBackup(course.id).trips[0];
 const saved=await tripRequest('save',{owner_id:member.user.id,local_id:course.id,title:'원래 여행',snapshot,revision:null});
 assert.equal((await tripRequest('list',{owner_id:user.id})).trips[0].id,saved.id);
 assert.equal((await checkAdminAccess()).state,'allowed');
 const members=await listMembers();assert.equal((await getMember(members.members[0].id)).nickname,profile.nickname);
 const dashboard=await getDashboard(30);
 assert.equal(dashboard.metrics.active_trips,1);assert.equal(dashboard.metrics.upcoming_trips_30d,1);
 assert.equal(trendChartModel(dashboard.trends.trip_creations).total,1);assert.equal(dashboard.trends.trip_creations.length,30);
 const selected=await tripRequest('admin_get',{id:dashboard.upcoming_trips[0].id});
 assert.equal(selected.id,saved.id);
 await tripRequest('admin_update',{id:selected.id,revision:selected.revision,title:'운영자가 수정한 여행',date:'2026-12-02',status:'archived'});
 const updated=await getDashboard(30);
 assert.equal(updated.metrics.total_trips,1);assert.equal(updated.metrics.active_trips,0);assert.equal(updated.metrics.archived_trips,1);
 assert.equal(updated.metrics.upcoming_trips_30d,0);assert.deepEqual(updated.upcoming_trips,[]);
 assert.equal(updated.metrics.changes_7d,1);assert.equal(updated.recent_changes[0].event,'trip.archived');
 assert.equal(trendChartModel(updated.trends.trip_creations).total,1);
 const logs=await listAudit();assert.equal(updated.recent_changes[0].id,logs.events[0].id);
 const detail=await getAudit(updated.recent_changes[0].id);
 assert.equal(detail.before_data.title,'원래 여행');assert.equal(detail.after_data.title,'운영자가 수정한 여행');
 const latest=await tripRequest('get',{owner_id:user.id,id:saved.id});
 const copiedId=copyCloudTrip(latest);
 assert.equal(readItinerary(findTrip(copiedId)).title,'운영자가 수정한 여행');
 assert.equal(readItinerary(findTrip(copiedId)).date,'2026-12-02');
 assert.equal(readItinerary(course).title,'원래 여행');
 await authClient.auth.signOut({scope:'local'});
 assert.equal(await getCurrentMember(),null);assert.equal((await checkAdminAccess()).state,'signed-out');
});
test('password recovery uses the configured callback and PKCE without changing credentials',async()=>{
 const {error}=await authClient.auth.resetPasswordForEmail(user.email,{redirectTo:recoveryUrl});
 assert.equal(error,null);
 const request=calls.find(call=>call.path.endsWith('/recover'));
 assert.equal(request.url.searchParams.get('redirect_to'),'https://harupick-travel.vercel.app/reset-password.html');
 assert.ok(request.body.code_challenge);
 assert.ok(!calls.some(call=>call.method==='PUT'&&call.path.endsWith('/user')));
});


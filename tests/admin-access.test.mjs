import test, { after } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={pathname:'/admin.html',search:'',hash:''};
const user={id:'77777777-7777-4777-8777-777777777777',email:'test@example.com',email_confirmed_at:'2026-11-25T00:00:00Z',aud:'authenticated',role:'authenticated',user_metadata:{role:'admin',is_admin:true},created_at:'2026-11-25T00:00:00Z'};
let mode='denied',rpcCalls=0;
const originalFetch=globalThis.fetch;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url);
 if(url.pathname.endsWith('/token')){const payload=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return json({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user});}
 if(url.pathname.endsWith('/user'))return mode==='expired'?json({code:'bad_jwt',msg:'Invalid token'},401):json(mode==='unverified'?{...user,email_confirmed_at:null}:user);
 if(url.pathname.endsWith('/rpc/harupick_admin_context')){
   rpcCalls++;
   assert.equal(init.method,'POST');
   assert.deepEqual(JSON.parse(init.body||'{}'),{});
   if(mode==='denied')return json({code:'42501',message:'Administrator access required'},403);
   if(mode==='error')return json({code:'PGRST000',message:'Unavailable'},400);
   return json({user_id:mode==='wrong-user'?'00000000-0000-4000-8000-000000000000':user.id,role:'admin',capabilities:['access_admin_console']});
 }
 if(url.pathname.endsWith('/logout'))return new Response(null,{status:204});
 throw new Error('Unexpected request '+url.pathname);
};
const {authClient}=await import('../auth-client.js');
const {checkAdminAccess}=await import('../admin-access.js');
after(async()=>{await authClient.auth.stopAutoRefresh();globalThis.fetch=originalFetch;});
test('signed-out users never request protected admin context',async()=>{assert.equal((await checkAdminAccess()).state,'signed-out');assert.equal(rpcCalls,0);});
test('editable metadata claiming admin never grants access',async()=>{await authClient.auth.signInWithPassword({email:user.email,password:'MockOnly-1'});mode='denied';assert.equal((await checkAdminAccess()).state,'denied');});
test('confirmed admins require a matching server context',async()=>{mode='allowed';const result=await checkAdminAccess();assert.equal(result.state,'allowed');assert.equal(result.user.id,user.id);});
test('revocation is checked on the next request instead of cached',async()=>{mode='allowed';await checkAdminAccess();mode='denied';assert.equal((await checkAdminAccess()).state,'denied');});
test('unverified accounts cannot call the admin RPC',async()=>{mode='unverified';const before=rpcCalls;assert.equal((await checkAdminAccess()).state,'denied');assert.equal(rpcCalls,before);});
test('unexpected users and API failures fail closed',async()=>{mode='wrong-user';await assert.rejects(checkAdminAccess());mode='error';await assert.rejects(checkAdminAccess());});
test('expired authentication returns signed-out',async()=>{mode='expired';assert.equal((await checkAdminAccess()).state,'signed-out');});

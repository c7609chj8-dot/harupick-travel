import test,{after} from 'node:test';
import assert from 'node:assert/strict';
const storage = () => {const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
globalThis.localStorage=storage();globalThis.sessionStorage=storage();
globalThis.BroadcastChannel=undefined;
globalThis.window=globalThis;globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){},querySelectorAll(){return []}};
globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
globalThis.location={pathname:'/reset-password.html',search:'',hash:'',href:'https://harupick-travel.vercel.app/reset-password.html'};
const user={id:'12345678-1234-4234-8234-123456789012',aud:'authenticated',role:'authenticated',email:'fixture@example.com',email_confirmed_at:'2026-11-26T00:00:00Z',created_at:'2026-11-26T00:00:00Z',user_metadata:{},identities:[]};
const payload=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const token={access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.fixture',refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user};
const calls=[];const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json','x-supabase-api-version':'2024-01-01'}});
let rejectUpdate=false;
globalThis.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);calls.push({path:url.pathname,method:init.method||'GET'});if(url.pathname.endsWith('/recover'))return json({});if(url.pathname.endsWith('/verify')||url.pathname.endsWith('/token'))return json(token);if(url.pathname.endsWith('/user')){if(init.method==='PUT'&&rejectUpdate)return new Response(JSON.stringify({code:'weak_password',msg:'Weak password'}),{status:422,headers:{'Content-Type':'application/json'}});return json(user);}if(url.pathname.endsWith('/logout'))return new Response(null,{status:204});throw Error('Unexpected request '+url.pathname);};
const first=await import('../auth-client.js');await first.authReady;
const clients=[first.authClient];
after(async()=>{for(const client of clients){await client.auth.stopAutoRefresh();client.auth.broadcastChannel?.close();}});
test('ordinary password login does not enable recovery-only password update',async()=>{
 await first.authClient.auth.signInWithPassword({email:user.email,password:'FixtureOnly-123'});
 assert.equal(first.isRecoverySession(user.id),false);
 const before=calls.length;await assert.rejects(first.updateRecoveredPassword('FixtureOnly-456'),error=>error.code==='recovery_session_required');assert.ok(!calls.slice(before).some(call=>call.method==='PUT'));
});
test('verified recovery survives page module reload and remains bound to the same user',async()=>{
 const result=await first.authClient.auth.verifyOtp({token_hash:'fixture-only',type:'recovery'});assert.equal(result.error,null);assert.equal(first.isRecoverySession(user.id),true);assert.equal(first.isRecoverySession('other-user'),false);
 await first.authClient.auth.stopAutoRefresh();
 const reloaded=await import('../auth-client.js?recovery-reload');clients.push(reloaded.authClient);await reloaded.authReady;
 assert.equal(reloaded.isRecoverySession(user.id),true);
 rejectUpdate=true;await assert.rejects(reloaded.updateRecoveredPassword('FixtureOnly-456'),/Weak password/);assert.equal(reloaded.isRecoverySession(user.id),true);
 rejectUpdate=false;await reloaded.updateRecoveredPassword('FixtureOnly-456');assert.equal(reloaded.isRecoverySession(),false);assert.equal(sessionStorage.getItem('harupick-recovery-user'),null);
});
test('a different authenticated user cannot use the stored recovery context',async()=>{
 sessionStorage.setItem('harupick-recovery-user','other-user');
 const different=await import('../auth-client.js?recovery-other');clients.push(different.authClient);await different.authReady;
 const before=calls.length;await assert.rejects(different.updateRecoveredPassword('FixtureOnly-789'),error=>error.code==='recovery_session_required');assert.ok(!calls.slice(before).some(call=>call.method==='PUT'));
});
test('logout removes recovery context',async()=>{
 await first.authClient.auth.verifyOtp({token_hash:'fixture-only',type:'recovery'});assert.equal(first.isRecoverySession(),true);await first.authClient.auth.signOut({scope:'local'});assert.equal(first.isRecoverySession(),false);assert.equal(sessionStorage.getItem('harupick-recovery-user'),null);
});

test('a PKCE email callback establishes the recovery context through real SDK initialization',async()=>{
 await first.authClient.auth.resetPasswordForEmail(user.email,{redirectTo:'https://harupick-travel.vercel.app/reset-password.html'});
 const url=new URL('https://harupick-travel.vercel.app/reset-password.html?code=fixture-only');
 globalThis.location={pathname:url.pathname,search:url.search,hash:url.hash,href:url.href};
 globalThis.history={replaceState(_state,_title,next){const changed=new URL(next,location.href);globalThis.location={pathname:changed.pathname,search:changed.search,hash:changed.hash,href:changed.href};}};
 const callback=await import('../auth-client.js?recovery-callback');clients.push(callback.authClient);
 const ready=await callback.authReady;assert.equal(ready.error,null);assert.equal(callback.hasAuthCallback,true);assert.equal(callback.isRecoverySession(user.id),true);
 assert.ok(calls.some(call=>call.path.endsWith('/token')));
});

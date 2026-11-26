import test,{after} from 'node:test';import assert from 'node:assert/strict';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.BroadcastChannel=undefined;globalThis.window=globalThis;
globalThis.location={origin:'https://harupick-travel.vercel.app',pathname:'/reset-password.html',search:'',hash:'',href:'https://harupick-travel.vercel.app/reset-password.html'};
globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
const nodes=new Map();for(const id of ['reset-request-form','reset-request-fields','new-password-form','new-password-fields','reset-origin-help','reset-origin-link','reset-status','reset-check','reset-email','new-password','new-password-confirm'])nodes.set(id,{hidden:id==='new-password-form'||id==='reset-origin-help',disabled:id.endsWith('fields'),dataset:{},value:'',textContent:'',addEventListener(){},focus(){this.focused=true;},reset(){},setAttribute(){},removeAttribute(){}});
globalThis.document={visibilityState:'visible',hidden:false,getElementById:id=>nodes.get(id)||null,addEventListener(){},removeEventListener(){}};
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.com',email_confirmed_at:'2026-11-26T00:00:00Z',created_at:'2026-11-26T00:00:00Z',user_metadata:{},identities:[]};
const jwt=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.'+jwt+'.fixture',refresh_token:'fixture-only',expires_in:3600,token_type:'bearer',user};
globalThis.fetch=async(input)=>{const url=new URL(typeof input==='string'?input:input.url);if(url.pathname.endsWith('/verify'))return new Response(JSON.stringify(session),{headers:{'Content-Type':'application/json'}});if(url.pathname.endsWith('/user'))return new Response(JSON.stringify(user),{headers:{'Content-Type':'application/json'}});if(url.pathname.endsWith('/logout'))return new Response(null,{status:204});throw Error('Unexpected request '+url.pathname);};
const {authClient}=await import('../auth-client.js');await import('../auth-ui.js');after(()=>authClient.auth.stopAutoRefresh());
test('the already open reset UI replaces the request form after a late verified recovery event',async()=>{
 assert.equal(nodes.get('reset-request-form').hidden,false);assert.equal(nodes.get('new-password-form').hidden,true);
 const result=await authClient.auth.verifyOtp({token_hash:'fixture-only',type:'recovery'});assert.equal(result.error,null);
 for(let attempt=0;attempt<20&&nodes.get('new-password-form').hidden;attempt++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(nodes.get('reset-request-form').hidden,true);assert.equal(nodes.get('new-password-form').hidden,false);assert.equal(nodes.get('new-password-fields').disabled,false);assert.match(nodes.get('reset-status').textContent,/새 비밀번호/);assert.equal(nodes.get('new-password').focused,true);
 await authClient.auth.signOut({scope:'local'});assert.equal(nodes.get('new-password-form').hidden,true);assert.equal(nodes.get('reset-request-form').hidden,false);
});

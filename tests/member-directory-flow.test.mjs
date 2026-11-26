import test,{after} from 'node:test';
import assert from 'node:assert/strict';

globalThis.location={pathname:'/admin.html',search:'',hash:''};
const originalFetch=globalThis.fetch,calls=[];
const rows=Array.from({length:132},(_,index)=>({
 id:'abababab-abab-4bab-8bab-'+String(index+1).padStart(12,'0'),nickname:'통합회원'+(index+1),email:'fixture'+(index+1)+'@example.com',
 created_at:new Date(Date.UTC(2026,10,24+index%3,1)).toISOString(),
 email_confirmed:index%4!==1,status:['active','unconfirmed','suspended','deleted'][index%4]
}));
let denyDetail=false;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,init)=>{
 const path=new URL(typeof input==='string'?input:input.url).pathname,body=JSON.parse(init.body);
 calls.push({path,body});
 if(path.endsWith('/harupick_admin_members_filtered')){
  const query=body.p_query.toLowerCase();
  const found=rows.filter(row=>{
   const date=new Date(Date.parse(row.created_at)+9*3600000).toISOString().slice(0,10);
   return (row.nickname.includes(query)||row.email.includes(query))&&(body.p_status==='all'||row.status===body.p_status)&&(!body.p_from||date>=body.p_from)&&(!body.p_until||date<=body.p_until);
  }).sort((a,b)=>{const value=Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id);return body.p_sort==='created_asc'?value:-value;});
  const pages=Math.max(1,Math.ceil(found.length/body.p_page_size)),page=Math.min(body.p_page,pages);
  return json({members:found.slice((page-1)*body.p_page_size,page*body.p_page_size),total:found.length,page,pages,page_size:body.p_page_size});
 }
 if(path.endsWith('/harupick_admin_member')){
  if(denyDetail)return json({code:'42501',message:'Revoked administrator'},403);
  const row=rows.find(row=>row.id===body.p_member_id);
  return json(row?{id:row.id,nickname:row.nickname,email:row.email,status:row.status,created_at:row.created_at,updated_at:row.created_at,email_confirmed_at:row.email_confirmed?row.created_at:null,last_sign_in_at:null}:null);
 }
 throw Error('Unexpected request '+path);
};
const {listMembers,getMember}=await import('../admin-members-client.js');
const {createMembersController}=await import('../admin-members-controller.js');
const {authClient}=await import('../auth-client.js');
after(async()=>{await authClient.auth.stopAutoRefresh();globalThis.fetch=originalFetch;});
function setup(){
 const lists=[],details=[],failures=[];
 const controller=createMembersController({list:listMembers,detail:getMember,onList:state=>lists.push(state),onDetail:state=>details.push(state),onAccessFailure:state=>failures.push(state)});
 return {controller,lists,details,failures};
}

test('filtered second page, selected detail and return preserve the same result through the real SDK',async()=>{
 denyDetail=false;const {controller,lists,details,failures}=setup();controller.activate();
 const params={query:'통합',status:'active',from:'2026-11-25',until:'2026-11-26',sort:'created_asc',page:2};
 await controller.loadList(params);
 const ready=lists.at(-1);assert.equal(ready.state,'ready');assert.equal(ready.data.total,22);assert.equal(ready.data.pages,2);assert.equal(ready.data.page,2);assert.equal(ready.data.members.length,2);
 assert.deepEqual(calls.at(-1).body,{p_query:'통합',p_status:'active',p_from:'2026-11-25',p_until:'2026-11-26',p_sort:'created_asc',p_page:2,p_page_size:20});
 const selected=ready.data.members[0];await controller.loadDetail(selected.id);
 assert.equal(details.at(-1).state,'ready');assert.equal(details.at(-1).data.id,selected.id);assert.equal(details.at(-1).data.nickname,selected.nickname);
 assert.equal(details.at(-1).data.last_sign_in_at,null);
 const before=calls.length;controller.closeDetail();assert.equal(details.at(-1).state,'idle');assert.equal(lists.at(-1),ready);assert.equal(calls.length,before);assert.deepEqual(failures,[]);
 await controller.loadList({...params,page:1});assert.equal(lists.at(-1).data.page,1);assert.equal(lists.at(-1).data.members.length,20);assert.equal(lists.at(-1).data.total,22);
 controller.deactivate();
});

test('a permission failure from the detail API clears list and detail and stops all protected reads',async()=>{
 denyDetail=false;const {controller,lists,details,failures}=setup();controller.activate();
 await controller.loadList({status:'unconfirmed',sort:'created_desc'});const id=lists.at(-1).data.members[0].id;
 await controller.loadDetail(id);assert.equal(details.at(-1).state,'ready');assert.equal(details.at(-1).data.email_confirmed_at,null);
 denyDetail=true;await controller.loadDetail(id);
 assert.deepEqual(failures,['denied']);assert.deepEqual(lists.at(-1),{state:'idle'});assert.deepEqual(details.at(-1),{state:'idle'});
 const before=calls.length;await controller.loadList({});await controller.loadDetail(id);assert.equal(calls.length,before);
 denyDetail=false;controller.activate();await controller.loadList({status:'active'});assert.equal(lists.at(-1).state,'ready');assert.equal(details.at(-1).state,'idle');controller.deactivate();
});

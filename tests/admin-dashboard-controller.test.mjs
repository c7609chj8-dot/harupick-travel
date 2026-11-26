import test,{after} from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={pathname:'/admin.html',search:'',hash:''};
const {createDashboardController}=await import('../admin-dashboard-controller.js');
const {authClient}=await import('../auth-client.js');
after(async()=>await authClient.auth.stopAutoRefresh());
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(load){const states=[],failures=[];const controller=createDashboardController({load,onState:state=>states.push(state),onAccessFailure:state=>failures.push(state)});return {controller,states,failures};}
test('inactive dashboard never requests protected statistics',async()=>{
 let calls=0;const {controller,states}=setup(async()=>{calls++;});await controller.refresh();assert.equal(calls,0);assert.deepEqual(states,[]);
});
test('genuine zero counts are ready data instead of an error or placeholder',async()=>{
 const data={metrics:{registered_members:0},upcoming_trips:[],recent_changes:[]};
 const {controller,states}=setup(async()=>data);controller.activate();await controller.refresh();
 assert.deepEqual(states.map(state=>state.state),['loading','ready']);assert.equal(states.at(-1).data,data);
});
test('network errors clear ready data and can be retried',async()=>{
 let fail=false;const {controller,states}=setup(async()=>{if(fail)throw Error('offline');return {metrics:{total_trips:3}};});
 controller.activate();await controller.refresh();fail=true;await controller.refresh();
 assert.deepEqual(states.at(-1),{state:'error'});fail=false;await controller.refresh();assert.equal(states.at(-1).state,'ready');
});
test('newer refresh wins even when an older response completes last',async()=>{
 const first=deferred(),second=deferred();let calls=0;
 const {controller,states}=setup(()=>++calls===1?first.promise:second.promise);controller.activate();
 const old=controller.refresh(),current=controller.refresh();second.resolve({version:2});await current;first.resolve({version:1});await old;
 assert.equal(states.at(-1).data.version,2);
});
test('logout and account reactivation cannot reveal an older response',async()=>{
 const old=deferred();let calls=0;const {controller,states}=setup(()=>++calls===1?old.promise:Promise.resolve({account:'new'}));
 controller.activate();const pending=controller.refresh();controller.deactivate();controller.activate();await controller.refresh();
 old.resolve({account:'old'});await pending;assert.equal(states.at(-1).data.account,'new');
 controller.deactivate();assert.deepEqual(states.at(-1),{state:'idle'});
});
test('authorization failures clear statistics and stop new requests until reactivated',async()=>{
 for(const [error,expected] of [[{code:'42501'},'denied'],[{code:'PGRST301'},'signed-out']]){
  let calls=0;const {controller,states,failures}=setup(async()=>{calls++;throw error;});
  controller.activate();await controller.refresh();assert.deepEqual(states.at(-1),{state:'idle'});assert.deepEqual(failures,[expected]);
  await controller.refresh();assert.equal(calls,1);
 }
});
test('late permission errors from a replaced request cannot hide the current dashboard',async()=>{
 const old=deferred();let calls=0;const {controller,states,failures}=setup(()=>++calls===1?old.promise:Promise.resolve({current:true}));
 controller.activate();const pending=controller.refresh();await controller.refresh();old.reject({code:'42501'});await pending;
 assert.equal(states.at(-1).data.current,true);assert.deepEqual(failures,[]);
});


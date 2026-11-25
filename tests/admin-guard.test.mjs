import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminGuard} from '../admin-guard.js';
const pending=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('a late allowed response cannot reveal content after sign-out',async()=>{const p=pending(),states=[];const guard=createAdminGuard({check:()=>p.promise,onState:s=>states.push(s.state)});const task=guard.refresh();guard.invalidate('signed-out');p.resolve({state:'allowed'});await task;assert.deepEqual(states,['checking','signed-out']);});
test('a newer denial takes precedence over an older allowed response',async()=>{const a=pending(),b=pending(),states=[];let calls=0;const guard=createAdminGuard({check:()=>++calls===1?a.promise:b.promise,onState:s=>states.push(s.state)});const one=guard.refresh(),two=guard.refresh();b.resolve({state:'denied'});await two;a.resolve({state:'allowed'});await one;assert.deepEqual(states,['checking','checking','denied']);});
test('network failures produce an error state without allowed content',async()=>{const states=[];const guard=createAdminGuard({check:async()=>{throw new Error('offline');},onState:s=>states.push(s.state)});await guard.refresh();assert.deepEqual(states,['checking','error']);});
test('disposed pages ignore completed access requests',async()=>{const p=pending(),states=[];const guard=createAdminGuard({check:()=>p.promise,onState:s=>states.push(s.state)});const task=guard.refresh();guard.dispose();p.resolve({state:'allowed'});await task;assert.deepEqual(states,['checking']);});

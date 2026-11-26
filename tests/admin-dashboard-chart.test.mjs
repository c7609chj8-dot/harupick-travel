import test from 'node:test';
import assert from 'node:assert/strict';
import {trendChartModel} from '../admin-dashboard-chart.js';
const rows=(counts)=>counts.map((count,index)=>({date:'2026-11-'+String(index+1).padStart(2,'0'),count}));
test('zero charts show a real baseline without fake bars',()=>{
 const model=trendChartModel(rows(Array(7).fill(0)));
 assert.equal(model.empty,true);assert.equal(model.total,0);assert.ok(model.bars.every(bar=>bar.height===0));assert.deepEqual(model.ticks.map(t=>t.value),[0,1]);
});
test('small counts use integer ticks and preserve exact totals',()=>{
 const model=trendChartModel(rows([0,1,2,0,3,0,1]));
 assert.equal(model.total,7);assert.equal(model.maximum,3);assert.ok(model.ticks.every(t=>Number.isInteger(t.value)));assert.equal(model.bars[0].height,0);
});
test('thirty day spikes stay within chart bounds and retain endpoint dates',()=>{
 const counts=Array(30).fill(0);counts[0]=17;counts[29]=1234;
 const model=trendChartModel(rows(counts)),b=model.bounds;
 assert.ok(model.ceiling>=1234);assert.equal(model.total,1251);
 for(const bar of model.bars){assert.ok(bar.x>=b.left);assert.ok(bar.x+bar.width<=b.width-b.right);assert.ok(bar.y>=b.top);assert.ok(bar.y+bar.height<=b.height-b.bottom+1e-9);}
 assert.equal(model.dates[0].date,'2026-11-01');assert.equal(model.dates.at(-1).date,'2026-11-30');
});
test('very large valid counts still produce finite nonnegative geometry',()=>{
 const model=trendChartModel(rows([Number.MAX_SAFE_INTEGER,0,0,0,0,0,0]));
 assert.ok(model.bars.every(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.height>=0));assert.ok(model.ticks.every(t=>Number.isFinite(t.y)));
});
test('invalid periods, counts and unsafe totals are rejected',()=>{
 for(const data of [[],rows([1]),rows([-1,0,0,0,0,0,0]),rows([.5,0,0,0,0,0,0]),rows([Number.MAX_SAFE_INTEGER,1,0,0,0,0,0])])assert.throws(()=>trendChartModel(data),TypeError);
});

const svgNamespace = 'http://www.w3.org/2000/svg';

export function trendChartModel(rows) {
  if (!Array.isArray(rows) || ![7,30].includes(rows.length) || rows.some(row => typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isSafeInteger(row.count) || row.count < 0)) throw new TypeError('Invalid trend rows');
  const total = rows.reduce((sum,row) => sum+row.count,0);
  if (!Number.isSafeInteger(total)) throw new TypeError('Unsafe trend total');
  const maximum = Math.max(...rows.map(row => row.count));
  const roughStep = maximum/4;
  const magnitude = roughStep > 0 ? 10**Math.floor(Math.log10(roughStep)) : 1;
  const step = maximum <= 4 ? 1 : [1,2,5,10].find(value => value*magnitude >= roughStep)*magnitude;
  const ceiling = maximum ? Math.ceil(maximum/step)*step : 1;
  const bounds = { width:360,height:220,left:45,right:14,top:16,bottom:37 };
  const width = bounds.width-bounds.left-bounds.right, height = bounds.height-bounds.top-bounds.bottom;
  const stride = width/rows.length;
  const bars = rows.map((row,index) => ({
    ...row, x:bounds.left+stride*(index+.18), width:stride*.64,
    y:bounds.top+height*(1-row.count/ceiling), height:height*row.count/ceiling
  }));
  const ticks = Array.from({length:Math.round(ceiling/step)+1},(_,index)=>index*step).map(value=>({value,y:bounds.top+height*(1-value/ceiling)}));
  const dates = [...new Set(Array.from({length:5},(_,index)=>Math.round((rows.length-1)*index/4)))].map(index=>({date:rows[index].date,x:bounds.left+stride*(index+.5)}));
  return { bounds,bars,ticks,dates,total,maximum,ceiling,empty:maximum===0 };
}
function svgElement(name,attributes={},text) {
  const element = document.createElementNS(svgNamespace,name);
  for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
export function renderTrendChart(target,rows,{id,title,unit,color}) {
  const model = trendChartModel(rows), {bounds} = model;
  const svg = svgElement('svg',{viewBox:'0 0 '+bounds.width+' '+bounds.height,role:'img','aria-labelledby':id+'-title '+id+'-description'});
  svg.append(svgElement('title',{id:id+'-title'},title));
  svg.append(svgElement('desc',{id:id+'-description'},rows[0].date+'부터 '+rows.at(-1).date+'까지 합계 '+model.total.toLocaleString('ko-KR')+unit+'. 정확한 날짜별 값은 아래 날짜별 수치 표에서 확인할 수 있습니다.'));
  const format = new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});
  for (const tick of model.ticks) {
    svg.append(svgElement('line',{x1:bounds.left,x2:bounds.width-bounds.right,y1:tick.y,y2:tick.y,stroke:'#dbe5d4','stroke-width':1}));
    svg.append(svgElement('text',{x:bounds.left-8,y:tick.y+4,'text-anchor':'end',fill:'#53664c','font-size':12},format.format(tick.value)));
  }
  for (const bar of model.bars) {
    const rectangle = svgElement('rect',{x:bar.x,y:bar.y,width:bar.width,height:bar.height,rx:2,fill:color});
    rectangle.append(svgElement('title',{},bar.date+' · '+bar.count.toLocaleString('ko-KR')+unit));
    svg.append(rectangle);
  }
  for (const label of model.dates) svg.append(svgElement('text',{x:label.x,y:bounds.height-13,'text-anchor':'middle',fill:'#53664c','font-size':12},label.date.slice(5).replace('-','/')));
  target.replaceChildren(svg);
  return model;
}


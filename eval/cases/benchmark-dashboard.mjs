import { delay, evaluate } from '../lib/cdp.mjs'

/** Verify benchmark-specific dashboard behavior with DOM state, not source keywords. */
export async function verifyDashboardBenchmark(client, { profile = 'ab' } = {}) {
  return profile === 'legacy'
    ? verifyLegacyDashboardBenchmark(client)
    : verifyAbDashboardBenchmark(client)
}

async function verifyAbDashboardBenchmark(client) {
  const initial = await snapshot(client)

  const refreshFound = await evaluate(client, `(() => {
    const button=[...document.querySelectorAll('button,[role="button"]')].find((e)=>/refresh|刷新/i.test(e.textContent||''));
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(350)
  const refreshed = await snapshot(client)

  const controls = {}
  for (const kind of ['region', 'category', 'period']) {
    await reloadPage(client)
    const before = await snapshot(client)
    const mutation = await mutateControl(client, kind)
    await delay(350)
    const after = await snapshot(client)
    controls[kind] = {
      changed: mutation.changed,
      descriptor: mutation.descriptor,
      target: mutation.target,
      before: before.kpis,
      after: after.kpis,
      positiveKpis: after.positiveKpis,
    }
  }

  await reloadPage(client)
  const hover = await verifyHover(client)
  const controlChecks = Object.fromEntries(Object.entries(controls).map(([kind, item]) => [kind, result(`${kind}-updates`, item.changed && valuesChanged(item) && item.positiveKpis === 4, item)]))
  const checks = [
    result('four-kpis', initial.kpis.length === 4 && initial.positiveKpis === 4, initial.kpis),
    result('four-populated-charts', initial.populatedCharts >= 4, { populated: initial.populatedCharts, hosts: initial.chartHosts }),
    result('two-filters', initial.controlCounts.region > 0 && initial.controlCounts.category > 0, initial.controlCounts),
    result('period-control', initial.controlCounts.period > 0, initial.controlCounts),
    result('refresh-control', refreshFound, refreshFound),
    result('refresh-changes-data', refreshFound && changedValues(initial, refreshed) && refreshed.positiveKpis === 4, { before: initial.kpis, after: refreshed.kpis }),
    result('region-filter-updates', controlChecks.region.pass, controls.region),
    result('category-filter-updates', controlChecks.category.pass, controls.category),
    result('period-updates', controlChecks.period.pass, controls.period),
    result('hover-behavior', hover.pass, hover.observed),
  ]

  return {
    checks,
    passed: checks.filter((item) => item.pass).length,
    total: checks.length,
    initial,
    refreshed,
    controls,
    hover,
  }
}

async function verifyLegacyDashboardBenchmark(client) {
  const initial = await snapshot(client)

  const refreshFound = await evaluate(client, `(() => {
    const button=[...document.querySelectorAll('button,[role="button"]')].find((e)=>/refresh|刷新/i.test(e.textContent||''));
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(350)
  const refreshed = await snapshot(client)

  const selectResults = []
  for (let index = 0; index < Math.min(2, initial.selects); index += 1) {
    const before = await snapshot(client)
    const changed = await setSelect(client, index)
    await delay(350)
    const after = await snapshot(client)
    selectResults.push({ changed, before: before.kpis, after: after.kpis, positiveKpis: after.positiveKpis })
    await resetSelect(client, index)
    await delay(150)
  }

  const rangeBefore = await snapshot(client)
  const rangeChanged = await setRange(client)
  await delay(350)
  const rangeAfter = await snapshot(client)

  const refreshCheck = result('refresh-changes-data', refreshFound && changedValues(initial, refreshed) && refreshed.positiveKpis === 4, { before: initial.kpis, after: refreshed.kpis })
  const selectChecks = selectResults.map((item, index) => result(`filter-${index + 1}-updates`, item.changed && valuesChanged(item) && item.positiveKpis === 4, item))
  const rangeCheck = result('period-updates', rangeChanged && changedValues(rangeBefore, rangeAfter) && rangeAfter.positiveKpis === 4, { changed: rangeChanged, before: rangeBefore.kpis, after: rangeAfter.kpis })
  const checks = [
    result('four-kpis', initial.kpis.length === 4 && initial.positiveKpis === 4, initial.kpis),
    result('four-populated-charts', initial.populatedCharts >= 4, { populated: initial.populatedCharts, hosts: initial.chartHosts }),
    result('refresh-control', refreshFound, refreshFound),
    refreshCheck,
    result('hover-behavior', initial.hoverTargets > 0 || initial.tooltipElements > 0, { hoverTargets: initial.hoverTargets, tooltipElements: initial.tooltipElements }),
    result('filter-controls', initial.selects + initial.ranges >= 2, { selects: initial.selects, ranges: initial.ranges }),
    result('filters-update-data', selectChecks.length + Number(initial.ranges > 0) > 0 && [...selectChecks, ...(initial.ranges > 0 ? [rangeCheck] : [])].every((item) => item.pass), { selectChecks, rangeCheck: initial.ranges > 0 ? rangeCheck : null }),
  ]

  return {
    checks,
    passed: checks.filter((item) => item.pass).length,
    total: checks.length,
    initial,
    refreshed,
    selectResults,
    range: { changed: rangeChanged, before: rangeBefore, after: rangeAfter },
  }
}

async function reloadPage(client) {
  await client.send('Page.reload', { ignoreCache: true })
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(100)
    const ready = await evaluate(client, `document.readyState === 'complete'`)
    if (ready) {
      await delay(250)
      return
    }
  }
  throw new Error('dashboard did not finish reloading')
}

function mutateControl(client, kind) {
  return evaluate(client, `(() => {
    const kind=${JSON.stringify(kind)};
    const visible=(e)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden'&&!e.disabled};
    const patterns={region:/region|地区|区域/,category:/categor|类别|品类|分类/,period:/period|month|date|time|range|月份|月度|时间|日期/};
    const attributes=(e)=>[e.id,e.getAttribute('name'),e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-filter'),e.getAttribute('data-type'),typeof e.className==='string'?e.className:''].filter(Boolean);
    const classify=(e)=>{
      const own=attributes(e);
      if(e.tagName==='BUTTON'||e.getAttribute('role')==='button')own.push(e.textContent);
      if(e.id){const label=document.querySelector('label[for="'+CSS.escape(e.id)+'"]');if(label)own.push(label.textContent)}
      const ownLabel=e.closest('label');if(ownLabel)own.push(ownLabel.textContent);
      const tiers=[own];
      let parent=e.parentElement;
      for(let depth=0;parent&&depth<4;depth+=1,parent=parent.parentElement){
        const parts=attributes(parent);
        const text=(parent.textContent||'').replace(/\\s+/g,' ').trim();
        if(text.length>0&&text.length<=140)parts.push(text);
        tiers.push(parts);
      }
      for(const parts of tiers){
        const description=parts.filter(Boolean).join(' ').toLowerCase();
        const kinds=Object.entries(patterns).filter(([,pattern])=>pattern.test(description)).map(([name])=>name);
        if(kinds.length===1)return {kind:kinds[0],description};
      }
      return {kind:null,description:tiers.flat().filter(Boolean).join(' ').toLowerCase()};
    };
    const candidates=[...document.querySelectorAll('select,input:not([type="hidden"]),button,[role="button"]')]
      .filter((e)=>visible(e)||((e.type==='checkbox'||e.type==='radio')&&e.closest('label')&&visible(e.closest('label'))))
      .filter((e)=>!(/refresh|刷新/i.test(e.textContent||'')||/refresh/i.test(e.id||'')))
      .map((element)=>({element,...classify(element)}))
      .filter((item)=>item.kind===kind);
    const eligible=({element})=>{
      if(element.tagName==='SELECT')return [...element.options].some((option)=>option.value!==element.value);
      if(element.type==='radio')return !element.checked;
      if(element.type==='range'||element.type==='date'||element.type==='month')return true;
      if(element.type==='checkbox')return true;
      return element.tagName==='BUTTON'||element.getAttribute('role')==='button';
    };
    const item=candidates.find(({element})=>element.type==='checkbox'&&!element.checked)
      ||candidates.find(({element})=>(element.tagName==='BUTTON'||element.getAttribute('role')==='button')&&!/^all|全部$/i.test((element.textContent||'').trim()))
      ||candidates.find(eligible);
    if(!item)return {changed:false,descriptor:null,target:null};
    const element=item.element;
    const target={kind:item.kind,tag:element.tagName.toLowerCase(),type:element.type||null,id:element.id||null,name:element.getAttribute('name'),text:(element.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80)};
    if(element.tagName==='SELECT'){
      const options=[...element.options];
      let option=options.find((entry)=>entry.value!==element.value&&!/^all$/i.test(entry.value));
      if(kind==='period'){
        const current=options.findIndex((entry)=>entry.value===element.value);
        option=options[current+1]||options[current-1]||option;
      }
      if(!option)return {changed:false,descriptor:item.description,target};
      element.value=option.value;
      element.dispatchEvent(new Event('input',{bubbles:true}));
      element.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(element.type==='checkbox'){
      element.checked=!element.checked;
      element.dispatchEvent(new Event('input',{bubbles:true}));
      element.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(element.type==='radio'){
      element.checked=true;
      element.dispatchEvent(new Event('input',{bubbles:true}));
      element.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(element.type==='range'){
      const current=Number(element.value),min=Number(element.min||0),max=Number(element.max||100),step=Number(element.step||1);
      const next=current-step>=min?current-step:Math.min(max,current+step);
      if(next===current)return {changed:false,descriptor:item.description,target};
      element.value=String(next);
      element.dispatchEvent(new Event('input',{bubbles:true}));
      element.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(element.type==='date'||element.type==='month'){
      const date=new Date(element.value||'2026-01-01T00:00:00Z');
      date.setUTCMonth(date.getUTCMonth()+1);
      element.value=element.type==='month'?date.toISOString().slice(0,7):date.toISOString().slice(0,10);
      element.dispatchEvent(new Event('input',{bubbles:true}));
      element.dispatchEvent(new Event('change',{bubbles:true}));
    }else{
      element.click();
    }
    return {changed:true,descriptor:item.description,target};
  })()`)
}

async function verifyHover(client) {
  const candidates = await evaluate(client, `(() => {
    const visible=(e)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>2&&r.height>2&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'};
    const explicit=[],marks=[],canvasPoints=[];
    const add=(target,element,x,y,source)=>{
      const nativeTitle=(element.getAttribute('title')||element.querySelector(':scope > title')?.textContent||'').trim();
      const detail=(element.getAttribute('data-tooltip')||element.getAttribute('data-tip')||element.getAttribute('data-value')||'').trim();
      target.push({
        x:Math.max(1,Math.min(innerWidth-1,x)),
        y:Math.max(1,Math.min(innerHeight-1,y)),
        source,
        tag:element.tagName.toLowerCase(),
        id:element.id||null,
        nativeTitle:Boolean(nativeTitle),
        detailAttribute:Boolean(detail),
      });
    };
    for(const element of document.querySelectorAll('[data-tooltip],[data-tip],[data-value],[title]')){
      if(!visible(element))continue;
      const rect=element.getBoundingClientRect();
      add(explicit,element,rect.left+rect.width/2,rect.top+rect.height/2,'explicit');
    }
    for(const element of document.querySelectorAll('svg circle,svg rect,svg path,svg polygon,svg polyline')){
      if(!visible(element))continue;
      const rect=element.getBoundingClientRect();
      add(marks,element,rect.left+rect.width/2,rect.top+rect.height/2,'svg-mark');
    }
    for(const canvas of document.querySelectorAll('canvas')){
      if(!visible(canvas))continue;
      const rect=canvas.getBoundingClientRect();
      for(const xRatio of [0.25,0.5,0.75])for(const yRatio of [0.25,0.5,0.75])add(canvasPoints,canvas,rect.left+rect.width*xRatio,rect.top+rect.height*yRatio,'canvas-grid');
    }
    const ordered=[...explicit.slice(0,15),...canvasPoints.slice(0,36),...marks.slice(0,45)];
    const seen=new Set();
    return ordered.filter((item)=>{const key=Math.round(item.x)+'/'+Math.round(item.y);if(seen.has(key))return false;seen.add(key);return true}).slice(0,80);
  })()`)
  if (!candidates.length) return { pass: false, observed: { target: false, candidateCount: 0 } }

  const attempts = []
  for (const candidate of candidates) {
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
    await delay(60)
    const before = await tooltipSnapshot(client)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: candidate.x, y: candidate.y })
    await delay(180)
    const after = await tooltipSnapshot(client)
    const appeared = after.visibleText.length > 0 && after.visibleText !== before.visibleText
    const marked = after.hoverMarks > before.hoverMarks
    const attempt = { target: candidate, appeared, marked, before, after }
    attempts.push(attempt)
    if (candidate.nativeTitle || appeared || marked) {
      return {
        pass: true,
        observed: {
          target: true,
          candidateCount: candidates.length,
          attempts: attempts.length,
          nativeTitle: candidate.nativeTitle,
          detailAttribute: candidate.detailAttribute,
          appeared,
          marked,
          selected: candidate,
          before,
          after,
        },
      }
    }
  }
  return {
    pass: false,
    observed: {
      target: true,
      candidateCount: candidates.length,
      attempts: attempts.length,
      attemptedTargets: attempts.slice(0, 20).map((item) => item.target),
      nativeTitle: false,
      detailAttribute: candidates.some((item) => item.detailAttribute),
      appeared: false,
      marked: false,
      before: attempts.at(-1)?.before ?? { visibleText: '', hoverMarks: 0 },
      after: attempts.at(-1)?.after ?? { visibleText: '', hoverMarks: 0 },
    },
  }
}

function tooltipSnapshot(client) {
  return evaluate(client, `(() => {
    const visible=(e)=>{const r=e.getBoundingClientRect();if(r.width<=2||r.height<=2)return false;for(let node=e;node;node=node.parentElement){const s=getComputedStyle(node);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false}return true};
    const tips=[...document.querySelectorAll('[role="tooltip"],[class*="tooltip" i],[id*="tooltip" i],[class*="tip" i],[id*="tip" i]')].filter(visible);
    return {
      visibleText:tips.map((e)=>(e.textContent||'').replace(/\\s+/g,' ').trim()).filter(Boolean).join('|'),
      hoverMarks:document.querySelectorAll('[data-hover="1"],[data-hover="true"]').length,
    };
  })()`)
}

function snapshot(client) {
  return evaluate(client, `(() => {
    const visible=(e)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden'};
    const cardSelector='[data-kpi],.kpi,.kpi-card,[class*="kpi-card"],[class*="metric-card"]';
    const cards=[...document.querySelectorAll(cardSelector)].filter(visible).filter((node)=>!node.parentElement?.closest(cardSelector));
    let kpis=cards.map((card)=>{
      const preferred=card.querySelector('[data-kpi-value],.value,.kpi-value,strong,[class*="value"]');
      const text=(preferred?.textContent||card.textContent||'').trim();
      const matches=text.match(/[-+]?[$€£¥]?\\s*\\d[\\d,.]*(?:\\s*[%kKmMbB])?/g);
      return matches?.at(-1)?.replace(/\\s+/g,'')||'';
    }).filter(Boolean);
    if(kpis.length<4){
      kpis=[...document.querySelectorAll('[data-kpi-value],.kpi-value,[class*="metric-value"],[class*="kpi"] strong')].filter(visible).map((node)=>(node.textContent||'').trim()).filter((text)=>/\\d/.test(text));
    }
    const containerSelector='[data-chart],.chart,.chart-card,.chart-container,[class*="chart-card"],[class*="chart-container"]';
    const containers=[...document.querySelectorAll(containerSelector)].filter(visible).filter((node)=>!node.parentElement?.closest(containerSelector));
    const charts=containers.length>=4?containers:[...document.querySelectorAll('svg,canvas')].filter(visible);
    const populated=charts.filter((host)=>{
      if(host.tagName==='SVG')return host.querySelectorAll('path,line,rect,circle,polyline,polygon').length>=3;
      if(host.tagName==='CANVAS')return host.width>20&&host.height>20;
      return host.querySelectorAll('svg path,svg line,svg rect,svg circle,svg polyline,svg polygon,canvas,[class*="bar"],[class*="point"]').length>=3;
    });
    const patterns={region:/region|地区|区域/,category:/categor|类别|品类|分类/,period:/period|month|date|time|range|月份|月度|时间|日期/};
    const attributes=(e)=>[e.id,e.getAttribute('name'),e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-filter'),e.getAttribute('data-type'),typeof e.className==='string'?e.className:''].filter(Boolean);
    const classify=(e)=>{
      const own=attributes(e);
      if(e.tagName==='BUTTON'||e.getAttribute('role')==='button')own.push(e.textContent);
      if(e.id){const label=document.querySelector('label[for="'+CSS.escape(e.id)+'"]');if(label)own.push(label.textContent)}
      const ownLabel=e.closest('label');if(ownLabel)own.push(ownLabel.textContent);
      const tiers=[own];
      let parent=e.parentElement;
      for(let depth=0;parent&&depth<4;depth+=1,parent=parent.parentElement){
        const parts=attributes(parent);
        const text=(parent.textContent||'').replace(/\\s+/g,' ').trim();
        if(text.length>0&&text.length<=140)parts.push(text);
        tiers.push(parts);
      }
      for(const parts of tiers){
        const description=parts.filter(Boolean).join(' ').toLowerCase();
        const kinds=Object.entries(patterns).filter(([,pattern])=>pattern.test(description)).map(([name])=>name);
        if(kinds.length===1)return {kind:kinds[0],description};
      }
      return {kind:null,description:tiers.flat().filter(Boolean).join(' ').toLowerCase()};
    };
    const controls=[...document.querySelectorAll('select,input:not([type="hidden"]),button,[role="button"]')].filter((e)=>visible(e)||((e.type==='checkbox'||e.type==='radio')&&e.closest('label')&&visible(e.closest('label')))).filter((e)=>!(/refresh|刷新/i.test(e.textContent||'')||/refresh/i.test(e.id||''))).map(classify);
    const numericValue=(text)=>{const normalized=text.replace(/[^0-9.+-]/g,'');const value=Number(normalized);return Number.isFinite(value)?value:0};
    return {
      kpis:kpis.slice(0,4),
      positiveKpis:kpis.slice(0,4).filter((text)=>numericValue(text)>0).length,
      populatedCharts:populated.length,
      chartHosts:charts.length,
      selects:document.querySelectorAll('select').length,
      ranges:document.querySelectorAll('input[type="range"]').length,
      controlCounts:Object.fromEntries(Object.keys(patterns).map((kind)=>[kind,controls.filter((item)=>item.kind===kind).length])),
      hoverTargets:document.querySelectorAll('[data-tooltip],[data-tip],[data-value],[title],svg circle,svg rect').length,
      tooltipElements:document.querySelectorAll('[role="tooltip"],[class*="tooltip" i],[id*="tooltip" i],[class*="tip" i],[id*="tip" i]').length,
    };
  })()`)
}

function setSelect(client, index) {
  return evaluate(client, `(() => {
    const select=document.querySelectorAll('select')[${index}];
    if(!select)return false;
    select.dataset.evalOriginalValue=select.value;
    const option=[...select.options].find((item)=>item.value&&item.value!==select.value&&!/^all$/i.test(item.value));
    if(!option)return false;
    select.value=option.value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`)
}

function resetSelect(client, index) {
  return evaluate(client, `(() => {
    const select=document.querySelectorAll('select')[${index}];
    if(!select)return false;
    select.value=select.dataset.evalOriginalValue??select.options[0]?.value??'';
    select.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`)
}

function setRange(client) {
  return evaluate(client, `(() => {
    const input=document.querySelector('input[type="range"]');
    if(!input)return false;
    const current=Number(input.value),min=Number(input.min||0),max=Number(input.max||100),step=Number(input.step||1);
    const next=current-step>=min?current-step:Math.min(max,current+step);
    if(next===current)return false;
    input.value=String(next);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`)
}

function changedValues(before, after) { return before.kpis.join('|') !== after.kpis.join('|') }
function valuesChanged(item) { return item.before.join('|') !== item.after.join('|') }
function result(id, pass, observed) { return { id, pass: Boolean(pass), observed } }

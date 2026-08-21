const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const fileUrl = 'file://' + path.resolve(__dirname, 'artifact.html');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const R = {};

  // 1. dataset dimensions
  R.dataset = await page.evaluate(() => {
    const d = window.DATA || (typeof DATA !== 'undefined' ? DATA : null);
    if (!d) return { ok:false };
    const regions = new Set(d.rows.map(r=>r.region));
    const cats = new Set(d.rows.map(r=>r.category));
    const pers = new Set(d.rows.map(r=>r.period));
    return { ok:true, regions:regions.size, cats:cats.size, periods:pers.size, rows:d.rows.length, sample:d.rows[0] };
  });

  // 2. KPI cards populated
  R.kpis = await page.evaluate(() => {
    const ids = ['kpi-rev','kpi-ord','kpi-aov','kpi-profit'];
    return ids.map(id => { const t = document.getElementById(id).textContent.trim(); return { id, text:t, empty: t===''||t==='–' }; });
  });

  // 3. four charts populated with svg marks
  R.charts = await page.evaluate(() => {
    const out = {};
    ['chart-line','chart-bars','chart-donut','chart-scatter'].forEach(id => {
      const svg = document.getElementById(id).querySelector('svg');
      const paths = svg ? svg.querySelectorAll('path').length : 0;
      const circles = svg ? svg.querySelectorAll('circle').length : 0;
      const rects = svg ? svg.querySelectorAll('rect').length : 0;
      out[id] = { hasSvg: !!svg, paths, circles, rects, marks: paths+circles+rects };
    });
    return out;
  });

  // 4. filters update KPIs
  const before = await page.evaluate(() => document.getElementById('kpi-rev').textContent);
  await page.selectOption('#f-region', 'North');
  await page.waitForTimeout(50);
  const afterRegion = await page.evaluate(() => document.getElementById('kpi-rev').textContent);
  await page.selectOption('#f-start', '0');
  await page.selectOption('#f-end', '2');
  await page.waitForTimeout(50);
  const afterPeriod = await page.evaluate(() => document.getElementById('kpi-ord').textContent);
  R.filterChanges = { before, afterRegion, afterPeriod };
  // reset
  await page.selectOption('#f-region', 'All');
  await page.selectOption('#f-start', '0');
  await page.selectOption('#f-end', '5');
  await page.waitForTimeout(50);

  // 5. refresh changes dataset
  R.refresh = await page.evaluate(() => {
    const before = JSON.stringify(window.DATA ? DATA.rows.slice(0,3) : (typeof DATA!=='undefined'?DATA.rows.slice(0,3):null));
    const seedBefore = (window.DATA?DATA.seed:(typeof DATA!=='undefined'?DATA.seed:null));
    document.getElementById('refresh').click();
    return { changed: (window.DATA?DATA.seed:(typeof DATA!=='undefined'?DATA.seed:null)) !== seedBefore };
  });
  const revAfterRefresh = await page.evaluate(() => document.getElementById('kpi-rev').textContent);

  // 6. tooltips exist on marks (simulate hover)
  R.tooltip = await page.evaluate(async () => {
    const svg = document.getElementById('chart-bars').querySelector('svg');
    const hit = svg.querySelector('.mark-hit');
    if (!hit) return { ok:false, reason:'no .mark-hit found' };
    const r = hit.getBoundingClientRect();
    hit.dispatchEvent(new MouseEvent('mouseenter', { bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2 }));
    const tip = document.getElementById('tooltip');
    return { ok: tip.style.display !== 'none' && tip.textContent.trim().length>0, text: tip.textContent.trim() };
  });

  // 7. no JS errors
  R.errors = errors;

  await page.screenshot({ path: 'verify-screenshot.png', fullPage: true });

  console.log(JSON.stringify(R, null, 2));
  await browser.close();

  // PASS/FAIL summary
  const fails = [];
  if (!R.dataset.ok || R.dataset.regions<2 || R.dataset.cats<3 || R.dataset.periods<6) fails.push('Req1 dataset dims');
  if (R.kpis.some(k=>k.empty)) fails.push('Req2 KPI empty');
  if (['chart-line','chart-bars','chart-donut','chart-scatter'].some(id => R.charts[id].marks===0)) fails.push('Req3 charts empty');
  if (before===afterRegion) fails.push('Req4 filter no effect');
  if (!R.refresh.changed) fails.push('Req5 refresh no effect');
  if (!R.tooltip.ok) fails.push('Req6 tooltip');
  if (R.errors.length) fails.push('Req7 JS errors: '+R.errors.join(' | '));

  console.log('\n=== RESULT: ' + (fails.length? ('FAIL -> '+fails.join(', ')) : 'ALL PASS') + ' ===');
  process.exit(fails.length?1:0);
})();

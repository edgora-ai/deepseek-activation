const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  const url = 'file://' + path.resolve(__dirname, 'artifact.html');
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));

  const report = await page.evaluate(() => {
    const out = {};
    out.kpiCount = document.querySelectorAll('.kpi').length;
    out.kpiValues = Array.from(document.querySelectorAll('.kpi .value')).map(e => e.textContent.trim());
    out.kpiEmpty = Array.from(document.querySelectorAll('.kpi .value')).some(e => !e.textContent.trim() || e.textContent.trim() === '$0');
    out.linePaths = document.querySelectorAll('#lineChart path').length;
    out.lineDots = document.querySelectorAll('#lineChart circle').length;
    out.barRects = document.querySelectorAll('#barChart rect').length;
    out.donutPaths = document.querySelectorAll('#donutChart path').length;
    out.donutLegend = document.querySelectorAll('#donutLegend .item').length;
    out.scatterDots = document.querySelectorAll('#scatterChart circle').length;
    out.regionOpts = document.querySelectorAll('#regionSelect option').length;
    out.categoryOpts = document.querySelectorAll('#categorySelect option').length;
    out.startOpts = document.querySelectorAll('#startSelect option').length;
    out.note = document.getElementById('note').textContent;
    return out;
  });

  // capture KPI values for comparison
  const beforeKPIs = await page.evaluate(() => Array.from(document.querySelectorAll('.kpi .value')).map(e => e.textContent.trim()));

  // Test filter: change region to "North"
  await page.select('#regionSelect', 'North');
  await new Promise(r => setTimeout(r, 200));
  const afterRegionKPIs = await page.evaluate(() => Array.from(document.querySelectorAll('.kpi .value')).map(e => e.textContent.trim()));
  const afterRegionNote = await page.evaluate(() => document.getElementById('note').textContent);

  // reset region, change category
  await page.select('#regionSelect', 'All');
  await page.select('#categorySelect', 'Toys');
  await new Promise(r => setTimeout(r, 200));
  const afterCatNote = await page.evaluate(() => document.getElementById('note').textContent);

  // period range
  await page.select('#categorySelect', 'All');
  await page.select('#startSelect', '2');
  await page.select('#endSelect', '5');
  await new Promise(r => setTimeout(r, 200));
  const afterRangeNote = await page.evaluate(() => document.getElementById('note').textContent);

  // tooltip test on a line dot
  await page.select('#startSelect', '0');
  await page.select('#endSelect', '7');
  await new Promise(r => setTimeout(r, 200));
  const dotBox = await page.evaluate(() => {
    const c = document.querySelector('#lineChart circle');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  let tipWorks = false;
  if (dotBox) {
    await page.mouse.move(dotBox.x, dotBox.y);
    await new Promise(r => setTimeout(r, 150));
    tipWorks = await page.evaluate(() => {
      const t = document.getElementById('tooltip');
      return t.style.opacity === '1' && t.textContent.trim().length > 0;
    });
  }

  // Refresh test
  await page.click('#refreshBtn');
  await new Promise(r => setTimeout(r, 300));
  const afterRefreshKPIs = await page.evaluate(() => Array.from(document.querySelectorAll('.kpi .value')).map(e => e.textContent.trim()));
  const subAfter = await page.evaluate(() => document.getElementById('datasetSub').textContent);
  const refreshChanged = JSON.stringify(afterRefreshKPIs) !== JSON.stringify(beforeKPIs);

  await browser.close();

  console.log('=== VERIFICATION REPORT ===');
  console.log('JS errors:', errors.length ? errors : 'NONE');
  console.log('KPI cards:', report.kpiCount, '(need 4)');
  console.log('KPI values:', report.kpiValues);
  console.log('Any empty/zero KPI:', report.kpiEmpty);
  console.log('Line: paths=' + report.linePaths + ' dots=' + report.lineDots);
  console.log('Bar rects:', report.barRects);
  console.log('Donut paths:', report.donutPaths, 'legend items:', report.donutLegend);
  console.log('Scatter dots:', report.scatterDots);
  console.log('Region opts:', report.regionOpts, 'Category opts:', report.categoryOpts, 'Period opts:', report.startOpts);
  console.log('Note:', report.note);
  console.log('--- Filter tests ---');
  console.log('Region=North changed KPIs:', JSON.stringify(afterRegionKPIs) !== JSON.stringify(beforeKPIs), '|', afterRegionNote);
  console.log('Category=Toys note:', afterCatNote);
  console.log('Range 2-5 note:', afterRangeNote);
  console.log('Tooltip works on hover:', tipWorks);
  console.log('Refresh changed KPIs:', refreshChanged, '| sub:', subAfter);

  // Acceptance checks
  const checks = {
    noJsErrors: errors.length === 0,
    fourKpis: report.kpiCount === 4 && !report.kpiEmpty,
    fourCharts: report.lineDots > 1 && report.barRects >= 1 && report.donutPaths >= 1 && report.scatterDots >= 1,
    dataset: report.regionOpts > 2 && report.categoryOpts > 3 && report.startOpts >= 6,
    filtersUpdate: JSON.stringify(afterRegionKPIs) !== JSON.stringify(beforeKPIs),
    tooltip: tipWorks,
    refresh: refreshChanged,
    loadVisible: report.kpiCount === 4 && report.scatterDots >= 1
  };
  console.log('=== ACCEPTANCE ===');
  console.log(JSON.stringify(checks, null, 2));
  const allPass = Object.values(checks).every(Boolean);
  console.log(allPass ? 'RESULT: ALL PASS' : 'RESULT: FAIL');
  process.exit(allPass ? 0 : 1);
})();

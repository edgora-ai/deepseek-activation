export const id = 'fix-dashboard'
export const probeCaseId = 'dashboard'
export const outputName = 'dashboard.html'
export const fixture = new URL('../fixtures/fix-dashboard-broken.html', import.meta.url)

export function prompt(outputPath) {
  return `Fix the existing dashboard at ${outputPath}. Do not replace it with unrelated scaffolding and do not modify files outside that path.

Inspect and reproduce the defects before editing. The repaired page must satisfy all of these acceptance requirements:
1. Load with no JavaScript errors and show non-empty data immediately.
2. Keep four populated KPI cards: revenue, orders, average order value, and margin.
3. Keep four populated charts: line trend, category bars, regional donut, and spend-vs-revenue scatter.
4. Region and category filters must both update KPI and chart values.
5. Refresh data must produce a different deterministic dataset and update all values.
6. Existing tooltip behavior must continue to work.

Run a focused verification after the edit, fix every failed requirement, and stop when all requirements pass.`
}

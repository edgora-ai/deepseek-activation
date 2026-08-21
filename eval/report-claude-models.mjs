#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const ROOT = "/home/ubuntu/deepseek-activation/docs/results/eval-v5-claude-models"
const RUNS = join(ROOT, 'runs')
const MODELS = ['nv3', 'hy3', 'mino-free', 'muse-free', 'opencode-free']
const TASKS = ['blackhole', 'helicopter', 'race', 'game', 'music', 'dashboard']

const rows = []
for (const model of MODELS) {
  for (const task of TASKS) {
    const metaPath = join(RUNS, model, task, 'meta.json')
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8'))
      rows.push(flatten(meta))
    } catch {
      rows.push({ runId: `${model}-${task}`, model, task, status: 'missing', completed: false })
    }
  }
}

const completed = rows.filter((row) => row.completed)
const summary = {
  generatedAt: new Date().toISOString(),
  experiment: 'DSH headless standard × 5 free models × 6 tasks',
  total: rows.length,
  completed: completed.length,
  fullPass: completed.filter((row) => row.fullPass).length,
  rows,
  models: aggregateByModel(completed),
  tasks: aggregateByTask(completed),
}

await writeFile(join(ROOT, 'models-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
await writeFile(join(ROOT, 'models-summary.csv'), toCSV(rows))
await writeFile(join(ROOT, 'models-summary.md'), toMarkdown(summary))
await writeFile(join(ROOT, 'models-summary.html'), toHTML(summary))
console.log(JSON.stringify({ total: rows.length, completed: completed.length, fullPass: summary.fullPass, modelBest: summary.tasks.map((r) => ({ task: r.task, best: r.bestModel || '—' })) }, null, 2))

function flatten(meta) {
  const ev = meta.evaluation || {}
  const vis = meta.vision || {}
  const gen = meta.generation || {}
  return {
    runId: meta.runId,
    model: meta.model,
    task: meta.task,
    completed: true,
    durMs: meta.durationMs ?? meta.durationMs2 ?? null,
    exitCode: gen.exitCode ?? meta.exitCode ?? null,
    timedOut: Boolean(meta.timedOut ?? gen.timedOut),
    stderrSample: String(gen.stderr || '').split('\n').filter((l) => /dsh:|Error/.test(l)).slice(0, 2).join(' | '),
    fullPass: ev.fullPass ?? false,
    runtimePass: ev.runtimePass ?? false,
    syntaxPass: ev.syntaxPass ?? false,
    interactionPass: ev.interactionPass ?? false,
    visualSanity: ev.visualSanity ?? false,
    contractPassed: ev.contractPassed ?? 0,
    contractTotal: ev.contractTotal ?? 0,
    runtimeErrors: (ev.runtimeErrors ?? []).length,
    browserFailure: ev.browserFailure ?? null,
    artifactBytes: meta.artifact?.bytes ?? null,
    visionStatus: vis?.status ?? 'not-run',
    visionValid: vis?.valid ?? null,
    visionSummary: vis?.summary ?? null,
  }
}

function aggregateByModel(rows) {
  return MODELS.map((model) => {
    const items = rows.filter((row) => row.model === model)
    return {
      model,
      completed: items.length,
      fullPass: items.filter((row) => row.fullPass).length,
      runtimePass: items.filter((row) => row.runtimePass).length,
      syntaxPass: items.filter((row) => row.syntaxPass).length,
      interactionPass: items.filter((row) => row.interactionPass).length,
      visualSanity: items.filter((row) => row.visualSanity).length,
      visionOk: items.filter((row) => row.visionStatus === 'ok' && row.visionValid === true).length,
      totalArtifactBytes: items.reduce((sum, row) => sum + (row.artifactBytes || 0), 0),
      medianDurationMs: median(items.map((row) => row.durMs).filter(Number.isFinite)),
      meanContract: mean(items.map((row) => row.contractTotal ? row.contractPassed / row.contractTotal : 0)),
      providerFailures: items.filter((row) => /dsh:|400/.test(row.stderrSample)).length,
      noArtifact: items.filter((row) => !row.artifactBytes && !row.browserFailure).length,
    }
  })
}

function aggregateByTask(rows) {
  return TASKS.map((task) => {
    const items = rows.filter((row) => row.task === task)
    const best = items.filter((row) => row.fullPass).map((row) => row.model)
    return {
      task,
      completed: items.length,
      fullPassList: items.map((row) => `${row.model}:${row.fullPass ? '✅' : '❌'}`).join(' '),
      bestModel: best.join('|') || null,
      contractByModel: Object.fromEntries(MODELS.map((model) => {
        const item = items.find((row) => row.model === model)
        return [model, item ? `${item.contractPassed}/${item.contractTotal}` : '—']
      })),
      visionByModel: Object.fromEntries(MODELS.map((model) => {
        const item = items.find((row) => row.model === model)
        return [model, item?.visionStatus === 'ok' ? (item.visionValid ? 'ok' : 'invalid') : '—']
      })),
    }
  })
}

function toCSV(rows) {
  const header = ['runId', 'model', 'task', 'fullPass', 'runtimePass', 'contract', 'interactionPass', 'visualSanity', 'durMs', 'timedOut', 'exitCode', 'visionStatus', 'visionValid', 'artifactBytes', 'stderrSample']
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map((key) => {
      const value = row[key]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') return `"${value.replaceAll('"', '""')}"`
      return String(value)
    }).join(','))
  }
  return `${lines.join('\n')}\n`
}

function toMarkdown(summary) {
  const out = []
  out.push('# DSH × 免费模型 对比评测')
  out.push('')
  out.push(`DSH headless 标准模式（` + summary.experiment + `）· ${summary.completed}/${summary.total} 完成 · full pass ${summary.fullPass}`)
  out.push('')
  out.push('## 模型级汇总')
  out.push('')
  out.push('| 模型 | Full | Runtime | 合同(平均) | 交互 | 视觉 | 视觉OK | 时长中位 | 产物KB | provider失败 |')
  out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const m of summary.models) {
    out.push(`| ${m.model} | ${m.fullPass}/${m.completed} | ${m.runtimePass} | ${(m.meanContract * 100).toFixed(0)}% | ${m.interactionPass} | ${m.visualSanity} | ${m.visionOk} | ${fmtMs(m.medianDurationMs)} | ${Math.round(m.totalArtifactBytes / 1024)} | ${m.providerFailures} |`)
  }
  out.push('')
  out.push('## 任务级 PK（每任务各模型表现）')
  out.push('')
  out.push('| 任务 | 结果 | 最佳 | 合同(各模型) | 视觉(各模型) |')
  out.push('|---|---|---|---|---|')
  for (const t of summary.tasks) {
    const contract = MODELS.map((m) => `${short(m)}:${t.contractByModel[m]}`).join(' ')
    const vision = MODELS.map((m) => `${short(m)}:${t.visionByModel[m]}`).join(' ')
    out.push(`| ${t.task} | ${t.fullPassList} | ${t.bestModel || '—'} | ${contract} | ${vision} |`)
  }
  out.push('')
  out.push('## 逐 run')
  out.push('')
  out.push('| 模型 | 任务 | Full | Runtime | 合同 | 交互 | 视觉 | 时长 | 视觉判定 | 错误 |')
  out.push('|---|---|---:|---:|---:|---:|---:|---:|---|---|')
  for (const row of sortedRows(summary.rows)) {
    const contract = row.contractTotal ? `${row.contractPassed}/${row.contractTotal}` : '—'
    const vision = row.visionStatus === 'ok' ? (row.visionValid ? 'ok' : 'invalid') : (row.visionStatus === 'not-run' ? '—' : 'n/a')
    out.push(`| ${row.model} | ${row.task} | ${row.fullPass ? '✅' : '❌'} | ${row.runtimePass ? '✅' : '❌'} | ${contract} | ${row.interactionPass ? '✅' : '❌'} | ${row.visualSanity ? '✅' : '❌'} | ${fmtMs(row.durMs)} | ${vision} | ${shorter(row.stderrSample)} |`)
  }
  return `${out.join('\n')}\n`
}

function toHTML(summary) {
  const modelRows = summary.models.map((m) => `<tr><td><b>${m.model}</b></td><td>${m.fullPass}/${m.completed}</td><td>${m.runtimePass}</td><td>${(m.meanContract * 100).toFixed(0)}%</td><td>${m.interactionPass}</td><td>${m.visualSanity}</td><td>${m.visionOk}</td><td>${fmtMs(m.medianDurationMs)}</td><td>${Math.round(m.totalArtifactBytes / 1024)}</td><td>${m.providerFailures}</td></tr>`).join('')
  const taskRows = summary.tasks.map((t) => `<tr><td>${t.task}</td><td>${t.fullPassList}</td><td>${t.bestModel || '—'}</td><td>${MODELS.map((m) => `${m}:${t.contractByModel[m]}`).join(' ')}</td><td>${MODELS.map((m) => `${m}:${t.visionByModel[m]}`).join(' ')}</td></tr>`).join('')
  const rowHtml = sortedRows(summary.rows).map((row) => {
    const contract = row.contractTotal ? `${row.contractPassed}/${row.contractTotal}` : '—'
    const vision = row.visionStatus === 'ok' ? (row.visionValid ? 'ok' : 'invalid') : (row.visionStatus === 'not-run' ? '—' : 'n/a')
    return `<tr><td>${row.model}</td><td>${row.task}</td><td>${row.fullPass ? '✅' : '❌'}</td><td>${row.runtimePass ? '✅' : '❌'}</td><td>${contract}</td><td>${row.interactionPass ? '✅' : '❌'}</td><td>${row.visualSanity ? '✅' : '❌'}</td><td>${fmtMs(row.durMs)}</td><td>${vision}</td><td>${shorter(row.stderrSample)}</td></tr>`
  }).join('')
  const story = concurrencyNote()
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>DSH 免费模型对比</title>
<style>
:root{color-scheme:light;--bg:#f7f7f5;--card:#fff;--text:#1a1a1a;--muted:#666;--border:#e3e3df;--ok:#1a7f37;--bad:#b42318;}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#141414;--card:#1e1e1e;--text:#e8e8e6;--muted:#9c9c94;--border:#333;--ok:#3fb950;--bad:#f85149;}}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.wrap{max-width:1200px;margin:0 auto;padding:32px 20px 64px}.ovf{overflow-x:auto}
h1{font-size:1.6em;margin:0 0 4px}.sub{color:var(--muted);margin-bottom:20px}
h2{font-size:1.2em;margin:30px 0 10px;border-bottom:1px solid var(--border);padding-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:.88em}th,td{text-align:left;padding:6px 9px;border-bottom:1px solid var(--border);white-space:nowrap}
th{font-weight:600}.ok{color:var(--ok)}.bad{color:var(--bad)}
.meta{color:var(--muted);font-size:.85em;margin-top:30px;line-height:1.7}
</style></head><body><div class="wrap">
<h1>DSH 标准模式 × 免费模型 对比评测</h1>
<div class="sub">${summary.completed}/${summary.total} 完成 · full pass ${summary.fullPass} · 生成于 ${summary.generatedAt}</div>
<h2>模型级</h2>
<div class="ovf"><table><tr><th>模型</th><th>Full</th><th>Runtime</th><th>合同质量</th><th>交互</th><th>视觉</th><th>视觉OK</th><th>时长中位</th><th>产物KB</th><th>provider失败</th></tr>${modelRows}</table></div>
<h2>任务级 PK</h2>
<div class="ovf"><table><tr><th>任务</th><th>各模型结果</th><th>最佳</th><th>合同(各模型)</th><th>视觉(各模型)</th></tr>${taskRows}</table></div>
<h2>逐 run</h2>
<div class="ovf"><table><tr><th>模型</th><th>任务</th><th>Full</th><th>Runtime</th><th>合同</th><th>交互</th><th>视觉</th><th>时长</th><th>视觉判定</th><th>错误</th></tr>${rowHtml}</table></div>
<div class="meta">方法：语法 + 浏览器 runtime + 合同 + 交互 + 像素 sanity + gpt-5.6 视觉判定。${story}</div>
</div></body></html>
`
}

function concurrencyNote() {
  return '5 个模型各用独立 DSH_HOME 并行（/tmp/dsh-model-homes/<model>），每模型 6 任务串行；DSH 不暴露逐 session token 归属，故不列 token。'
}

function sortedRows(rows) {
  return [...rows.filter((r) => r.completed)].sort((a, b) => (MODELS.indexOf(a.model) - MODELS.indexOf(b.model)) || TASKS.indexOf(a.task) - TASKS.indexOf(b.task))
}
function short(m) { return m.replace('-free', '') }
function shorter(s) { return s ? s.slice(0, 90) : '' }
function median(values) { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2 }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 }
function fmtMs(v) { if (v === null || v === undefined) return '—'; if (v < 60_000) return `${Math.round(v / 1000)}s`; return `${Math.round(v / 60_000)}m${Math.round((v % 60_000) / 1000)}s` }
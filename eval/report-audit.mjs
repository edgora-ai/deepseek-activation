#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const ROOT = join(REPO, 'docs/results/eval-v2/audit')
const audit = JSON.parse(await readFile(join(ROOT, 'artifact-scores.json'), 'utf8'))
const classified = audit.rows.map((row) => ({ ...row, ...classify(row.artifact), contractRatio: row.contractTotal ? row.contractPassed / row.contractTotal : 0 }))
const comparisons = ['claude', 'codex', 'opencode'].map((client) => compareClient(classified, client, 'no-rules', 'current'))
comparisons.push(compareClient(classified, 'dsh', 'minimal', 'router-standard'))
const output = {
  generatedAt: new Date().toISOString(),
  auditGeneratedAt: audit.generatedAt,
  note: 'Each paired task has one historical artifact per variant; these comparisons are descriptive, not repeated controlled evidence.',
  comparisons,
}
await writeFile(join(ROOT, 'comparisons.json'), `${JSON.stringify(output, null, 2)}\n`)
await writeFile(join(ROOT, 'comparisons.md'), toMarkdown(output))
console.log(JSON.stringify(output, null, 2))

function compareClient(rows, client, baselineVariant, testedVariant) {
  const selected = rows.filter((row) => row.client === client)
  const caseIds = [...new Set(selected.map((row) => row.caseId))]
  const pairs = caseIds.flatMap((caseId) => {
    const baseline = selected.find((row) => row.caseId === caseId && row.variant === baselineVariant)
    const tested = selected.find((row) => row.caseId === caseId && row.variant === testedVariant)
    return baseline && tested ? [{
      caseId,
      baseline: metrics(baseline),
      tested: metrics(tested),
      fullPassDelta: Number(tested.fullPass) - Number(baseline.fullPass),
      contractDelta: tested.contractRatio - baseline.contractRatio,
    }] : []
  })
  return {
    client,
    baselineVariant,
    testedVariant,
    pairedCases: pairs.length,
    baselineFullPass: pairs.filter((pair) => pair.baseline.fullPass).length,
    testedFullPass: pairs.filter((pair) => pair.tested.fullPass).length,
    baselineRuntimePass: pairs.filter((pair) => pair.baseline.runtimePass).length,
    testedRuntimePass: pairs.filter((pair) => pair.tested.runtimePass).length,
    baselineMedianContract: median(pairs.map((pair) => pair.baseline.contractRatio)),
    testedMedianContract: median(pairs.map((pair) => pair.tested.contractRatio)),
    improvedCases: pairs.filter((pair) => pair.fullPassDelta > 0 || pair.fullPassDelta === 0 && pair.contractDelta > 0).map((pair) => pair.caseId),
    regressedCases: pairs.filter((pair) => pair.fullPassDelta < 0 || pair.fullPassDelta === 0 && pair.contractDelta < 0).map((pair) => pair.caseId),
    tiedCases: pairs.filter((pair) => pair.fullPassDelta === 0 && pair.contractDelta === 0).map((pair) => pair.caseId),
    pairs,
  }
}

function classify(path) {
  const name = path.toLowerCase()
  if (name.includes('dsh-router-standard')) return { client: 'dsh', variant: 'router-standard' }
  if (name.includes('dsh-minimal')) return { client: 'dsh', variant: 'minimal' }
  if (name.includes('codex')) return { client: 'codex', variant: /no-?rules|norules/.test(name) ? 'no-rules' : 'current' }
  if (name.includes('opencode') || name.includes('/n2/') && name.includes('-oc-')) return { client: 'opencode', variant: /no-?rules|norules/.test(name) ? 'no-rules' : 'current' }
  if (name.includes('claude')) {
    if (name.includes('sonnet')) return { client: 'claude', variant: 'sonnet-control' }
    if (/no-?rules|norules/.test(name)) return { client: 'claude', variant: 'no-rules' }
    return { client: 'claude', variant: 'current' }
  }
  return { client: 'unknown', variant: 'unknown' }
}

function metrics(row) {
  return {
    artifact: row.artifact,
    syntaxPass: row.syntaxPass,
    runtimePass: row.runtimePass,
    contractRatio: row.contractRatio,
    interactionPass: row.interactionPass,
    visualSanity: row.visualSanity,
    fullPass: row.fullPass,
  }
}

function toMarkdown(output) {
  const lines = [
    '# Historical Paired Comparisons',
    '',
    '> Each task has one artifact per variant. These figures describe the exploratory corpus and do not establish repeatability or causation.',
    '',
    '| Client | Baseline | Tested | Paired cases | Full pass | Runtime clean | Median contract | Improved | Regressed | Tied |',
    '|---|---|---|---:|---:|---:|---:|---|---|---|',
    ...output.comparisons.map((item) => `| ${item.client} | ${item.baselineVariant} | ${item.testedVariant} | ${item.pairedCases} | ${item.baselineFullPass} → ${item.testedFullPass} | ${item.baselineRuntimePass} → ${item.testedRuntimePass} | ${percent(item.baselineMedianContract)} → ${percent(item.testedMedianContract)} | ${list(item.improvedCases)} | ${list(item.regressedCases)} | ${list(item.tiedCases)} |`),
    '',
    'The machine-readable file beside this report contains every paired artifact and delta.',
    '',
  ]
  return lines.join('\n')
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function percent(value) { return value == null ? 'null' : `${(value * 100).toFixed(1)}%` }
function list(values) { return values.length ? values.join(', ') : '—' }

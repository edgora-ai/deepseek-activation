#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectPage,
  launchBrowser,
  screenshotBytes,
  startStaticServer,
  writeScreenshot,
} from './lib/cdp.mjs'
import { caseIdForPath, evaluateCase } from './cases/index.mjs'
import { checkInlineJavaScript, sourceSignals } from './lib/static.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const RESULTS = join(REPO, 'docs/results')
const OUTPUT = join(RESULTS, 'eval-v2/audit')
const SCREENSHOTS = join(OUTPUT, 'screenshots')
const args = parseArgs(process.argv.slice(2))

await mkdir(SCREENSHOTS, { recursive: true })
const files = (await collectHTML()).filter((path) => !args.match || path.includes(args.match)).slice(0, args.limit)
if (files.length === 0) throw new Error('no HTML artifacts matched the audit selection')

const server = await startStaticServer(REPO)
const browser = await launchBrowser()
const rows = []
try {
  for (const [index, path] of files.entries()) {
    const rel = relative(REPO, path)
    process.stdout.write(`[${index + 1}/${files.length}] ${rel} ... `)
    const started = Date.now()
    const source = await readFile(path, 'utf8')
    const syntax = checkInlineJavaScript(source)
    const signals = sourceSignals(source)
    const caseId = caseIdForPath(`/${rel}`)
    const screenshotName = rel.replace(/^docs\/results\//, '').replaceAll('/', '__').replace(/\.html$/, '.png')
    const expectedScreenshot = join(RESULTS, 'screenshots', relative(RESULTS, path)).replace(/\.html$/, '.png')
    const url = `${server.baseURL}/${rel.split('/').map(encodeURIComponent).join('/')}`
    let page
    let evaluation
    let browserFailure = null
    try {
      page = await inspectPage(browser, url, { settleMs: settleTime(caseId) })
      evaluation = await evaluateCase({ caseId, source, page, client: browser.client })
      await writeScreenshot(join(SCREENSHOTS, screenshotName), evaluation.interaction.after)
    } catch (error) {
      browserFailure = error.stack || error.message
    } finally {
      page?.dispose()
    }

    const runtimeErrors = page ? [...page.exceptions, ...page.consoleErrors, ...page.logErrors] : []
    const runtimePass = !browserFailure && runtimeErrors.length === 0
    const screenshotSize = page ? screenshotBytes(evaluation?.interaction.after || page.before) : 0
    const visualSanity = hasVisualContent(page, screenshotSize, caseId)
    const interactionPass = Boolean(evaluation?.interaction.actionFound && evaluation?.interaction.changed)
    const contractPass = Boolean(evaluation && evaluation.contractPassed === evaluation.contractTotal)
    const row = {
      artifact: rel,
      caseId,
      bytes: Buffer.byteLength(source),
      generated: true,
      syntaxPass: syntax.pass,
      syntaxFailures: syntax.failures,
      runtimePass,
      runtimeErrors,
      browserFailure,
      contractPassed: evaluation?.contractPassed ?? 0,
      contractTotal: evaluation?.contractTotal ?? 0,
      contractChecks: evaluation?.checks ?? [],
      interactionPass,
      interaction: evaluation?.interaction ? {
        action: evaluation.interaction.action,
        actionFound: evaluation.interaction.actionFound,
        changed: evaluation.interaction.changed,
      } : null,
      visualSanity,
      screenshotBytes: screenshotSize,
      screenshot: relative(REPO, join(SCREENSHOTS, screenshotName)),
      legacyScreenshotPresent: await exists(expectedScreenshot),
      externalResources: signals.externalResources,
      placeholderCount: signals.placeholderCount,
      runtimeSnapshot: page?.runtime ?? null,
      visualStats: page?.visual ?? null,
      durationMs: Date.now() - started,
      fullPass: syntax.pass && runtimePass && contractPass && interactionPass && visualSanity,
    }
    rows.push(row)
    await writeFile(join(OUTPUT, 'artifact-scores.partial.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`)
    console.log(row.fullPass ? 'PASS' : 'FAIL')
  }
} finally {
  await browser.close()
  await server.close()
}

const summary = summarize(rows)
await writeFile(join(OUTPUT, 'artifact-scores.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2)}\n`)
await writeFile(join(OUTPUT, 'artifact-scores.csv'), toCSV(rows))
await writeFile(join(OUTPUT, 'README.md'), toMarkdown(summary, rows))
await rm(join(OUTPUT, 'artifact-scores.partial.json'), { force: true })
console.log(JSON.stringify(summary, null, 2))

async function collectHTML() {
  const groups = ['round2', 'helo', 'race', 'n2']
  const paths = []
  for (const group of groups) {
    for (const name of await readdir(join(RESULTS, group))) {
      if (name.endsWith('.html')) paths.push(join(RESULTS, group, name))
    }
  }
  return paths.sort()
}

function summarize(rows) {
  const cases = {}
  for (const row of rows) {
    const current = cases[row.caseId] || { total: 0, fullPass: 0, runtimePass: 0, syntaxPass: 0 }
    current.total += 1
    current.fullPass += Number(row.fullPass)
    current.runtimePass += Number(row.runtimePass)
    current.syntaxPass += Number(row.syntaxPass)
    cases[row.caseId] = current
  }
  return {
    total: rows.length,
    generated: rows.filter((row) => row.generated).length,
    syntaxPass: rows.filter((row) => row.syntaxPass).length,
    runtimePass: rows.filter((row) => row.runtimePass).length,
    contractPass: rows.filter((row) => row.contractTotal > 0 && row.contractPassed === row.contractTotal).length,
    interactionPass: rows.filter((row) => row.interactionPass).length,
    visualSanity: rows.filter((row) => row.visualSanity).length,
    fullPass: rows.filter((row) => row.fullPass).length,
    legacyScreenshots: rows.filter((row) => row.legacyScreenshotPresent).length,
    cases,
  }
}

function toCSV(rows) {
  const fields = ['artifact', 'caseId', 'bytes', 'syntaxPass', 'runtimePass', 'contractPassed', 'contractTotal', 'interactionPass', 'visualSanity', 'fullPass', 'legacyScreenshotPresent', 'durationMs']
  const lines = [fields.join(',')]
  for (const row of rows) lines.push(fields.map((field) => csv(row[field])).join(','))
  return `${lines.join('\n')}\n`
}

function toMarkdown(summary, rows) {
  const failures = rows.filter((row) => !row.fullPass)
  const lines = [
    '# Existing Artifact Audit',
    '',
    '> Machine-generated by `node eval/audit-existing.mjs`. Existing artifacts are preserved unchanged.',
    '',
    '## Summary',
    '',
    '| Metric | Passed | Total |',
    '|---|---:|---:|',
    `| Generated file | ${summary.generated} | ${summary.total} |`,
    `| JavaScript syntax | ${summary.syntaxPass} | ${summary.total} |`,
    `| Runtime clean | ${summary.runtimePass} | ${summary.total} |`,
    `| Full contract | ${summary.contractPass} | ${summary.total} |`,
    `| Interaction | ${summary.interactionPass} | ${summary.total} |`,
    `| Visual sanity | ${summary.visualSanity} | ${summary.total} |`,
    `| Full pass | ${summary.fullPass} | ${summary.total} |`,
    `| Legacy screenshot present | ${summary.legacyScreenshots} | ${summary.total} |`,
    '',
    '## Non-passing artifacts',
    '',
    '| Artifact | Syntax | Runtime | Contract | Interaction | Visual |',
    '|---|---:|---:|---:|---:|---:|',
    ...failures.map((row) => `| \`${row.artifact}\` | ${mark(row.syntaxPass)} | ${mark(row.runtimePass)} | ${row.contractPassed}/${row.contractTotal} | ${mark(row.interactionPass)} | ${mark(row.visualSanity)} |`),
    '',
    'The JSON file beside this report contains each assertion and the observed browser errors.',
    '',
  ]
  return lines.join('\n')
}

function hasVisualContent(page, screenshotSize, caseId) {
  if (!page || screenshotSize <= 5_000) return false
  const visual = page.visual
  const varied = visual && visual.lumaVariance > 8 && visual.nonDarkRatio > 0.002 && visual.colorBuckets > 3
  const sceneCentered = !['blackhole', 'helicopter', 'game', 'race'].includes(caseId) || visual.centerNonDarkRatio > 0.002
  const surface = page.runtime.textLength > 20 || page.runtime.canvasCount > 0 || page.runtime.svgCount > 0
  return Boolean(varied && sceneCentered && surface)
}

function mark(value) { return value ? 'PASS' : 'FAIL' }
function csv(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
function settleTime(caseId) { return ['blackhole', 'helicopter'].includes(caseId) ? 5_000 : 2_000 }
async function exists(path) { try { await readFile(path); return true } catch { return false } }
function parseArgs(argv) {
  const result = { limit: Number.POSITIVE_INFINITY, match: '' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--limit') result.limit = Number(argv[++index])
    else if (argv[index] === '--match') result.match = argv[++index]
    else throw new Error(`unknown argument: ${argv[index]}`)
  }
  return result
}

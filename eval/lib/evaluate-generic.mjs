import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { evaluateCase, caseIdForPath } from '../cases/index.mjs'
import { checkInlineJavaScript, sourceSignals } from './static.mjs'
import { inspectPage, launchBrowser, screenshotBytes, startStaticServer, writeScreenshot } from './cdp.mjs'

/**
 * Evaluate one generated single-file HTML artifact generically. Browser
 * runtime is authoritative: page errors, console errors, and log errors fail
 * the runtime gate regardless of source signals. Task contract checks come
 * from cases/index.mjs and are machine-testable.
 */
export async function evaluateGenericArtifact({ runDir, outputPath, caseId }) {
  return evaluate({ runDir, outputPath, caseId })
}

async function evaluate({ runDir, outputPath, caseId }) {
  let source
  try {
    source = await readFile(outputPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyEvaluation(`target artifact was not generated`)
    throw error
  }
  const artifactHash = sha256(source)
  const syntax = checkInlineJavaScript(source)
  const signals = sourceSignals(source)
  const server = await startStaticServer(runDir)
  const browser = await launchBrowser()
  let page
  let benchmark
  let browserFailure = null
  let screenshotSize = 0
  const screenshotPath = join(runDir, 'screenshot.png')
  try {
    page = await inspectPage(browser, `${server.baseURL}/${encodeURIComponent(basename(outputPath))}`, { settleMs: caseId === 'race' ? 3_000 : 2_000 })
    const outcome = await evaluateCase({ caseId, source, page, client: browser.client })
    benchmark = outcome
    const screenshot = await page.after(caseId === 'race' ? 2_000 : 700)
    screenshotSize = screenshotBytes(screenshot)
    await writeScreenshot(screenshotPath, screenshot)
  } catch (error) {
    browserFailure = error.stack || error.message
  } finally {
    page?.dispose()
    await browser.close()
    await server.close()
  }
  const runtimeErrors = page ? [...page.exceptions, ...page.consoleErrors, ...page.logErrors] : []
  const runtimePass = !browserFailure && runtimeErrors.length === 0
  const visualSanity = hasVisualContent(page, screenshotSize)
  const checks = benchmark?.checks ?? []
  const contractPassed = checks.filter((item) => item.pass).length
  const contractTotal = checks.length
  const contractPass = contractTotal > 0 && contractPassed === contractTotal
  const interaction = benchmark?.interaction
  const interactionPass = Boolean(interaction?.changed)
  return {
    methodVersion: 6,
    generated: true,
    artifactHash,
    bytes: Buffer.byteLength(source),
    syntaxPass: syntax.pass,
    syntaxFailures: syntax.failures,
    runtimePass,
    runtimeErrors,
    browserFailure,
    contractPassed,
    contractTotal,
    contractChecks: checks.map((item) => ({ id: item.id, label: item.label, pass: item.pass, detail: item.detail })),
    interactionPass,
    interaction,
    visualSanity,
    screenshot: screenshotSize ? 'screenshot.png' : null,
    screenshotBytes: screenshotSize,
    externalResources: signals.externalResources,
    placeholderCount: signals.placeholderCount,
    runtimeSnapshot: page?.runtime ?? null,
    visualStats: page?.visual ?? null,
    fullPass: syntax.pass && runtimePass && contractPass && interactionPass && visualSanity,
  }
}

function emptyEvaluation(reason) {
  return {
    methodVersion: 6,
    generated: false,
    artifactHash: null,
    bytes: 0,
    syntaxPass: false,
    syntaxFailures: [],
    runtimePass: false,
    runtimeErrors: [],
    browserFailure: reason,
    contractPassed: 0,
    contractTotal: 0,
    contractChecks: [],
    interactionPass: false,
    interaction: null,
    visualSanity: false,
    screenshot: null,
    screenshotBytes: 0,
    externalResources: [],
    placeholderCount: 0,
    runtimeSnapshot: null,
    visualStats: null,
    fullPass: false,
  }
}

function hasVisualContent(page, screenshotSize) {
  if (!page || screenshotSize <= 5_000) return false
  const visual = page.visual
  const varied = visual && visual.lumaVariance > 8 && visual.nonDarkRatio > 0.002 && visual.colorBuckets > 3
  const surface = page.runtime.textLength > 20 || page.runtime.canvasCount > 0 || page.runtime.svgCount > 0
  return Boolean(varied && surface)
}

function sha256(value) { return createHash('sha256').update(value).digest('hex') }
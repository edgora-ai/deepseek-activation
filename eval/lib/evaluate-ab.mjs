import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { verifyDashboardBenchmark } from '../cases/benchmark-dashboard.mjs'
import {
  inspectPage,
  launchBrowser,
  screenshotBytes,
  startStaticServer,
  writeScreenshot,
} from './cdp.mjs'
import { checkInlineJavaScript, sourceSignals } from './static.mjs'

/** Evaluate one generated A/B dashboard with static, browser, contract, and interaction checks. */
export async function evaluateAbArtifact({ runDir, outputPath, requireSelfContained, initialArtifactHash }) {
  if (!await exists(outputPath)) return emptyEvaluation('target artifact was not generated')
  const source = await readFile(outputPath, 'utf8')
  const artifactHash = sha256(source)
  const artifactChanged = initialArtifactHash == null || artifactHash !== initialArtifactHash
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
    page = await inspectPage(browser, `${server.baseURL}/${encodeURIComponent(relative(runDir, outputPath))}`, { settleMs: 2_000 })
    benchmark = await verifyDashboardBenchmark(browser.client)
    if (requireSelfContained) {
      benchmark.checks.push({
        id: 'self-contained',
        pass: signals.externalResources.length === 0,
        observed: signals.externalResources,
      })
      benchmark.passed = benchmark.checks.filter((item) => item.pass).length
      benchmark.total = benchmark.checks.length
    }
    const screenshot = await page.after(150)
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
  const interactionIds = ['refresh-changes-data', 'region-filter-updates', 'category-filter-updates', 'period-updates']
  const interactionChecks = checks.filter((item) => interactionIds.includes(item.id))
  const interactionPass = interactionChecks.length === interactionIds.length && interactionChecks.every((item) => item.pass)
  const contractPassed = checks.filter((item) => item.pass).length
  const contractTotal = checks.length
  const contractPass = contractTotal > 0 && contractPassed === contractTotal
  return {
    methodVersion: 5,
    generated: true,
    artifactChanged,
    artifactHash,
    bytes: Buffer.byteLength(source),
    syntaxPass: syntax.pass,
    syntaxFailures: syntax.failures,
    runtimePass,
    runtimeErrors,
    browserFailure,
    contractPassed,
    contractTotal,
    contractChecks: checks,
    interactionPass,
    visualSanity,
    screenshot: screenshotSize ? 'screenshot.png' : null,
    screenshotBytes: screenshotSize,
    externalResources: signals.externalResources,
    placeholderCount: signals.placeholderCount,
    runtimeSnapshot: page?.runtime ?? null,
    visualStats: page?.visual ?? null,
    benchmark: benchmark ? {
      initial: benchmark.initial,
      refreshed: benchmark.refreshed,
      controls: benchmark.controls,
      hover: benchmark.hover,
      selectResults: benchmark.selectResults,
      range: benchmark.range,
    } : null,
    fullPass: artifactChanged && syntax.pass && runtimePass && contractPass && interactionPass && visualSanity,
  }
}

function hasVisualContent(page, screenshotSize) {
  if (!page || screenshotSize <= 5_000) return false
  const visual = page.visual
  const varied = visual && visual.lumaVariance > 8 && visual.nonDarkRatio > 0.002 && visual.colorBuckets > 3
  const surface = page.runtime.textLength > 20 || page.runtime.canvasCount > 0 || page.runtime.svgCount > 0
  return Boolean(varied && surface)
}

function emptyEvaluation(reason) {
  return {
    methodVersion: 5,
    generated: false,
    artifactChanged: false,
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
    visualSanity: false,
    screenshot: null,
    screenshotBytes: 0,
    externalResources: [],
    placeholderCount: 0,
    runtimeSnapshot: null,
    visualStats: null,
    benchmark: null,
    fullPass: false,
  }
}

async function exists(path) {
  try {
    await readFile(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

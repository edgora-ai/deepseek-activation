#!/usr/bin/env node
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateAbArtifact } from './lib/evaluate-ab.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const RUNS = join(REPO, 'docs/results/eval-v2/runs')
const expected = parseExpected(process.argv.slice(2))
const metaPaths = await findMetaFiles(RUNS)
if (expected != null && metaPaths.length !== expected) {
  throw new Error(`expected ${expected} run metadata files, found ${metaPaths.length}`)
}

for (const metaPath of metaPaths) {
  const meta = JSON.parse(await readFile(metaPath, 'utf8'))
  const runDir = dirname(metaPath)
  const slotMatch = metaPath.match(/\/slot-(\d+)\//)
  if (meta.slot == null && slotMatch) meta.slot = Number(slotMatch[1])
  const outputPath = join(runDir, meta.artifact || 'dashboard.html')
  const started = Date.now()
  const evaluation = await evaluateAbArtifact({
    runDir,
    outputPath,
    requireSelfContained: meta.caseId === 'build-dashboard',
    initialArtifactHash: meta.fixtureHash,
  })
  meta.evaluation = evaluation
  meta.evaluationDurationMs = Date.now() - started
  meta.totalDurationMs = meta.durationMs + meta.evaluationDurationMs
  meta.reevaluatedAt = new Date().toISOString()
  const temporary = `${metaPath}.tmp`
  await writeFile(temporary, `${JSON.stringify(meta, null, 2)}\n`)
  await rename(temporary, metaPath)
  console.log(`[recheck] ${meta.runId} contract=${evaluation.contractPassed}/${evaluation.contractTotal} runtime=${evaluation.runtimePass} full=${evaluation.fullPass}`)
}

console.log(`[recheck-done] runs=${metaPaths.length} method=5`)

async function findMetaFiles(root) {
  const paths = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.name === 'meta.json') paths.push(path)
    }
  }
  await visit(root)
  return paths.sort()
}

function parseExpected(args) {
  const index = args.indexOf('--expect')
  if (index < 0) return null
  const value = Number(args[index + 1])
  if (!Number.isInteger(value) || value < 0) throw new Error('--expect requires a non-negative integer')
  return value
}

#!/usr/bin/env node
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../docs/results/eval-v2/runs')
const expected = parseExpected(process.argv.slice(2))
const paths = await findMeta(ROOT)

if (paths.length !== expected) {
  throw new Error(`expected ${expected} metadata files, found ${paths.length}`)
}

for (const path of paths) {
  const meta = JSON.parse(await readFile(path, 'utf8'))
  if (meta.executionMode === undefined) {
    if (meta.runId === 'opencode-build-dashboard-r2-candidate-v2') {
      meta.executionMode = 'serial-cases-overlapped'
      meta.concurrencyGroup = 'r2-slot-2'
      meta.executionEvidence = {
        incident:
          'docs/results/eval-v2/operational-incidents/parallel-companion-collision/incident.json',
        overlapSessionTitle: 'opencode-fix-dashboard-r2-slot-2',
        overlapStartedEpochMs: 1787240419519,
        overlapUpdatedEpochMs: 1787240686399,
        note:
          'The build began in the serial batch and overlapped an uncoordinated companion during its final 450 seconds. Tokens remain independently attributable; wall time is not a serial-comparable observation.',
      }
    } else {
      meta.executionMode = 'serial-cases'
      meta.concurrencyGroup = null
    }
  }
  validateExecution(meta)
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(meta, null, 2)}\n`)
  await rename(temporary, path)
  console.log(
    `[execution] run=${meta.runId} mode=${meta.executionMode} `
    + `group=${meta.concurrencyGroup ?? 'none'}`,
  )
}

console.log(`[execution-done] runs=${paths.length}`)

function validateExecution(meta) {
  const expectedGroup = `r${meta.repeat}-slot-${meta.slot}`
  if (meta.executionMode === 'serial-cases') {
    if (meta.concurrencyGroup !== null) {
      throw new Error(`${meta.runId}: serial execution must have a null group`)
    }
    return
  }
  if (![
    'parallel-cases',
    'resume-single',
    'serial-cases-overlapped',
  ].includes(meta.executionMode)) {
    throw new Error(`${meta.runId}: unknown execution mode ${meta.executionMode}`)
  }
  if (meta.concurrencyGroup !== expectedGroup) {
    throw new Error(
      `${meta.runId}: expected concurrency group ${expectedGroup}, found ${meta.concurrencyGroup}`,
    )
  }
}

function parseExpected(args) {
  if (args.length !== 2 || args[0] !== '--expect') {
    throw new Error('usage: node eval/recheck-execution.mjs --expect N')
  }
  const value = Number(args[1])
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--expect must be a positive integer')
  }
  return value
}

async function findMeta(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const paths = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await findMeta(path))
    else if (entry.name === 'meta.json') paths.push(path)
  }
  return paths.sort()
}

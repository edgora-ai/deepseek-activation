#!/usr/bin/env node
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  detectOpenCodeInfrastructureFailure,
  OPENCODE_INFRASTRUCTURE_METHOD_VERSION,
} from './lib/opencode-infrastructure.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../docs/results/eval-v2/runs')
const expected = parseExpected(process.argv.slice(2))
const paths = await findMeta(ROOT)

if (paths.length !== expected) {
  throw new Error(`expected ${expected} metadata files, found ${paths.length}`)
}

for (const path of paths) {
  const meta = JSON.parse(await readFile(path, 'utf8'))
  const runDir = dirname(path)
  const [stdout, stderr] = await Promise.all([
    readFile(join(runDir, meta.stdout), 'utf8'),
    readFile(join(runDir, meta.stderr), 'utf8'),
  ])
  const detected = meta.client === 'opencode'
    ? detectOpenCodeInfrastructureFailure(stdout, stderr)
    : null
  const priorMethodVersion = meta.infrastructureMethodVersion ?? 1
  const priorFailure = meta.infrastructureFailure ?? null

  if (
    priorMethodVersion !== OPENCODE_INFRASTRUCTURE_METHOD_VERSION
    || JSON.stringify(priorFailure) !== JSON.stringify(detected)
  ) {
    meta.infrastructureClassificationHistory = [
      ...(meta.infrastructureClassificationHistory ?? []),
      {
        methodVersion: priorMethodVersion,
        failure: priorFailure,
        replacedBecause:
          'method 1 scanned model-visible stdout text; method 2 accepts structured stdout errors and process stderr only',
      },
    ]
  }

  meta.infrastructureMethodVersion = OPENCODE_INFRASTRUCTURE_METHOD_VERSION
  meta.infrastructureFailure = detected
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(meta, null, 2)}\n`)
  await rename(temporary, path)
  console.log(
    `[infrastructure] run=${meta.runId} method=${OPENCODE_INFRASTRUCTURE_METHOD_VERSION} `
    + `failure=${detected?.kind ?? 'none'}`,
  )
}

console.log(
  `[infrastructure-done] runs=${paths.length} method=${OPENCODE_INFRASTRUCTURE_METHOD_VERSION}`,
)

function parseExpected(args) {
  if (args.length !== 2 || args[0] !== '--expect') {
    throw new Error('usage: node eval/recheck-infrastructure.mjs --expect N')
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

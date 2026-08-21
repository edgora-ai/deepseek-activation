#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../docs/results/eval-v2/runs')
const DB = resolve(process.env.HOME || '/home/ubuntu', '.local/share/opencode/opencode.db')
const expected = parseExpected(process.argv.slice(2))
const paths = await findMeta(ROOT)

if (paths.length !== expected) {
  throw new Error(`expected ${expected} metadata files, found ${paths.length}`)
}

const sessionIds = new Set()
for (const path of paths) {
  const meta = JSON.parse(await readFile(path, 'utf8'))
  if (meta.usage?.status !== 'attributed' || !meta.usage.sessionId) {
    throw new Error(`${meta.runId}: usage is not attributed`)
  }
  if (sessionIds.has(meta.usage.sessionId)) {
    throw new Error(`${meta.runId}: duplicate session id ${meta.usage.sessionId}`)
  }
  sessionIds.add(meta.usage.sessionId)

  const byId = query(
    `SELECT id,title,directory,model,cost,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,time_created,time_updated FROM session WHERE id=${sqlString(meta.usage.sessionId)};`,
  )
  if (byId.length !== 1) {
    throw new Error(`${meta.runId}: session id readback found ${byId.length} rows`)
  }
  const row = byId[0]
  const searchable = query(
    `SELECT id FROM session WHERE title=${sqlString(meta.sessionTitle)} AND time_created>=${meta.startedEpochMs - 2_000} AND time_created<=${meta.finishedEpochMs + 5_000} ORDER BY time_created ASC;`,
  )
  if (searchable.length !== 1 || searchable[0].id !== row.id) {
    throw new Error(
      `${meta.runId}: title/time search found ${searchable.length} rows or a different id`,
    )
  }

  assertEqual(row.title, meta.sessionTitle, `${meta.runId}: title`)
  assertEqual(row.directory, meta.usage.sessionDirectory, `${meta.runId}: directory`)
  assertEqual(parseJSON(row.model), meta.usage.model, `${meta.runId}: model`)
  assertEqual(row.tokens_input, meta.usage.inputTokens, `${meta.runId}: input tokens`)
  assertEqual(row.tokens_output, meta.usage.outputTokens, `${meta.runId}: output tokens`)
  assertEqual(row.tokens_reasoning, meta.usage.thinkingTokens, `${meta.runId}: thinking tokens`)
  assertEqual(row.tokens_cache_read, meta.usage.cacheReadTokens, `${meta.runId}: cache-read tokens`)
  assertEqual(row.tokens_cache_write, meta.usage.cacheWriteTokens, `${meta.runId}: cache-write tokens`)
  assertEqual(row.time_created, meta.usage.timeCreated, `${meta.runId}: creation time`)
  assertEqual(row.time_updated, meta.usage.timeUpdated, `${meta.runId}: update time`)
  const tokenValues = [
    row.tokens_input,
    row.tokens_output,
    row.tokens_reasoning,
    row.tokens_cache_read,
    row.tokens_cache_write,
  ]
  if (!tokenValues.every(Number.isFinite)) {
    throw new Error(`${meta.runId}: database token fields are not finite`)
  }
  const totalTokens = tokenValues.reduce((sum, value) => sum + value, 0)
  if (totalTokens <= 0) {
    throw new Error(`${meta.runId}: database token total is not positive`)
  }
  console.log(
    `[usage-verified] run=${meta.runId} session=${row.id} tokens=${totalTokens}`,
  )
}

console.log(`[usage-done] runs=${paths.length} distinct-sessions=${sessionIds.size}`)

function query(sql) {
  const result = spawnSync('sqlite3', ['-json', DB, sql], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`sqlite query failed: ${String(result.stderr || '').trim()}`)
  }
  try {
    return JSON.parse(result.stdout || '[]')
  } catch (error) {
    throw new Error(`sqlite returned invalid JSON: ${error.message}`)
  }
}

function parseExpected(args) {
  if (args.length !== 2 || args[0] !== '--expect') {
    throw new Error('usage: node eval/verify-usage.mjs --expect N')
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

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function parseJSON(value) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
    )
  }
}

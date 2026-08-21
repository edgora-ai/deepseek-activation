import { mkdir, rm } from 'node:fs/promises'

/**
 * Exclusive directory lock used to serialize config-file swaps (OpenCode
 * AGENTS.md, DSH settings.yaml). mkdir is atomic; the lock dir is removed in
 * the owner's finally block.
 */
export async function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      await mkdir(lockPath)
      return async () => { await rm(lockPath, { recursive: true, force: true }) }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 1000))
    }
  }
  throw new Error(`timed out acquiring exclusive lock ${lockPath}`)
}
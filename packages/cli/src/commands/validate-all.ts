import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { validatePackage } from '@openquality/core'
import type { Writer } from './validate.js'

/** Immediate subdirectories of `root` that contain an openquality.yaml. */
async function findPackages(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const found: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    try {
      await stat(join(dir, 'openquality.yaml'))
      found.push(dir)
    } catch {
      // Not a package. Collections nest one level, so this is expected.
    }
  }
  return found.sort()
}

/**
 * Validates every package under the given roots and fails if any falls below
 * the floor. Reports every failure rather than stopping at the first, because
 * a contributor fixing CI wants the whole list.
 */
export async function runValidateAll(roots: string[], floor: number, write: Writer): Promise<number> {
  const dirs: string[] = []
  for (const root of roots) dirs.push(...(await findPackages(root)))

  const failures: string[] = []
  for (const dir of dirs) {
    const { level, blockers } = await validatePackage(dir)
    if (level >= floor) continue
    failures.push(dir)
    write(`FAIL  ${dir}  Level ${level}, needs Level ${floor}`)
    for (const blocker of blockers) write(`        ${blocker}`)
  }

  write('')
  write(`Checked ${dirs.length} package${dirs.length === 1 ? '' : 's'}, ${failures.length} below Level ${floor}`)
  return failures.length > 0 ? 1 : 0
}

import { findPackages, readCorpus, resolveDependencies, validatePackage } from '@openquality/core'
import type { Writer } from './validate.js'

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

  // Whether a dependency resolves is a property of the set of packages, not of
  // one package, so it is checked here rather than in validatePackage. CI runs
  // this over the whole corpus, which is what keeps the committed tree whole.
  const corpus = await readCorpus(roots)
  let unresolved = 0
  for (const pkg of corpus.values()) {
    const { missing } = resolveDependencies(pkg.manifest, (id, version) => corpus.get(`${id}@${version}`))
    for (const dep of missing) {
      unresolved++
      write(`FAIL  ${pkg.dir}  dependencies.resolve: ${dep.requiredBy} depends on ${dep.id}@${dep.version}, which is not a package here`)
    }
  }

  write('')
  write(`Checked ${dirs.length} package${dirs.length === 1 ? '' : 's'}, ${failures.length} below Level ${floor}`)
  if (unresolved > 0) write(`${unresolved} unresolved dependenc${unresolved === 1 ? 'y' : 'ies'}`)
  return failures.length > 0 || unresolved > 0 ? 1 : 0
}

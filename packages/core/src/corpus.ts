import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseManifest, type Manifest } from './manifest.js'

export interface CorpusPackage {
  dir: string
  manifest: Manifest
}

export interface MissingDependency {
  id: string
  version: string
  /** The package whose manifest named it. */
  requiredBy: string
}

/** Immediate subdirectories of `root` that contain an openquality.yaml, sorted. */
export async function findPackages(root: string): Promise<string[]> {
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
 * Every package under the given collection roots, keyed `id@version`. A
 * manifest that does not parse is left out: validation reports it, and a
 * dependency on it then shows up as missing rather than as something half-read.
 */
export async function readCorpus(roots: string[]): Promise<Map<string, CorpusPackage>> {
  const corpus = new Map<string, CorpusPackage>()
  for (const root of roots) {
    for (const dir of await findPackages(root)) {
      const parsed = parseManifest(await readFile(join(dir, 'openquality.yaml'), 'utf8'))
      if (parsed.ok) corpus.set(`${parsed.manifest.id}@${parsed.manifest.version}`, { dir, manifest: parsed.manifest })
    }
  }
  return corpus
}

/**
 * Every package a manifest depends on, transitively.
 *
 * A manifest lists only its direct dependencies, so there is one place each
 * edge is written down; the closure is always computed. Deduplicated (a library
 * reached by two paths appears once), sorted by id so output built from it is
 * deterministic, and safe on a cycle. Anything that cannot be found is
 * returned in `missing` rather than thrown, so a caller can report all of it.
 */
export function resolveDependencies<T extends { manifest: Manifest }>(
  manifest: Manifest,
  lookup: (id: string, version: string) => T | undefined,
): { resolved: T[]; missing: MissingDependency[] } {
  const resolved = new Map<string, T>()
  const missing: MissingDependency[] = []
  const seen = new Set<string>([`${manifest.id}@${manifest.version}`])

  const visit = (from: Manifest) => {
    for (const dep of from.dependencies ?? []) {
      const key = `${dep.id}@${dep.version}`
      if (seen.has(key)) continue
      seen.add(key)
      const found = lookup(dep.id, dep.version)
      if (!found) {
        missing.push({ id: dep.id, version: dep.version, requiredBy: from.id })
        continue
      }
      resolved.set(key, found)
      visit(found.manifest)
    }
  }
  visit(manifest)

  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return {
    resolved: [...resolved.values()].sort((a, b) => byId(a.manifest.id, b.manifest.id)),
    missing: missing.sort((a, b) => byId(a.id, b.id)),
  }
}

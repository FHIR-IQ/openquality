import type { CorpusSource } from './source.js'

/** One package as `site/index.json` describes it. */
export interface PackageEntry {
  id: string
  version: string
  title: string
  steward?: string
  identifiers: string[]
  dataModel?: string
  license: string
  level: number
  collection: string
  path: string
  manifest: string
  artifacts: string[]
  valueSets: number
  relationship?: string
  /** Absent in catalogues built before shared library packages; read as 'measure'. */
  kind?: 'measure' | 'library'
  dependencies?: { id: string; version: string }[]
  knowledge: string[]
}

/** One knowledge entry as `site/index.json` describes it. */
export interface KnowledgeEntry {
  id: string
  title: string
  type: string
  status: string
  measure?: string
  measureVersion?: string
  categories?: string[]
  summary: string
  reporter?: string
  page: string
  source: string
}

export interface Catalogue {
  packages: PackageEntry[]
  knowledge: KnowledgeEntry[]
  /**
   * Every path a tool may read. The server reads only what the published
   * catalogue lists, so it cannot be pointed at an arbitrary file or URL.
   */
  readable: Set<string>
}

export const CATALOGUE_PATH = 'site/index.json'

const loaded = new WeakMap<CorpusSource, Promise<Catalogue>>()

/**
 * The catalogue the site already publishes, and CI already keeps equal to the
 * corpus. Loaded once per source.
 */
export function loadCatalogue(source: CorpusSource): Promise<Catalogue> {
  let pending = loaded.get(source)
  if (!pending) {
    pending = read(source)
    loaded.set(source, pending)
    pending.catch(() => loaded.delete(source))
  }
  return pending
}

async function read(source: CorpusSource): Promise<Catalogue> {
  const index = JSON.parse(await source.readText(CATALOGUE_PATH)) as {
    packages: PackageEntry[]
    knowledge: KnowledgeEntry[]
  }
  const readable = new Set<string>()
  for (const pkg of index.packages) {
    readable.add(pkg.manifest)
    for (const artifact of pkg.artifacts) readable.add(artifact)
  }
  for (const entry of index.knowledge) readable.add(entry.source)
  return { packages: index.packages, knowledge: index.knowledge, readable }
}

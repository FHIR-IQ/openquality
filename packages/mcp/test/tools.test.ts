import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPackageBundle, parseManifest, resolveDependencies } from '@openquality/core'
import { FsSource } from '../src/source.js'
import { loadCatalogue } from '../src/catalogue.js'
import { getArtifact, getBundle, getMeasure, knownIssues, searchMeasures, type ToolResult } from '../src/tools.js'

// The real repository, not a fixture. The server is a reader of the published
// catalogue, so the catalogue CI already keeps honest is the right thing to test
// against.
const ROOT = join(import.meta.dirname, '../../..')
const source = new FsSource(ROOT)

const DERIVED = 'cms/appropriate-testing-for-pharyngitis'
const CMS122 = 'cms/diabetes-glycemic-status-assessment-greater-than-9'

function body(result: ToolResult): string {
  return result.content[0]!.text
}
function json(result: ToolResult): any {
  return JSON.parse(body(result))
}
function footer(result: ToolResult): string {
  return result.content[result.content.length - 1]!.text
}

describe('search_measures', () => {
  it('finds a measure by CMS identifier, case-insensitively', async () => {
    const result = await searchMeasures(source, { query: 'cms146fhir' })
    expect(result.isError).toBeFalsy()
    expect(json(result).results.map((r: any) => r.id)).toEqual([DERIVED])
  })

  it('requires every token to match', async () => {
    const both = json(await searchMeasures(source, { query: 'diabetes glycemic' })).results
    expect(both.length).toBeGreaterThan(0)
    expect(json(await searchMeasures(source, { query: 'diabetes pharyngitis' })).results).toEqual([])
  })

  it('caps results at the limit and reports the total', async () => {
    const out = json(await searchMeasures(source, { query: 'cms', limit: 3 }))
    expect(out.results).toHaveLength(3)
    expect(out.total).toBeGreaterThan(3)
  })

  it('returns measures by default and shared libraries only when asked', async () => {
    const byDefault = json(await searchMeasures(source, { query: 'fhirhelpers' }))
    expect(byDefault.results).toEqual([])
    const libraries = json(await searchMeasures(source, { query: 'fhirhelpers', kind: 'library' }))
    expect(libraries.results.map((r: any) => r.id)).toEqual(['cms/lib-fhirhelpers'])
    expect(libraries.results[0].kind).toBe('library')
  })

  it('filters by collection', async () => {
    const out = json(await searchMeasures(source, { query: 'glycemic', collection: 'community' }))
    expect(out.results.every((r: any) => r.collection === 'community')).toBe(true)
    expect(out.results.length).toBeGreaterThan(0)
  })
})

describe('get_measure', () => {
  it('carries the provenance block, including the exact modifications of a derived package', async () => {
    const out = json(await getMeasure(source, { id: DERIVED }))
    expect(out.provenance.relationship).toBe('derived')
    expect(out.provenance.modifications.join(' ')).toMatch(/CPT 99429/)
    expect(out.valueSets.length).toBeGreaterThan(0)
  })

  it('names the shared libraries the measure depends on', async () => {
    const out = json(await getMeasure(source, { id: DERIVED }))
    expect(out.dependencies.map((d: any) => d.id)).toContain('cms/lib-fhirhelpers')
  })

  it('lists the knowledge entries filed against the measure', async () => {
    const out = json(await getMeasure(source, { id: CMS122 }))
    expect(out.knowledge.map((k: any) => k.id)).toContain('cms122-2026-001')
  })

  it('reports an unknown id as an error, not an exception', async () => {
    const result = await getMeasure(source, { id: 'cms/does-not-exist' })
    expect(result.isError).toBe(true)
    expect(body(result)).toMatch(/cms\/does-not-exist/)
  })
})

describe('get_artifact', () => {
  it('returns the raw file for a catalogued artifact', async () => {
    const path = 'measures/cms-fhir-2026/lib-fhirhelpers/cql/FHIRHelpers.cql'
    const result = await getArtifact(source, { path })
    expect(body(result)).toBe(await readFile(join(ROOT, path), 'utf8'))
  })

  it('refuses a path the catalogue does not list', async () => {
    const result = await getArtifact(source, { path: 'package.json' })
    expect(result.isError).toBe(true)
    expect(body(result)).toMatch(/get_artifact/)
  })

  it('refuses traversal dressed up as a catalogued path', async () => {
    const result = await getArtifact(source, {
      path: 'measures/cms-fhir-2026/appropriate-testing-for-pharyngitis/../../../package.json',
    })
    expect(result.isError).toBe(true)
  })
})

describe('get_bundle', () => {
  async function readFromDisk(pkg: { manifest: string; path: string; artifacts: string[] }) {
    const parsed = parseManifest(await readFile(join(ROOT, pkg.manifest), 'utf8'))
    if (!parsed.ok) throw new Error(`manifest ${pkg.manifest}`)
    const cql = []
    const resources = []
    for (const artifact of pkg.artifacts) {
      const rel = artifact.slice(pkg.path.length + 1)
      const text = await readFile(join(ROOT, artifact), 'utf8')
      if (artifact.endsWith('.cql')) cql.push({ path: rel, source: text })
      else if (artifact.endsWith('.json')) {
        const resource = JSON.parse(text)
        if (typeof resource.resourceType === 'string') resources.push({ path: rel, resource })
      }
    }
    return { manifest: parsed.manifest, cql, resources }
  }

  it('builds the same Bundle the CLI builds, dependencies included, for every package', async () => {
    const { packages } = await loadCatalogue(source)
    const byKey = new Map(packages.map((p) => [`${p.id}@${p.version}`, p]))
    for (const pkg of packages) {
      const own = await readFromDisk(pkg)
      const { resolved } = resolveDependencies(own.manifest, (id, version) => {
        const found = byKey.get(`${id}@${version}`)
        return found && { manifest: { id: found.id, version: found.version, dependencies: found.dependencies } as any, pkg: found }
      })
      const dependencies = []
      for (const dep of resolved) {
        const read = await readFromDisk(dep.pkg)
        dependencies.push({ manifest: read.manifest, files: read.cql })
      }
      const expected = buildPackageBundle(own.manifest, own.cql, own.resources, { license: own.manifest.license }, dependencies)
      expect(json(await getBundle(source, { id: pkg.id })), pkg.id).toEqual(expected)
    }
  })

  it('carries the shared libraries a measure depends on, as depends-on', async () => {
    const bundle = json(await getBundle(source, { id: DERIVED }))
    const ids = bundle.entry.map((e: any) => e.resource.id)
    expect(ids).toContain('FHIRHelpers')
    expect(bundle.entry[0].resource.relatedArtifact).toContainEqual({
      type: 'depends-on',
      resource: 'https://openquality.us/fhir/Library/FHIRHelpers',
    })
  })
})

describe('known_issues', () => {
  it('returns the full body, not only the summary', async () => {
    const out = json(await knownIssues(source, { measure: CMS122 }))
    const entry = out.entries.find((e: any) => e.id === 'cms122-2026-001')
    expect(entry.body.length).toBeGreaterThan(entry.summary.length)
    expect(out.entries.every((e: any) => e.measure === CMS122)).toBe(true)
  })

  it('filters by type', async () => {
    const out = json(await knownIssues(source, { type: 'interpretation-issue' }))
    expect(out.entries.length).toBeGreaterThan(0)
    expect(out.entries.every((e: any) => e.type === 'interpretation-issue')).toBe(true)
  })
})

describe('every result', () => {
  it('ends with the provenance and policy footer', async () => {
    const results = [
      await searchMeasures(source, { query: 'cms' }),
      await getMeasure(source, { id: DERIVED }),
      await getArtifact(source, { path: 'measures/cms-fhir-2026/lib-status/cql/Status.cql' }),
      await getBundle(source, { id: DERIVED }),
      await knownIssues(source, {}),
    ]
    for (const result of results) {
      expect(footer(result)).toMatch(/^served-from: /)
      expect(footer(result)).toMatch(/never embedded/)
      expect(footer(result)).toMatch(/CPT display text/)
    }
    expect(footer(results[1]!)).toMatch(/license: CC0-1\.0/)
  })
})

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildPackageBundle,
  readCorpus,
  resolveDependencies,
  type CqlFile,
  type CorpusPackage,
  type FhirResourceFile,
} from '@openquality/core'

/**
 * The guarantee that publishing shared libraries as their own packages lost
 * nothing. Before the change every measure carried copies of the libraries it
 * includes; the fixture records the Library resources each package's bundle
 * held then. Now that measures depend on library packages instead, a bundle
 * with its dependencies resolved must hold exactly the same Libraries: same
 * identity, same CQL bytes, same depends-on edges.
 *
 * If this fails, a dependency edge is wrong or missing. Do not regenerate the
 * fixture to make it pass.
 */
const ROOT = join(import.meta.dirname, '../..')
const BASELINE = join(import.meta.dirname, 'fixtures/library-sets-2026-10-12.json')

async function readPackage(pkg: CorpusPackage): Promise<{ cql: CqlFile[]; resources: FhirResourceFile[] }> {
  const cql: CqlFile[] = []
  const resources: FhirResourceFile[] = []
  for (const artifact of pkg.manifest.artifacts) {
    const text = await readFile(join(pkg.dir, artifact.path), 'utf8')
    if (artifact.path.endsWith('.cql')) cql.push({ path: artifact.path, source: text })
    else if (artifact.path.endsWith('.json')) {
      const resource = JSON.parse(text)
      if (typeof resource.resourceType === 'string') resources.push({ path: artifact.path, resource })
    }
  }
  return { cql, resources }
}

describe('shared library packages', () => {
  it('leave every measure bundle holding the same Libraries it held before', async () => {
    const baseline = JSON.parse(await readFile(BASELINE, 'utf8')) as Record<string, unknown[]>
    const corpus = await readCorpus([join(ROOT, 'measures/cms-fhir-2026'), join(ROOT, 'measures/community')])
    const byId = new Map([...corpus.values()].map((p) => [p.manifest.id, p]))

    for (const [id, expected] of Object.entries(baseline)) {
      const pkg = byId.get(id)
      expect(pkg, `${id} is missing from the corpus`).toBeDefined()
      const { resolved, missing } = resolveDependencies(pkg!.manifest, (depId, version) => corpus.get(`${depId}@${version}`))
      expect(missing, id).toEqual([])

      const own = await readPackage(pkg!)
      const dependencies = []
      for (const dep of resolved) dependencies.push({ manifest: dep.manifest, files: (await readPackage(dep)).cql })

      const bundle = buildPackageBundle(pkg!.manifest, own.cql, own.resources, { license: pkg!.manifest.license }, dependencies) as {
        entry: { resource: Record<string, any> }[]
      }
      const actual = bundle.entry
        .slice(1)
        .map((e) => e.resource)
        .filter((r) => r.resourceType === 'Library')
        .map((r) => ({
          id: r.id,
          url: r.url,
          version: r.version,
          name: r.name,
          cqlSha256: createHash('sha256').update(r.content[0].data).digest('hex'),
          dependsOn: (r.relatedArtifact ?? []).map((x: { resource: string }) => x.resource),
        }))
        .sort((a, b) => (a.id < b.id ? -1 : 1))

      expect(actual, id).toEqual(expected)
    }
  })
})

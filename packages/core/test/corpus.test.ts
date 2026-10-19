import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCorpus, resolveDependencies, unsatisfiedIncludes, type CorpusPackage } from '../src/corpus.js'
import type { Manifest } from '../src/manifest.js'

function pkg(id: string, deps: string[] = []): { manifest: Manifest } {
  return {
    manifest: {
      id,
      version: '1.0.0',
      license: 'CC0-1.0',
      artifacts: [],
      dependencies: deps.map((d) => ({ id: d, version: '1.0.0' })),
    },
  }
}

function lookupOf(...packages: { manifest: Manifest }[]) {
  const map = new Map(packages.map((p) => [`${p.manifest.id}@${p.manifest.version}`, p]))
  return (id: string, version: string) => map.get(`${id}@${version}`)
}

describe('resolveDependencies', () => {
  it('follows a chain transitively and returns it sorted by id', () => {
    const lookup = lookupOf(pkg('cms/lib-b', ['cms/lib-a']), pkg('cms/lib-a'))
    const { resolved, missing } = resolveDependencies(pkg('cms/m', ['cms/lib-b']).manifest, lookup)
    expect(resolved.map((p) => p.manifest.id)).toEqual(['cms/lib-a', 'cms/lib-b'])
    expect(missing).toEqual([])
  })

  it('includes a library reached by two paths once', () => {
    const lookup = lookupOf(pkg('cms/lib-a', ['cms/lib-c']), pkg('cms/lib-b', ['cms/lib-c']), pkg('cms/lib-c'))
    const { resolved } = resolveDependencies(pkg('cms/m', ['cms/lib-a', 'cms/lib-b']).manifest, lookup)
    expect(resolved.map((p) => p.manifest.id)).toEqual(['cms/lib-a', 'cms/lib-b', 'cms/lib-c'])
  })

  it('terminates on a cycle', () => {
    const lookup = lookupOf(pkg('cms/lib-a', ['cms/lib-b']), pkg('cms/lib-b', ['cms/lib-a']))
    const { resolved } = resolveDependencies(pkg('cms/m', ['cms/lib-a']).manifest, lookup)
    expect(resolved.map((p) => p.manifest.id)).toEqual(['cms/lib-a', 'cms/lib-b'])
  })

  it('reports what is missing instead of throwing', () => {
    const lookup = lookupOf(pkg('cms/lib-a', ['cms/lib-gone']))
    const { resolved, missing } = resolveDependencies(pkg('cms/m', ['cms/lib-a']).manifest, lookup)
    expect(resolved.map((p) => p.manifest.id)).toEqual(['cms/lib-a'])
    expect(missing).toEqual([{ id: 'cms/lib-gone', version: '1.0.0', requiredBy: 'cms/lib-a' }])
  })

  it('returns nothing for a package without dependencies', () => {
    expect(resolveDependencies(pkg('cms/m').manifest, lookupOf())).toEqual({ resolved: [], missing: [] })
  })
})

describe('readCorpus', () => {
  it('indexes every package one level under each root by id and version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'oq-corpus-'))
    for (const [dir, id] of [['a', 'x/a'], ['b', 'x/b']]) {
      await mkdir(join(root, 'col', dir), { recursive: true })
      await writeFile(join(root, 'col', dir, 'openquality.yaml'), `id: ${id}\nversion: 1.0.0\nlicense: MIT\nartifacts: []\n`)
    }
    await mkdir(join(root, 'col', 'not-a-package'))
    const corpus = await readCorpus([join(root, 'col')])
    expect([...corpus.keys()]).toEqual(['x/a@1.0.0', 'x/b@1.0.0'])
    expect(corpus.get('x/b@1.0.0')!.dir).toBe(join(root, 'col', 'b'))
  })
})

describe('unsatisfiedIncludes', () => {
  async function onDisk(id: string, cql: string, deps: string[] = []): Promise<CorpusPackage> {
    const dir = await mkdtemp(join(tmpdir(), 'oq-includes-'))
    await mkdir(join(dir, 'cql'))
    await writeFile(join(dir, 'cql', 'Main.cql'), cql)
    return { dir, manifest: { ...pkg(id, deps).manifest, artifacts: [{ path: 'cql/Main.cql', type: 'cql' }] } }
  }

  it('is satisfied by a dependency whose CQL header has the included name and version', async () => {
    const lib = await onDisk('cms/lib-status', "library Status version '1.15.000'\n")
    const m = await onDisk('cms/m', "library M version '1.0.000'\ninclude Status version '1.15.000' called Status\n", ['cms/lib-status'])
    expect(await unsatisfiedIncludes(m, [lib])).toEqual([])
  })

  it('reports an include whose library is present only at another version, naming what is there', async () => {
    const lib = await onDisk('cms/lib-status', "library Status version '1.15.000'\n")
    const m = await onDisk('cms/m', "library M version '1.0.000'\ninclude Status version '1.13.000' called Status\n", ['cms/lib-status'])
    expect(await unsatisfiedIncludes(m, [lib])).toEqual([
      { path: 'cql/Main.cql', library: 'Status', version: '1.13.000', available: ['1.15.000'] },
    ])
  })

  it('reports an include nothing provides', async () => {
    const m = await onDisk('community/m', "library M version '1.0.000'\ninclude FHIRHelpers version '4.0.1'\n")
    expect(await unsatisfiedIncludes(m, [])).toEqual([
      { path: 'cql/Main.cql', library: 'FHIRHelpers', version: '4.0.1', available: [] },
    ])
  })

  it('is satisfied by a CQL file inside the package itself', async () => {
    const m = await onDisk('cms/m', "library M version '1.0.000'\ninclude Helpers version '1.0.000'\n")
    await writeFile(join(m.dir, 'cql', 'Helpers.cql'), "library Helpers version '1.0.000'\n")
    m.manifest.artifacts.push({ path: 'cql/Helpers.cql', type: 'cql' })
    expect(await unsatisfiedIncludes(m, [])).toEqual([])
  })

  it('skips an unreadable file rather than throwing', async () => {
    const m = await onDisk('cms/m', '')
    m.manifest.artifacts.push({ path: 'cql/Gone.cql', type: 'cql' })
    expect(await unsatisfiedIncludes(m, [])).toEqual([])
  })
})

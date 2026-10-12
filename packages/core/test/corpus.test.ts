import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCorpus, resolveDependencies } from '../src/corpus.js'
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

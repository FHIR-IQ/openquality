import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runValidateAll } from '../src/commands/validate-all.js'

let root: string
const lines: string[] = []
const write = (line: string) => lines.push(line)

async function writePackage(name: string, manifest: string, readme: string, cql = `library A version '1.0.000'\n`): Promise<void> {
  const dir = join(root, name)
  await mkdir(join(dir, 'cql'), { recursive: true })
  await writeFile(join(dir, 'openquality.yaml'), manifest)
  await writeFile(join(dir, 'README.md'), readme)
  await writeFile(join(dir, 'cql', 'A.cql'), cql)
}

const GOOD_MANIFEST = [
  'id: cms/good',
  'version: 1.0.0',
  'license: CC0-1.0',
  'dataModel: qi-core',
  'measure:',
  '  title: Good',
  'artifacts:',
  '  - path: cql/A.cql',
  '    type: cql',
  '',
].join('\n')

const GOOD_README = '# Good\n\n## Intent\nx\n\n## Known Limitations\nx\n\n## Provenance\nx\n'

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oq-validate-all-'))
  lines.length = 0
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('runValidateAll', () => {
  it('returns 0 when every package reaches the floor', async () => {
    await writePackage('good', GOOD_MANIFEST, GOOD_README)
    expect(await runValidateAll([root], 1, write)).toBe(0)
  })

  it('returns 1 and names the package that falls below the floor', async () => {
    await writePackage('good', GOOD_MANIFEST, GOOD_README)
    await writePackage('bad', GOOD_MANIFEST.replace('id: cms/good', 'id: cms/bad'), '# Bad\n')
    const code = await runValidateAll([root], 1, write)
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('bad')
  })

  it('reports how many packages it checked', async () => {
    await writePackage('good', GOOD_MANIFEST, GOOD_README)
    await runValidateAll([root], 1, write)
    expect(lines.join('\n')).toContain('1 package')
  })

  it('returns 0 for a root that contains no packages', async () => {
    expect(await runValidateAll([root], 1, write)).toBe(0)
  })
})

describe('dependencies across the validated packages', () => {
  const withDependency = (dep: string) =>
    GOOD_MANIFEST.replace('id: cms/good', 'id: cms/measure') + `dependencies:\n  - id: ${dep}\n    version: 1.0.0\n`
  const LIBRARY_MANIFEST = [
    'id: cms/lib-a',
    'version: 1.0.0',
    'license: CC0-1.0',
    'dataModel: qi-core',
    'library:',
    '  name: A',
    "  version: '1.0.000'",
    'artifacts:',
    '  - path: cql/A.cql',
    '    type: cql',
    '',
  ].join('\n')

  it('passes when every dependency is a package in the set', async () => {
    await writePackage('lib-a', LIBRARY_MANIFEST, GOOD_README)
    await writePackage('measure', withDependency('cms/lib-a'), GOOD_README)
    expect(await runValidateAll([root], 1, write)).toBe(0)
  })

  it('fails and names a dependency that is not in the set', async () => {
    await writePackage('measure', withDependency('cms/lib-gone'), GOOD_README)
    expect(await runValidateAll([root], 1, write)).toBe(1)
    expect(lines.join('\n')).toMatch(/dependencies\.resolve.*cms\/lib-gone@1\.0\.0/)
  })

  it('warns about an include the dependencies provide only at another version, without failing', async () => {
    await writePackage('lib-a', LIBRARY_MANIFEST, GOOD_README)
    await writePackage('measure', withDependency('cms/lib-a'), GOOD_README, "library M version '1.0.000'\ninclude A version '0.9.000'\n")
    expect(await runValidateAll([root], 1, write)).toBe(0)
    const out = lines.join('\n')
    expect(out).toMatch(/WARN .*cql\.includes: cql\/A\.cql includes A version '0\.9\.000'; provided: 1\.0\.000/)
    expect(out).toContain('1 include not satisfied at its exact version')
  })

  it('says nothing about includes when every one is satisfied', async () => {
    await writePackage('lib-a', LIBRARY_MANIFEST, GOOD_README)
    await writePackage('measure', withDependency('cms/lib-a'), GOOD_README, "library M version '1.0.000'\ninclude A version '1.0.000'\n")
    await runValidateAll([root], 1, write)
    expect(lines.join('\n')).not.toMatch(/cql\.includes|include not satisfied/)
  })
})

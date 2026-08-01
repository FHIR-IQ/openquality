import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runValidateAll } from '../src/commands/validate-all.js'

let root: string
const lines: string[] = []
const write = (line: string) => lines.push(line)

async function writePackage(name: string, manifest: string, readme: string): Promise<void> {
  const dir = join(root, name)
  await mkdir(join(dir, 'cql'), { recursive: true })
  await writeFile(join(dir, 'openquality.yaml'), manifest)
  await writeFile(join(dir, 'README.md'), readme)
  await writeFile(join(dir, 'cql', 'A.cql'), `library A version '1.0.000'\n`)
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

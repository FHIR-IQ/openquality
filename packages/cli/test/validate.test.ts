import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runValidate } from '../src/commands/validate.js'

let dir: string
let lines: string[]
const writer = (line: string) => { lines.push(line) }

async function write(rel: string, content: string) {
  const full = join(dir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf8')
}

const GOOD_MANIFEST = `
id: gene/hba1c
version: 1.0.0
license: Apache-2.0
dataModel: fhir-r4
measure:
  title: T
artifacts:
  - path: cql/M.cql
    type: cql
`
const GOOD_README = '# T\n\n## Intent\nx\n\n## Known Limitations\nx\n\n## Provenance\nx\n'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oq-cli-'))
  lines = []
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('runValidate', () => {
  it('exits 0 and reports the level for a valid package', async () => {
    await write('openquality.yaml', GOOD_MANIFEST)
    await write('README.md', GOOD_README)
    await write('cql/M.cql', 'library M\n')

    const code = await runValidate(dir, writer)
    expect(code).toBe(0)
    expect(lines.join('\n')).toMatch(/Level 1/)
  })

  it('exits 1 and prints each error when validation fails', async () => {
    await write('openquality.yaml', GOOD_MANIFEST)
    await write('README.md', GOOD_README)

    const code = await runValidate(dir, writer)
    expect(code).toBe(1)
    expect(lines.join('\n')).toMatch(/cql\/M\.cql/)
  })

  it('prints blockers explaining what is needed for the next level', async () => {
    await write('openquality.yaml', GOOD_MANIFEST)
    await write('README.md', GOOD_README)
    await write('cql/M.cql', 'library M\n')

    await runValidate(dir, writer)
    expect(lines.join('\n')).toMatch(/cql\.translate/)
  })

  it('exits 1 with a clear message when the directory is not a package', async () => {
    const code = await runValidate(dir, writer)
    expect(code).toBe(1)
    expect(lines.join('\n')).toMatch(/openquality\.yaml/)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validatePackage } from '../src/validate.js'

/**
 * End-to-end cases from attacking the validator rather than from reading it.
 *
 * Everything here was found by pointing hostile or merely awkward input at
 * `validatePackage` and seeing what came back. Two outside reviewers found four
 * real defects this way in a fortnight, which is a better hit rate than reading
 * the code produced, so the cases they used live here permanently.
 *
 * Cases already covered elsewhere are not repeated: declared-artifact symlinks
 * and the undeclared-symlink scanner bypass are in validate.test.ts, the
 * expansion and descriptor rules in scanner.test.ts and terminology.test.ts.
 */

const MANIFEST = `id: test/pkg
version: 1.0.0
license: MIT
dataModel: fhir-r4
measure:
  title: Test Measure
artifacts:
  - path: cql/M.cql
    type: cql
`
const README = '# T\n\n## Intent\nx\n\n## Known Limitations\nx\n\n## Provenance\nx\n'
const CQL = `library M version '1.0.0'\nusing FHIR version '4.0.1'\ndefine "X": true\n`

let dir: string

async function build(manifest = MANIFEST, readme = README, cql = CQL) {
  await mkdir(join(dir, 'cql'), { recursive: true })
  await writeFile(join(dir, 'openquality.yaml'), manifest)
  await writeFile(join(dir, 'README.md'), readme)
  await writeFile(join(dir, 'cql', 'M.cql'), cql)
}

const errors = (r: Awaited<ReturnType<typeof validatePackage>>) =>
  r.report.findings.filter((f) => f.severity === 'error')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oq-adv-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('artifact paths that try to leave the package', () => {
  // The manifest is written by a stranger and its paths are opened by us.
  for (const [label, path] of [
    ['a parent traversal', '../../../etc/hosts'],
    ['an absolute posix path', '/etc/hosts'],
    ['a Windows absolute path', 'C:\\Windows\\win.ini'],
    ['a traversal buried mid-path', 'cql/../../../etc/hosts'],
  ] as const) {
    it(`refuses ${label}`, async () => {
      await build(MANIFEST.replace('cql/M.cql', path))
      const result = await validatePackage(dir)
      expect(result.level).toBe(0)
      expect(errors(result).length).toBeGreaterThan(0)
    })
  }
})

describe('symlinks beyond the declared-artifact case', () => {
  it('refuses a symlinked directory standing in for cql/', async () => {
    await writeFile(join(dir, 'openquality.yaml'), MANIFEST)
    await writeFile(join(dir, 'README.md'), README)
    const outside = await mkdtemp(join(tmpdir(), 'oq-outside-'))
    await writeFile(join(outside, 'M.cql'), CQL)
    await symlink(outside, join(dir, 'cql'))

    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    await rm(outside, { recursive: true, force: true })
  })

  it('does not hang on a symlink loop', async () => {
    await build()
    await symlink(join(dir, 'cql', 'a.cql'), join(dir, 'cql', 'b.cql'))
    await symlink(join(dir, 'cql', 'b.cql'), join(dir, 'cql', 'a.cql'))

    const result = await validatePackage(dir)
    expect(errors(result).some((f) => f.check === 'package.symlinks')).toBe(true)
  })
})

describe('content that tries to look like something else', () => {
  it('finds an expansion in a file renamed away from .json', async () => {
    // Detection must not key off the extension: renaming the file was the
    // original bypass the YAML-not-JSON parse was chosen to close.
    await build()
    await writeFile(
      join(dir, 'notes.txt'),
      JSON.stringify({ resourceType: 'ValueSet', expansion: { contains: [{ code: '1' }] } }),
    )
    const result = await validatePackage(dir)
    expect(errors(result).some((f) => f.check === 'content.forbidden')).toBe(true)
  })

  it('flags a licensed descriptor even inside a commented-out block', async () => {
    // The bytes ship whether or not the declaration is live code.
    await build(
      MANIFEST,
      README,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'\n/*\ncode "N": '97804' from "CPT" display 'licensed'\n*/\n`,
    )
    const result = await validatePackage(dir)
    expect(errors(result).some((f) => f.check === 'content.forbidden')).toBe(true)
  })

  it('leaves display text alone for a code system whose licence permits it', async () => {
    await build(
      MANIFEST,
      README,
      `codesystem "SNOMED": 'http://snomed.info/sct'\ncode "D": '44054006' from "SNOMED" display 'Diabetes mellitus'\n`,
    )
    const result = await validatePackage(dir)
    expect(result.level).toBe(1)
    expect(errors(result)).toEqual([])
  })
})

describe('input that is merely awkward', () => {
  it('does not throw on a manifest that is not valid YAML', async () => {
    await build('id: [unclosed\n')
    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    expect(errors(result).some((f) => f.check === 'manifest.schema')).toBe(true)
  })

  it('does not throw on an empty manifest', async () => {
    await build('')
    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    expect(errors(result).length).toBeGreaterThan(0)
  })

  it('does not mistake a byte order mark for a missing section', async () => {
    await build(MANIFEST, `\uFEFF${README}`)
    const result = await validatePackage(dir)
    expect(result.level).toBe(1)
  })

  it('walks a deeply nested tree without failing', async () => {
    await build()
    const deep = join(dir, ...Array(40).fill('n'))
    await mkdir(deep, { recursive: true })
    await writeFile(join(deep, 'f.txt'), 'x')
    expect((await validatePackage(dir)).level).toBe(1)
  })

  it('handles one very long line with no newline in it', async () => {
    await build(MANIFEST, README, `library M version '1.0.0'\n// ${'a'.repeat(2_000_000)}`)
    const started = Date.now()
    const result = await validatePackage(dir)
    expect(result.level).toBe(1)
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('validates a package holding thousands of comment lines quickly', async () => {
    // The shape that made the validator appear to hang for the first outside
    // contributor. Kept end to end, not just at the terminology unit, because
    // what he ran was `oq validate`.
    await build(
      MANIFEST,
      README,
      `library M version '1.0.0'\ncodesystem "CPT": 'http://www.ama-assn.org/go/cpt'\n` +
        '// \n'.repeat(20000) +
        `code "N": '97804' from "CPT" display\n`,
    )
    const started = Date.now()
    await validatePackage(dir)
    expect(Date.now() - started).toBeLessThan(5000)
  })
})

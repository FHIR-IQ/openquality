import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { validatePackage } from '../src/validate.js'

let dir: string

const MANIFEST = `
id: gene/hba1c
version: 1.0.0
license: Apache-2.0
measurementPeriod: 2026
measure:
  title: HbA1c Poor Control
  steward: CMS
dataModel: fhir-r4
artifacts:
  - path: cql/M.cql
    type: cql
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
`

const README = `# HbA1c\n\n## Intent\nx\n\n## Known Limitations\nx\n\n## Provenance\nx\n`

async function write(rel: string, content: string) {
  const full = join(dir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf8')
}

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'oq-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('validatePackage', () => {
  it('reaches level 1 for a complete package with no deep validators run', async () => {
    await write('openquality.yaml', MANIFEST)
    await write('README.md', README)
    await write('cql/M.cql', 'library M version \'1.0.0\'')

    const result = await validatePackage(dir)
    expect(result.level).toBe(1)
    expect(result.manifest?.id).toBe('gene/hba1c')
    expect(result.report.findings.filter((f) => f.severity === 'error')).toEqual([])
  })

  it('reports a declared artifact that is missing from disk', async () => {
    await write('openquality.yaml', MANIFEST)
    await write('README.md', README)

    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    const finding = result.report.findings.find((f) => f.check === 'artifacts.present')
    expect(finding?.severity).toBe('error')
    expect(finding?.message).toMatch(/cql\/M\.cql/)
  })

  it('fails when openquality.yaml is absent', async () => {
    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    expect(result.manifest).toBeUndefined()
    expect(result.report.findings[0].check).toBe('manifest.schema')
  })

  it('surfaces forbidden content from artifact files', async () => {
    await write('openquality.yaml', MANIFEST.replace('cql/M.cql', 'fhir/vs.json').replace('type: cql', 'type: fhir/ValueSet'))
    await write('README.md', README)
    await write('fhir/vs.json', JSON.stringify({
      resourceType: 'ValueSet',
      expansion: { contains: [{ system: 'http://loinc.org', code: '1' }] },
    }))

    const result = await validatePackage(dir)
    expect(result.report.findings.some((f) => f.check === 'content.forbidden' && f.severity === 'error')).toBe(true)
    expect(result.level).toBe(0)
  })

  it('never reads a file outside the package directory', async () => {
    // The registry runs this over packages submitted by strangers, so a
    // manifest must not be able to turn the validator into a file-read gadget.
    const outside = await mkdtemp(join(tmpdir(), 'oq-outside-'))
    await writeFile(join(outside, 'secret.txt'), 'CONFIDENTIAL', 'utf8')
    const escape = join('..', outside.split(sep).pop()!, 'secret.txt')

    await write('openquality.yaml', MANIFEST.replace('cql/M.cql', escape))
    await write('README.md', README)

    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    // Rejected by the manifest schema before the filesystem is ever touched.
    expect(result.report.findings.some((f) => f.message.match(/stay inside the package/))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/CONFIDENTIAL/)

    await rm(outside, { recursive: true, force: true })
  })

  it('does not follow a symlink that points outside the package', async () => {
    // This path is clean by inspection, so the manifest schema admits it. Only
    // the validator's post-symlink check can catch it, which makes this the
    // test that actually exercises that second layer.
    const outside = await mkdtemp(join(tmpdir(), 'oq-outside-'))
    await writeFile(join(outside, 'secret.txt'), 'CONFIDENTIAL', 'utf8')

    await write('openquality.yaml', MANIFEST)
    await write('README.md', README)
    await mkdir(join(dir, 'cql'), { recursive: true })
    await symlink(join(outside, 'secret.txt'), join(dir, 'cql', 'M.cql'))

    const result = await validatePackage(dir)
    expect(JSON.stringify(result)).not.toMatch(/CONFIDENTIAL/)
    expect(result.report.findings.some((f) => f.message.match(/resolves outside the package/))).toBe(true)
    expect(result.level).toBe(0)

    await rm(outside, { recursive: true, force: true })
  })

  it('drops to level 0 when the README is missing required sections', async () => {
    await write('openquality.yaml', MANIFEST)
    await write('README.md', '# Just a title\n')
    await write('cql/M.cql', 'library M')

    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    expect(result.report.findings.some((f) => f.check === 'readme.sections')).toBe(true)
  })
})

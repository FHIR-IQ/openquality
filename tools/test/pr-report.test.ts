import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm, cp } from 'node:fs/promises'
import { packageDirsFor, renderReport } from '../pr-report.js'

// Written against real directories under measures/, because the whole job of
// packageDirsFor is deciding which changed paths are package roots on disk.
// A mocked filesystem would test the mock.
const SEEDED = 'measures/cms-fhir-2026/severe-obstetric-complications'
const TEMPLATE = 'measures/TEMPLATE'
const SCRATCH = 'measures/cms-fhir-2026/__pr_report_fixture__'

describe('packageDirsFor', () => {
  it('finds the package root from a file nested inside it', async () => {
    expect(await packageDirsFor([`${SEEDED}/cql/CMS1028FHIRPCSevereOBComps.cql`])).toEqual([SEEDED])
  })

  it('finds it from the manifest itself', async () => {
    expect(await packageDirsFor([`${SEEDED}/openquality.yaml`])).toEqual([SEEDED])
  })

  it('reports a package once however many of its files changed', async () => {
    const dirs = await packageDirsFor([
      `${SEEDED}/openquality.yaml`,
      `${SEEDED}/README.md`,
      `${SEEDED}/cql/CMS1028FHIRPCSevereOBComps.cql`,
    ])
    expect(dirs).toEqual([SEEDED])
  })

  it('ignores changes outside measures/', async () => {
    expect(await packageDirsFor(['packages/core/src/validate.ts', 'README.md', 'site/index.html'])).toEqual([])
  })

  it('ignores a collection directory, which is not a package', async () => {
    expect(await packageDirsFor(['measures/cms-fhir-2026/README.md'])).toEqual([])
  })

  it('finds a package that sits directly under measures/', async () => {
    expect(await packageDirsFor([`${TEMPLATE}/openquality.yaml`])).toEqual([TEMPLATE])
  })

  it('returns dirs sorted, so the comment does not reshuffle between runs', async () => {
    const dirs = await packageDirsFor([`${SEEDED}/README.md`, `${TEMPLATE}/README.md`])
    expect(dirs).toEqual([...dirs].sort())
    expect(dirs).toHaveLength(2)
  })

  it('survives a path for a file that was deleted', async () => {
    // A pull request that removes a whole package still reports those paths as
    // changed. Nothing is there to validate, and that must not throw.
    expect(await packageDirsFor(['measures/cms-fhir-2026/gone-entirely/openquality.yaml'])).toEqual([])
  })
})

describe('renderReport', () => {
  it('says so plainly when no package changed', async () => {
    const { markdown, ok } = await renderReport([])
    expect(ok).toBe(true)
    expect(markdown).toContain('No package changed')
  })

  it('passes a package that validates, and names its level', async () => {
    const { markdown, ok } = await renderReport([SEEDED])
    expect(ok).toBe(true)
    expect(markdown).toContain('✅')
    expect(markdown).toContain('Level 1 (Described)')
    // The ceiling has to be stated, or a contributor reads Level 1 as a failure.
    expect(markdown).toContain('Level 1 is the ceiling today')
  })
})

describe('renderReport on a package that fails', () => {
  beforeEach(async () => {
    await cp(TEMPLATE, SCRATCH, { recursive: true })
  })
  afterEach(async () => {
    await rm(SCRATCH, { recursive: true, force: true })
  })

  it('fails, shows the finding, and tells the author they can fix it in the browser', async () => {
    // Licensed display text: the rule most likely to catch a real contributor,
    // and the one they cannot guess from the manifest schema.
    await mkdir(`${SCRATCH}/cql`, { recursive: true })
    await writeFile(
      `${SCRATCH}/cql/TemplateMeasure.cql`,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'\n` +
        `code "N": '97804' from "CPT" display 'licensed descriptor'\n`,
      'utf8',
    )

    const { markdown, ok } = await renderReport([SCRATCH])

    expect(ok).toBe(false)
    expect(markdown).toContain('❌')
    expect(markdown).toContain('Level 0 (Shared)')
    expect(markdown).toContain('display text')
    expect(markdown).toContain('fix them in the browser')
    // An invitation to push back. The validator has been wrong before.
    expect(markdown).toContain('If a finding looks wrong')
  })

  it('escapes a pipe so one message cannot break the table', async () => {
    await writeFile(`${SCRATCH}/openquality.yaml`, 'id: a|b/c\nversion: 1.0.0\nlicense: MIT\nartifacts: []\n', 'utf8')
    const { markdown } = await renderReport([SCRATCH])
    expect(markdown).not.toMatch(/\| a\|b\/c/)
  })
})

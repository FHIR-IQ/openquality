import { describe, expect, it } from 'vitest'
import { checkTerminology } from '@openquality/core'
import { stripRestrictedDisplays } from '../src/cql.js'

const CQL = [
  `library Example version '1.0.000'`,
  ``,
  `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
  `codesystem "LOINC": 'http://loinc.org'`,
  ``,
  `code "Medical nutrition therapy; group": '97804' from "CPT" display 'Medical nutrition therapy; group (2 or more individual(s)), each 30 minutes'`,
  `code "Office visit": '99211' from "CPT" display 'Office or other outpatient visit'`,
  `code "Glucose management indicator": '97506-0' from "LOINC" display 'Glucose management indicator'`,
  ``,
  `define "X": true`,
  ``,
].join('\n')

describe('stripRestrictedDisplays', () => {
  it('removes display text from restricted systems only', () => {
    const { cql } = stripRestrictedDisplays(CQL)
    expect(cql).toContain(`code "Medical nutrition therapy; group": '97804' from "CPT"\n`)
    expect(cql).toContain(`code "Office visit": '99211' from "CPT"\n`)
    expect(cql).toContain(`display 'Glucose management indicator'`)
  })

  it('reports what it removed, one entry per code', () => {
    expect(stripRestrictedDisplays(CQL).removed).toEqual(['CPT 97804', 'CPT 99211'])
  })

  it('produces CQL that the core terminology check accepts', () => {
    const { cql } = stripRestrictedDisplays(CQL)
    expect(checkTerminology('cql/Example.cql', cql)).toEqual([])
  })

  it('leaves the rest of the file untouched', () => {
    const { cql } = stripRestrictedDisplays(CQL)
    expect(cql).toContain(`define "X": true`)
    expect(cql).toContain(`codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`)
  })

  it('is a no-op on CQL with no restricted system', () => {
    const clean = [`library A version '1.0.000'`, `define "X": true`].join('\n')
    expect(stripRestrictedDisplays(clean)).toEqual({ cql: clean, removed: [] })
  })
})

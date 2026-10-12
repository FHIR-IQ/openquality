import { describe, expect, it } from 'vitest'
import { checkLibraryIdentity } from '../src/library.js'
import type { Manifest } from '../src/manifest.js'

const FHIRHELPERS = "library FHIRHelpers version '4.4.000'\n\nusing FHIR version '4.0.1'\n"

function manifest(over: Partial<Manifest> = {}): Manifest {
  return {
    id: 'cms/lib-fhirhelpers',
    version: '4.4.0',
    license: 'CC0-1.0',
    library: { name: 'FHIRHelpers', version: '4.4.000' },
    artifacts: [{ path: 'cql/FHIRHelpers.cql', type: 'cql' }],
    ...over,
  }
}

const sources = (map: Record<string, string>) => (path: string) => map[path]

describe('checkLibraryIdentity', () => {
  it('passes a library package whose CQL header matches', () => {
    expect(checkLibraryIdentity(manifest(), sources({ 'cql/FHIRHelpers.cql': FHIRHELPERS }))).toEqual([])
  })

  it('passes a measure package, which declares no library block', () => {
    const m = manifest({ library: undefined, measure: { title: 'T' } })
    expect(checkLibraryIdentity(m, sources({}))).toEqual([])
  })

  it('rejects a package that declares both a library and a measure', () => {
    const findings = checkLibraryIdentity(manifest({ measure: { title: 'T' } }), sources({ 'cql/FHIRHelpers.cql': FHIRHELPERS }))
    expect(findings.map((f) => f.severity)).toEqual(['error'])
    expect(findings[0]!.message).toMatch(/both/)
  })

  it('rejects a header that names a different library or version', () => {
    const wrongName = checkLibraryIdentity(manifest({ library: { name: 'QICoreCommon', version: '4.4.000' } }), sources({ 'cql/FHIRHelpers.cql': FHIRHELPERS }))
    const wrongVersion = checkLibraryIdentity(manifest({ library: { name: 'FHIRHelpers', version: '4.4.0' } }), sources({ 'cql/FHIRHelpers.cql': FHIRHELPERS }))
    expect(wrongName[0]!.message).toMatch(/FHIRHelpers/)
    expect(wrongVersion[0]!.message).toMatch(/4\.4\.000/)
  })

  it('requires exactly one CQL artifact', () => {
    const none = checkLibraryIdentity(manifest({ artifacts: [] }), sources({}))
    const two = checkLibraryIdentity(
      manifest({ artifacts: [{ path: 'cql/FHIRHelpers.cql', type: 'cql' }, { path: 'cql/Other.cql', type: 'cql' }] }),
      sources({ 'cql/FHIRHelpers.cql': FHIRHELPERS, 'cql/Other.cql': "library Other version '1'\n" }),
    )
    expect(none[0]!.message).toMatch(/exactly one CQL/)
    expect(two[0]!.message).toMatch(/exactly one CQL/)
  })

  it('requires both name and version', () => {
    const findings = checkLibraryIdentity(manifest({ library: { name: 'FHIRHelpers' } }), sources({ 'cql/FHIRHelpers.cql': FHIRHELPERS }))
    expect(findings[0]!.message).toMatch(/library.version/)
  })

  it('reports an unreadable CQL file rather than throwing', () => {
    const findings = checkLibraryIdentity(manifest(), sources({}))
    expect(findings[0]!.severity).toBe('error')
  })
})

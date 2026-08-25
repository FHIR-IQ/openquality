import { describe, it, expect } from 'vitest'
import {
  CANONICAL_BASE,
  buildFhirPackage,
  buildLibrary,
  buildPackageBundle,
  buildPackageIndex,
  buildPackageJson,
  fhirPackageName,
  fhirVersionFor,
  packagedResource,
  type CqlFile,
} from '../src/fhir.js'
import type { Manifest } from '../src/manifest.js'

const MANIFEST = {
  id: 'cms/diabetes-glycemic-status',
  version: '0.5.0',
  license: 'CC0-1.0',
  dataModel: 'qi-core',
  measure: { title: 'Diabetes: Glycemic Status Assessment Greater Than 9%' },
  artifacts: [{ path: 'cql/Main.cql', type: 'cql' }],
} as Manifest

const MAIN: CqlFile = {
  path: 'cql/Main.cql',
  source: [
    `library CMS122FHIRDiabetesAssess version '0.5.000'`,
    ``,
    `using QICore version '6.0.0'`,
    ``,
    `include FHIRHelpers version '4.4.000' called FHIRHelpers`,
    `include QICoreCommon version '4.0.000' called QICoreCommon`,
    ``,
    `define "Initial Population": true`,
  ].join('\n'),
}

describe('buildLibrary', () => {
  it('carries the CQL as a base64 attachment that decodes to the original bytes', () => {
    const lib = buildLibrary(MAIN, MANIFEST)
    const content = (lib.content as Array<{ contentType: string; data: string }>)[0]
    expect(content.contentType).toBe('text/cql')
    expect(Buffer.from(content.data, 'base64').toString('utf8')).toBe(MAIN.source)
  })

  it('takes identity from the CQL header, not the file name', () => {
    const lib = buildLibrary({ ...MAIN, path: 'cql/whatever.cql' }, MANIFEST)
    expect(lib.name).toBe('CMS122FHIRDiabetesAssess')
    expect(lib.version).toBe('0.5.000')
    expect(lib.url).toBe(`${CANONICAL_BASE}/Library/CMS122FHIRDiabetesAssess`)
  })

  it('falls back to the file name when the header is unreadable', () => {
    const lib = buildLibrary({ path: 'cql/Broken.cql', source: 'not cql at all' }, MANIFEST)
    expect(lib.name).toBe('Broken')
    // The manifest version is the only version there is in that case.
    expect(lib.version).toBe('0.5.0')
  })

  it('states its includes as depends-on, sorted', () => {
    const related = buildLibrary(MAIN, MANIFEST).relatedArtifact as Array<{ type: string; resource: string }>
    expect(related).toHaveLength(2)
    expect(related.every((r) => r.type === 'depends-on')).toBe(true)
    expect(related.map((r) => r.resource)).toEqual([...related.map((r) => r.resource)].sort())
  })

  it('omits relatedArtifact entirely when nothing is included', () => {
    const lib = buildLibrary({ path: 'cql/Leaf.cql', source: `library Leaf version '1.0.0'` }, MANIFEST)
    expect(lib.relatedArtifact).toBeUndefined()
  })

  it('is marked experimental, because a repackaged copy is not a publication', () => {
    expect(buildLibrary(MAIN, MANIFEST).experimental).toBe(true)
  })

  it('points its canonical at this project rather than at the steward', () => {
    // Minting a steward-looking canonical for someone else's artifact would be
    // a provenance claim this repository cannot make.
    expect(String(buildLibrary(MAIN, MANIFEST).url)).toContain('openquality.us')
  })

  it('replaces characters a FHIR id cannot hold', () => {
    const lib = buildLibrary({ path: 'x.cql', source: `library My_Lib version '1.0.0'` }, MANIFEST)
    expect(lib.id).toBe('My-Lib')
    expect(String(lib.id)).toMatch(/^[A-Za-z0-9.-]{1,64}$/)
  })
})

describe('fhirPackageName', () => {
  it('turns a package id into a dot separated FHIR package name', () => {
    expect(fhirPackageName('cms/breast-cancer-screening')).toBe('us.openquality.cms.breast-cancer-screening')
  })

  it('lowercases, because FHIR package names are lowercase', () => {
    expect(fhirPackageName('CMS/Foo')).toBe('us.openquality.cms.foo')
  })
})

describe('fhirVersionFor', () => {
  it('uses the version the CQL declares when it uses FHIR directly', () => {
    expect(fhirVersionFor([{ path: 'a.cql', source: `library A version '1.0.0'\nusing FHIR version '4.3.0'` }])).toBe(
      '4.3.0',
    )
  })

  it('answers 4.0.1 for QI-Core, which profiles R4', () => {
    expect(fhirVersionFor([MAIN])).toBe('4.0.1')
  })
})

describe('buildPackageJson', () => {
  it('declares only dependencies the CQL actually names', () => {
    const pkg = buildPackageJson(MANIFEST, [MAIN])
    expect(pkg.dependencies).toEqual({ 'hl7.fhir.r4.core': '4.0.1', 'hl7.fhir.us.qicore': '6.0.0' })
  })

  it('does not invent a QI-Core dependency for plain FHIR logic', () => {
    const plain: CqlFile = { path: 'a.cql', source: `library A version '1.0.0'\nusing FHIR version '4.0.1'` }
    expect(buildPackageJson(MANIFEST, [plain]).dependencies).toEqual({ 'hl7.fhir.r4.core': '4.0.1' })
  })

  it('carries the licence through from the manifest', () => {
    expect(buildPackageJson(MANIFEST, [MAIN]).license).toBe('CC0-1.0')
    expect(buildPackageJson(MANIFEST, [MAIN], { license: 'MIT' }).license).toBe('MIT')
  })

  it('says in the description that this is not for production reporting', () => {
    expect(String(buildPackageJson(MANIFEST, [MAIN]).description)).toContain('Not for production reporting')
  })
})

describe('buildPackageIndex', () => {
  it('indexes every resource, sorted by filename', () => {
    const index = buildPackageIndex([
      { filename: 'Library-B.json', resource: { resourceType: 'Library', id: 'B', url: 'u', version: '1' } },
      { filename: 'Library-A.json', resource: { resourceType: 'Library', id: 'A', url: 'u', version: '1' } },
    ])
    expect(index['index-version']).toBe(2)
    expect((index.files as Array<{ filename: string }>).map((f) => f.filename)).toEqual([
      'Library-A.json',
      'Library-B.json',
    ])
  })
})

describe('buildFhirPackage', () => {
  const files = buildFhirPackage(MANIFEST, [MAIN])

  it('puts everything under package/, as the format requires', () => {
    expect(files.every((f) => f.path.startsWith('package/'))).toBe(true)
  })

  it('emits package.json, .index.json and one Library per CQL file', () => {
    expect(files.map((f) => f.path)).toEqual([
      'package/.index.json',
      'package/Library-CMS122FHIRDiabetesAssess.json',
      'package/package.json',
    ])
  })

  it('produces identical output on repeated calls', () => {
    expect(buildFhirPackage(MANIFEST, [MAIN])).toEqual(files)
  })

  it('does not depend on the order the CQL files arrive in', () => {
    const second: CqlFile = { path: 'cql/Zed.cql', source: `library Zed version '1.0.0'` }
    const forwards = buildFhirPackage(MANIFEST, [MAIN, second])
    const backwards = buildFhirPackage(MANIFEST, [second, MAIN])
    expect(backwards).toEqual(forwards)
  })
})

describe('packaging resources the package already holds', () => {
  const VIEW = {
    path: 'views/patient-hba1c.json',
    resource: { resourceType: 'ViewDefinition', name: 'patient_hba1c', status: 'draft', resource: 'Observation' },
  }

  it('gives a resource an id when it has none, derived from its name', () => {
    expect(packagedResource(VIEW).id).toBe('patient-hba1c')
  })

  it('leaves an existing id alone', () => {
    const withId = { ...VIEW, resource: { ...VIEW.resource, id: 'already-set' } }
    expect(packagedResource(withId).id).toBe('already-set')
  })

  it('changes nothing else about the resource', () => {
    const packaged = packagedResource(VIEW)
    const { id, ...rest } = packaged
    expect(rest).toEqual(VIEW.resource)
  })

  it('packages a resource-only package, so SQL-on-FHIR needs no CQL', () => {
    const files = buildFhirPackage(MANIFEST, [], [VIEW])
    expect(files.map((f) => f.path)).toEqual([
      'package/.index.json',
      'package/ViewDefinition-patient-hba1c.json',
      'package/package.json',
    ])
  })

  it('omits the Library-only kind field for other resource types', () => {
    const files = buildFhirPackage(MANIFEST, [], [VIEW])
    const index = JSON.parse(files.find((f) => f.path.endsWith('.index.json'))!.content)
    expect(index.files[0].kind).toBeUndefined()
    expect(index.files[0].resourceType).toBe('ViewDefinition')
  })
})

/**
 * The CRMI artifact Bundle, asked for by Bryn Rhodes on Zulip: the shape
 * `$package` returns, emitted as a file because this repository has no server
 * to run the operation on.
 */
describe('buildPackageBundle', () => {
  const bundle = () => buildPackageBundle(MANIFEST, [MAIN])
  const entries = (b: Record<string, unknown>) =>
    b.entry as { fullUrl: string; resource: Record<string, unknown> }[]

  it('is a collection Bundle', () => {
    const b = bundle()
    expect(b.resourceType).toBe('Bundle')
    expect(b.type).toBe('collection')
  })

  it('leads with an asset-collection Library describing the rest', () => {
    const [first, ...rest] = entries(bundle())
    expect(first.resource.resourceType).toBe('Library')
    const type = first.resource.type as { coding: { code: string }[] }
    expect(type.coding[0].code).toBe('asset-collection')
    const related = first.resource.relatedArtifact as { type: string; resource: string }[]
    expect(related).toHaveLength(rest.length)
    expect(related.every((r) => r.type === 'composed-of')).toBe(true)
  })

  it('every composed-of reference resolves to an entry in the same bundle', () => {
    // A manifest that points at artifacts the bundle does not carry is worse
    // than no manifest: it reads as complete while being unresolvable.
    const b = bundle()
    const urls = new Set(entries(b).map((e) => e.fullUrl))
    const related = entries(b)[0].resource.relatedArtifact as { resource: string }[]
    expect(related.every((r) => urls.has(r.resource))).toBe(true)
  })

  it('gives every entry a fullUrl under the project canonical base', () => {
    expect(entries(bundle()).every((e) => e.fullUrl.startsWith(CANONICAL_BASE))).toBe(true)
  })

  it('carries FHIR resources the package already holds, not only the CQL', () => {
    const measure = { resourceType: 'Measure', id: 'CMS122', status: 'active' }
    const b = buildPackageBundle(MANIFEST, [MAIN], [{ path: 'fhir/Measure-CMS122.json', resource: measure }])
    const types = entries(b).slice(1).map((e) => e.resource.resourceType)
    expect(types).toContain('Measure')
    expect(types).toContain('Library')
  })

  it('holds exactly the resources the npm package holds', () => {
    // Two containers, one list. If these ever diverge, a consumer choosing a
    // format is choosing different content, which is the thing to prevent.
    const measure = { resourceType: 'Measure', id: 'CMS122', status: 'active' }
    const resources = [{ path: 'fhir/Measure-CMS122.json', resource: measure }]
    const inBundle = entries(buildPackageBundle(MANIFEST, [MAIN], resources))
      .slice(1)
      .map((e) => `${String(e.resource.resourceType)}-${String(e.resource.id)}.json`)
      .sort()
    const inPackage = buildFhirPackage(MANIFEST, [MAIN], resources)
      .map((f) => f.path.replace('package/', ''))
      .filter((n) => n !== 'package.json' && n !== '.index.json')
      .sort()
    expect(inBundle).toEqual(inPackage)
  })

  it('is byte-identical across runs', () => {
    expect(JSON.stringify(bundle())).toBe(JSON.stringify(bundle()))
  })
})

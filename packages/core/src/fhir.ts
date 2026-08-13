/**
 * Builds a FHIR NPM package from an Open Quality package.
 *
 * The point is to meet the ecosystem's format rather than ask it to take ours.
 * CQL Studio loads FHIR npm `.tgz` files, the FHIR package registry serves
 * them, and IG Publisher emits them, so a measure expressed that way is
 * consumable by tools nobody had to modify.
 *
 * Pure functions over strings and objects. Writing the tarball needs a
 * filesystem and belongs in the CLI, the same split as manifest.ts and pack.ts.
 */
import type { Manifest } from './manifest.js'
import { parseHeader, parseIncludes } from './cql.js'

/**
 * Canonical base for resources this repository packages.
 *
 * Deliberately under a domain this project controls. The CQL it wraps was
 * published elsewhere, and minting a canonical that looked authoritative for
 * someone else's artifact would be a provenance claim we cannot make. A reader
 * resolving one of these URLs should land on the repackager, not be misled into
 * thinking they found the steward.
 */
export const CANONICAL_BASE = 'https://openquality.us/fhir'

/** FHIR ids allow letters, digits, hyphen and dot, up to 64 characters. */
function fhirId(name: string): string {
  return name.replace(/[^A-Za-z0-9.-]/g, '-').slice(0, 64)
}

export interface CqlFile {
  /** Package-relative path, for example `cql/FHIRHelpers.cql`. */
  path: string
  source: string
}

export interface FhirPackageOptions {
  /** Overrides the licence written into package.json. Defaults to the manifest's. */
  license?: string
  /** Who the content is attributed to. */
  author?: string
}

/**
 * A `Library` carrying the CQL as an attachment, which is how the FHIR
 * ecosystem ships CQL.
 *
 * `experimental` is true on purpose. These are repackaged copies published for
 * reading and teaching, and the upstream describes its own content as draft.
 * Saying otherwise would overstate what the package is for.
 */
export function buildLibrary(file: CqlFile, manifest: Manifest, opts: FhirPackageOptions = {}): Record<string, unknown> {
  const header = parseHeader(file.source)
  const name = header?.name ?? file.path.replace(/^.*\//, '').replace(/\.cql$/, '')
  const id = fhirId(name)

  const dependsOn = parseIncludes(file.source)
    .map((inc) => ({
      type: 'depends-on',
      display: `${inc.library} version ${inc.version}`,
      resource: `${CANONICAL_BASE}/Library/${fhirId(inc.library)}`,
    }))
    // Sorted so the resource is byte-identical across runs regardless of the
    // order the includes happen to appear in.
    .sort((a, b) => byCodeUnit(a.resource, b.resource))

  const library: Record<string, unknown> = {
    resourceType: 'Library',
    id,
    url: `${CANONICAL_BASE}/Library/${id}`,
    version: header?.version ?? manifest.version,
    name,
    status: 'active',
    experimental: true,
    type: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/library-type', code: 'logic-library' },
      ],
    },
    publisher: opts.author ?? 'Open Quality',
    description:
      `CQL library ${name}, repackaged from the Open Quality package ${manifest.id} ` +
      `version ${manifest.version}. Not an authoritative publication of this logic.`,
  }

  if (dependsOn.length > 0) library.relatedArtifact = dependsOn
  library.content = [{ contentType: 'text/cql', data: Buffer.from(file.source, 'utf8').toString('base64') }]
  return library
}

/**
 * FHIR package ids are dot separated and lowercase. `cms/breast-cancer` becomes
 * `us.openquality.cms.breast-cancer`, which keeps the publisher, the collection
 * and the measure all readable in the name a tool displays.
 */
export function fhirPackageName(manifestId: string): string {
  return `us.openquality.${manifestId.toLowerCase().replace(/[^a-z0-9./-]/g, '-').split('/').join('.')}`
}

/**
 * The FHIR version the logic targets, taken from the CQL rather than guessed.
 *
 * A `using FHIR version 'x'` states it outright. QI-Core does not, but every
 * published QI-Core release profiles R4, so 4.0.1 is the answer for it. An
 * unrecognised model gets 4.0.1 too, and the caller can override.
 */
export function fhirVersionFor(files: CqlFile[]): string {
  for (const file of files) {
    const header = parseHeader(file.source)
    if (header?.model === 'FHIR' && header.modelVersion) return header.modelVersion
  }
  return '4.0.1'
}

export function buildPackageJson(
  manifest: Manifest,
  files: CqlFile[],
  opts: FhirPackageOptions = {},
): Record<string, unknown> {
  const fhirVersion = fhirVersionFor(files)

  // Only what the CQL actually declares. A dependency we inferred would be a
  // claim the package cannot support, and a wrong one breaks a consumer's
  // install rather than merely misinforming them.
  const dependencies: Record<string, string> = { 'hl7.fhir.r4.core': fhirVersion }
  for (const file of files) {
    const header = parseHeader(file.source)
    if (header?.model === 'QICore' && header.modelVersion) {
      dependencies['hl7.fhir.us.qicore'] = header.modelVersion
    }
  }

  return {
    name: fhirPackageName(manifest.id),
    version: manifest.version,
    title: manifest.measure?.title ?? manifest.id,
    description:
      `${manifest.measure?.title ?? manifest.id}. Repackaged by Open Quality from ` +
      `openquality.us for reading, teaching and testing. Not for production reporting.`,
    fhirVersions: [fhirVersion],
    type: 'Conformance',
    canonical: CANONICAL_BASE,
    url: 'https://openquality.us/library',
    homepage: 'https://openquality.us',
    author: opts.author ?? 'Open Quality',
    license: opts.license ?? manifest.license,
    keywords: ['cql', 'quality-measure', 'ecqm', manifest.dataModel ?? 'fhir'].filter(Boolean),
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => byCodeUnit(a, b))),
  }
}

/** A FHIR resource the package already holds as JSON, such as a ViewDefinition. */
export interface FhirResourceFile {
  /** Package-relative path, for example `views/patient-hba1c.json`. */
  path: string
  resource: Record<string, unknown>
}

/**
 * A packaged copy of a resource the package already carries.
 *
 * An `id` is added when the resource has none, because a package index is keyed
 * by one and a resource without an id cannot be referenced. It is derived from
 * the resource's own name, or failing that its filename, so the same input
 * always yields the same id. Nothing else about the resource is touched: this
 * is packaging, not authorship, and rewriting someone's resource would make the
 * copy differ from the thing it claims to be.
 */
export function packagedResource(file: FhirResourceFile): Record<string, unknown> {
  if (typeof file.resource.id === 'string' && file.resource.id.length > 0) return file.resource
  const fallback = String(file.resource.name ?? file.path.replace(/^.*\//, '').replace(/\.json$/, ''))
  return { ...file.resource, id: fhirId(fallback) }
}

export interface IndexedFile {
  filename: string
  resource: Record<string, unknown>
}

/** The `.index.json` a FHIR package carries so a consumer need not open every file. */
export function buildPackageIndex(files: IndexedFile[]): Record<string, unknown> {
  return {
    'index-version': 2,
    files: files
      .map(({ filename, resource }) => ({
        filename,
        resourceType: String(resource.resourceType ?? ''),
        id: String(resource.id ?? ''),
        url: String(resource.url ?? ''),
        version: String(resource.version ?? ''),
        // `kind` describes a Library's flavour and means nothing for anything
        // else, so it is only emitted where it applies.
        ...(resource.resourceType === 'Library' ? { kind: 'logic-library' } : {}),
        type: String(resource.resourceType ?? ''),
      }))
      .sort((a, b) => byCodeUnit(a.filename, b.filename)),
  }
}

/**
 * Orders by code unit, not by locale.
 *
 * `localeCompare` uses the runtime's default locale, which differs between
 * machines and CI images. These names decide the order of entries in a tarball,
 * so a locale-sensitive comparison would give the same content different
 * digests on different machines, which is the one thing the digest exists to
 * rule out.
 */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface FhirPackageFile {
  /** Path inside the tarball, already prefixed with `package/`. */
  path: string
  content: string
}

/**
 * Every file the FHIR package contains, ready to be written.
 *
 * Sorted, and with no timestamp anywhere, so the same input always produces the
 * same bytes. That is the same requirement the tarball in pack.ts has, for the
 * same reason: a digest that changes between runs cannot address content.
 */
export function buildFhirPackage(
  manifest: Manifest,
  files: CqlFile[],
  resources: FhirResourceFile[] = [],
  opts: FhirPackageOptions = {},
): FhirPackageFile[] {
  const fromCql: IndexedFile[] = files.map((file) => {
    const resource = buildLibrary(file, manifest, opts)
    return { filename: `Library-${String(resource.id)}.json`, resource }
  })

  // Resources the package already holds go in as they are. A ViewDefinition is
  // a FHIR resource, so a SQL-on-FHIR package needs no conversion to become a
  // FHIR package: it only needed someone to put it in the format.
  const fromJson: IndexedFile[] = resources.map((file) => {
    const resource = packagedResource(file)
    return { filename: `${String(resource.resourceType)}-${String(resource.id)}.json`, resource }
  })

  const indexed = [...fromCql, ...fromJson].sort((a, b) => byCodeUnit(a.filename, b.filename))

  const out: FhirPackageFile[] = [
    { path: 'package/package.json', content: `${JSON.stringify(buildPackageJson(manifest, files, opts), null, 2)}\n` },
    { path: 'package/.index.json', content: `${JSON.stringify(buildPackageIndex(indexed), null, 2)}\n` },
    ...indexed.map((entry) => ({
      path: `package/${entry.filename}`,
      content: `${JSON.stringify(entry.resource, null, 2)}\n`,
    })),
  ]
  return out.sort((a, b) => byCodeUnit(a.path, b.path))
}

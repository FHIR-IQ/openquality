import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  readCorpus,
  resolveDependencies,
  type PackageDependency,
  buildFhirPackage,
  fhirPackageName,
  listPackageFiles,
  packFiles,
  parseManifest,
  type CqlFile,
  type FhirResourceFile,
  type Manifest,
} from '@openquality/core'
import type { Writer } from './validate.js'

/**
 * Emits a FHIR NPM package for an Open Quality package.
 *
 * The point is to meet the ecosystem's format rather than ask it to take ours:
 * CQL Studio loads FHIR npm tarballs, the FHIR package registry serves them,
 * and IG Publisher emits them, so a measure shipped this way is consumable by
 * tools nobody had to modify.
 *
 * Packing goes through packFiles so this shares one definition of a
 * deterministic tarball with packPackage. Two packers with their own tar
 * options is how a digest stops addressing content.
 */
/**
 * The collection roots to resolve dependencies against: every directory under
 * the nearest `measures/` above the package, unless `corpus` names one.
 */
async function corpusRoots(dir: string, corpus?: string): Promise<string[]> {
  let measures = corpus ? resolve(corpus) : undefined
  for (let at = resolve(dir); !measures; at = dirname(at)) {
    const candidate = join(at, 'measures')
    if (await stat(candidate).then((s) => s.isDirectory(), () => false)) measures = candidate
    else if (dirname(at) === at) return []
  }
  const entries = await readdir(measures, { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isDirectory()).map((e) => join(measures!, e.name)).sort()
}

/**
 * Every package this one depends on, transitively, with its CQL read, or the
 * list of what could not be found. Shared by the npm package and the CRMI
 * bundle commands, so both carry the same dependencies.
 */
export async function collectDependencies(
  dir: string,
  manifest: Manifest,
  corpus?: string,
): Promise<{ dependencies: PackageDependency[]; missing: string[] }> {
  if (!manifest.dependencies?.length) return { dependencies: [], missing: [] }
  const index = await readCorpus(await corpusRoots(dir, corpus))
  const { resolved, missing } = resolveDependencies(manifest, (id, version) => index.get(`${id}@${version}`))
  const dependencies: PackageDependency[] = []
  for (const pkg of resolved) {
    dependencies.push({ manifest: pkg.manifest, files: (await collectPackageResources(pkg.dir)).cql })
  }
  return { dependencies, missing: missing.map((m) => `${m.id}@${m.version} (required by ${m.requiredBy})`) }
}

export async function runFhirPackage(
  dir: string,
  outPath: string | undefined,
  write: Writer,
  corpus?: string,
): Promise<number> {
  let manifestSource: string
  try {
    manifestSource = await readFile(join(dir, 'openquality.yaml'), 'utf8')
  } catch {
    write(`error  openquality.yaml not found at ${dir}`)
    return 1
  }

  const parsed = parseManifest(manifestSource)
  if (!parsed.ok) {
    for (const finding of parsed.findings) write(`error  ${finding.path ?? ''} ${finding.message}`)
    return 1
  }
  const manifest = parsed.manifest

  const { cql, resources } = await collectPackageResources(dir)

  if (cql.length === 0 && resources.length === 0) {
    write(`error  ${dir} holds no CQL and no FHIR resource, so there is nothing to package`)
    write('       A FHIR package carries CQL as Library resources, plus any FHIR')
    write('       JSON the package already declares.')
    return 1
  }

  const { dependencies, missing } = await collectDependencies(dir, manifest, corpus)
  if (missing.length > 0) {
    for (const m of missing) write(`error  dependency not found: ${m}`)
    return 1
  }

  const files = buildFhirPackage(manifest, cql, resources, { license: manifest.license }, dependencies)
  const { tarball, digest } = await packFiles(files)

  const name = fhirPackageName(manifest.id)
  const target = outPath ?? `${name}-${manifest.version}.tgz`
  await writeFile(target, tarball)

  write(`wrote ${target}`)
  write(`  package  ${name}@${manifest.version}`)
  const counts = [
    `${cql.length} Library resource${cql.length === 1 ? '' : 's'}`,
    ...(resources.length ? [`${resources.length} packaged resource${resources.length === 1 ? '' : 's'}`] : []),
  ]
  write(`  contents ${files.length} files, ${counts.join(', ')}`)
  write(`  sha256   ${digest}`)
  write('')
  write('Repackaged for reading and teaching. The Library resources are marked')
  write('experimental and their canonical URLs point at openquality.us rather than at')
  write('the steward, because this is not an authoritative publication of the logic.')
  return 0
}

/**
 * The CQL and FHIR resources a package directory holds. Shared by the npm
 * package and the CRMI bundle commands, so the two forms are always built from
 * the same reading of the directory.
 */
export async function collectPackageResources(
  dir: string,
): Promise<{ cql: CqlFile[]; resources: FhirResourceFile[] }> {
  const cql: CqlFile[] = []
  const resources: FhirResourceFile[] = []
  for (const rel of await listPackageFiles(dir)) {
    if (rel.endsWith('.cql')) {
      cql.push({ path: rel, source: await readFile(join(dir, rel), 'utf8') })
      continue
    }
    if (!rel.endsWith('.json')) continue
    // Anything already shaped like a FHIR resource goes in as it is. A
    // ViewDefinition is one, so a SQL-on-FHIR package becomes a FHIR package
    // without conversion. Files that are not resources are skipped rather than
    // reported: a package may hold JSON for its own reasons.
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(join(dir, rel), 'utf8'))
    } catch {
      continue
    }
    if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).resourceType === 'string') {
      resources.push({ path: rel, resource: parsed as Record<string, unknown> })
    }
  }
  return { cql, resources }
}

/**
 * Reads and validates a package manifest, or explains why it could not.
 * Shared for the same reason as collectPackageResources.
 */
export async function readPackageManifest(
  dir: string,
  write: Writer,
): Promise<Manifest | undefined> {
  let source: string
  try {
    source = await readFile(join(dir, 'openquality.yaml'), 'utf8')
  } catch {
    write(`error  openquality.yaml not found at ${dir}`)
    return undefined
  }
  const parsed = parseManifest(source)
  if (!parsed.ok) {
    for (const finding of parsed.findings) write(`error  ${finding.path ?? ''} ${finding.message}`)
    return undefined
  }
  return parsed.manifest
}

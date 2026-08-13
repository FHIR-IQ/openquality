import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildFhirPackage,
  fhirPackageName,
  listPackageFiles,
  packFiles,
  parseManifest,
  type CqlFile,
  type FhirResourceFile,
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
export async function runFhirPackage(dir: string, outPath: string | undefined, write: Writer): Promise<number> {
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

  if (cql.length === 0 && resources.length === 0) {
    write(`error  ${dir} holds no CQL and no FHIR resource, so there is nothing to package`)
    write('       A FHIR package carries CQL as Library resources, plus any FHIR')
    write('       JSON the package already declares.')
    return 1
  }

  const files = buildFhirPackage(manifest, cql, resources, { license: manifest.license })
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

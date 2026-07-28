import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { Finding } from './report.js'

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const PACKAGE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/
const ARTIFACT_TYPES = [
  'cql', 'sql', 'fhir/Measure', 'fhir/Library', 'fhir/ValueSet',
  'sql-on-fhir/ViewDefinition', 'python', 'r', 'notebook', 'doc',
] as const
const DATA_MODELS = ['fhir-r4', 'qdm-5.6', 'omop-5.4', 'sql-on-fhir', 'custom'] as const
const MEASURE_TYPES = ['process', 'outcome', 'intermediate-outcome', 'structural', 'patient-reported-outcome'] as const

/**
 * An artifact path must stay inside the package. Rejected here as well as in
 * the validator because a path escaping the root is structurally invalid, and
 * because the registry runs this over packages submitted by strangers.
 */
function isContainedPath(path: string): boolean {
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false
  return !path.split(/[\\/]/).includes('..')
}

const ArtifactSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .refine(isContainedPath, {
        message: 'artifact path must stay inside the package: no absolute paths, no ".." segments',
      }),
    type: z.enum(ARTIFACT_TYPES),
    dialect: z.string().optional(),
  })
  .refine((a) => a.type !== 'sql' || !!a.dialect, {
    message: 'artifacts of type "sql" must declare a dialect',
  })

// Deliberately no `.refine` requiring oid or url. That rule belongs to the
// `valuesets.referenced` check in Task 5, not to schema parsing. Enforcing it
// here would tag the finding `manifest.schema` and abort the whole run before
// any other check executes, so an author would see one misattributed error
// instead of every problem in their package at once.
const ValueSetSchema = z.object({
  oid: z.string().optional(),
  url: z.string().optional(),
  source: z.string().optional(),
})

const MeasureSchema = z.object({
  title: z.string().min(1),
  steward: z.string().optional(),
  identifiers: z.array(z.string()).optional(),
  type: z.enum(MEASURE_TYPES).optional(),
  improvementNotation: z.enum(['increase', 'decrease']).optional(),
  domain: z.array(z.string()).optional(),
  setting: z.array(z.string()).optional(),
})

export const ManifestSchema = z.object({
  id: z.string().regex(PACKAGE_ID, 'id must be namespace/name, lowercase alphanumeric and hyphens'),
  // Stringified first, because YAML parses a bare `version: 2026` as a number.
  // Without this, Zod fails on the base type and reports "expected string,
  // received number", which tells an author nothing about what is actually
  // wrong. `1.2.0` is not a valid YAML number so it already arrives as a string.
  version: z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : v),
    z.string().regex(SEMVER, 'version must be semver, for example 1.2.0'),
  ),
  license: z.string().min(1),
  measurementPeriod: z.number().int().min(1990).max(2100).optional(),
  measure: MeasureSchema.optional(),
  dataModel: z.enum(DATA_MODELS).optional(),
  artifacts: z.array(ArtifactSchema),
  valueSets: z.array(ValueSetSchema).optional(),
  dependencies: z.array(z.object({ id: z.string(), version: z.string() })).optional(),
})

export type Manifest = z.infer<typeof ManifestSchema>
export type Artifact = z.infer<typeof ArtifactSchema>

export type ParseResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; findings: Finding[] }

/** Parses and validates manifest YAML. Never throws. */
export function parseManifest(source: string): ParseResult {
  let raw: unknown
  try {
    raw = parseYaml(source)
  } catch (err) {
    return {
      ok: false,
      findings: [{
        check: 'manifest.schema',
        severity: 'error',
        message: `openquality.yaml is not valid YAML: ${(err as Error).message}`,
        path: 'openquality.yaml',
      }],
    }
  }

  const parsed = ManifestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      findings: parsed.error.issues.map((issue) => ({
        check: 'manifest.schema' as const,
        severity: 'error' as const,
        message: issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
        path: 'openquality.yaml',
      })),
    }
  }

  return { ok: true, manifest: parsed.data }
}

# Package Format and Validation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@openquality/core`, the library that defines the package manifest, validates a package directory, and computes its conformance level, plus the `oq` CLI that runs it locally.

**Architecture:** Pure TypeScript with no network and no infrastructure. The library takes a package directory, parses `openquality.yaml`, runs a set of independent checks that each emit findings, and computes a conformance level from those findings. Deep validators (CQL translation, FHIR profile validation, SQL parsing) are out of scope here; the report type has slots for their results so the level function already handles them. Every check is a pure function over parsed input, which is what makes the whole thing testable without fixtures on disk.

**Tech Stack:** Node 22, TypeScript, pnpm workspaces, Zod for schema validation, `yaml` for parsing, `tar` for packing, Vitest for tests, `commander` for the CLI.

**Reference:** Implements sections 4 (Package Model), 5.4 (Forbidden Content Scanning), and 5.5 (Security) of `docs/superpowers/specs/2026-07-27-openquality-registry-design.md`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/core/src/report.ts` | Finding, Severity, CheckId, ValidationReport types. No logic. |
| `packages/core/src/manifest.ts` | Zod schema for `openquality.yaml`, parse function, exported types. |
| `packages/core/src/licenses.ts` | SPDX allowlist and the license check. |
| `packages/core/src/valuesets.ts` | Value set reference format check (OID and canonical URL). |
| `packages/core/src/readme.ts` | Level 1 README required-section check. |
| `packages/core/src/scanner.ts` | Forbidden content scanning over file contents. |
| `packages/core/src/level.ts` | Conformance level computation from a report. Pure. |
| `packages/core/src/validate.ts` | Orchestrator: reads a directory, runs all checks, returns a report. |
| `packages/core/src/pack.ts` | Deterministic tarball creation and SHA-256 digest. |
| `packages/cli/src/commands/validate.ts` | `oq validate` command. |
| `packages/cli/src/commands/pack.ts` | `oq pack` command. |

Split by responsibility rather than by layer. Each check file owns one rule and its tests, so a rule change touches one file.

---

### Task 1: Workspace scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`

Nothing in this plan ever builds `dist`. Vitest runs the TypeScript sources directly and
the CLI is tested by calling its command functions, not by executing a compiled binary.
So TypeScript is configured for type checking only (`noEmit`), not for emit. Do not add
`composite`, `declaration`, `outDir`, or project references: they require an emit
pipeline that does not exist here, and `tsc -b` without a root `tsconfig.json` fails
with TS5083.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "openquality",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.7.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

`tsconfig.json` (the entry point `pnpm typecheck` uses; covers every package at once):

```json
{
  "extends": "./tsconfig.base.json",
  "include": ["packages/*/src/**/*.ts", "packages/*/test/**/*.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Create the core package**

`packages/core/package.json`:

```json
{
  "name": "@openquality/core",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "yaml": "^2.6.0",
    "zod": "^3.23.0",
    "tar": "^7.4.0"
  },
  "devDependencies": {
    "@types/tar": "^6.1.13"
  }
}
```

There is deliberately no `main` or `types` field. Both would point into `dist`, which
nothing in this plan builds, so they would be dead config that lies about the package.
`exports` resolves to the TypeScript source, which is what Vitest and the workspace
link in Task 11 actually consume.

`packages/core/tsconfig.json` (for editors and per-package checks; the root config is
what `pnpm typecheck` runs):

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Install and verify the toolchain**

Run: `pnpm install`
Expected: installs without error, creates `pnpm-lock.yaml`.

Run: `pnpm test`
Expected: `No test files found` and exit code 1. That is correct at this point, there are no tests yet.

Run: `pnpm typecheck`
Expected: exits 0 with no output. An empty `include` match is not an error.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json vitest.config.ts pnpm-lock.yaml packages/core/package.json packages/core/tsconfig.json
git commit -m "chore: scaffold pnpm workspace and core package"
```

---

### Task 2: Report types

These types are the contract every other task depends on, so they land first and change last. No logic, therefore no test of their own; they are exercised by every task that follows.

**Files:**
- Create: `packages/core/src/report.ts`

- [ ] **Step 1: Write the types**

```typescript
/** Severity of a single validation finding. */
export type Severity = 'error' | 'warning' | 'info'

/**
 * Every check the validator can run. Deep checks (cql.*, fhir.*, sql.*) are
 * declared here but implemented by the validator worker in a later plan.
 */
export type CheckId =
  | 'manifest.schema'
  | 'manifest.license'
  | 'manifest.dataModel'
  | 'artifacts.present'
  | 'artifacts.typed'
  | 'valuesets.referenced'
  | 'readme.sections'
  | 'content.forbidden'
  | 'cql.translate'
  | 'fhir.validate'
  | 'sql.parse'

export interface Finding {
  check: CheckId
  severity: Severity
  message: string
  /** Package-relative path the finding applies to, when it applies to a file. */
  path?: string
}

export interface ValidationReport {
  /** Checks that actually executed. A check absent from this list did not run. */
  checksRun: CheckId[]
  findings: Finding[]
}

/** Conformance level. 0 Shared, 1 Described, 2 Verified. */
export type ConformanceLevel = 0 | 1 | 2

export function hasError(report: ValidationReport, check: CheckId): boolean {
  return report.findings.some((f) => f.check === check && f.severity === 'error')
}

export function ran(report: ValidationReport, check: CheckId): boolean {
  return report.checksRun.includes(check)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/report.ts
git commit -m "feat(core): add validation report types"
```

---

### Task 3: Manifest schema

**Files:**
- Create: `packages/core/src/manifest.ts`
- Test: `packages/core/test/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { parseManifest } from '../src/manifest.js'

const VALID = `
id: gene/hba1c-poor-control
version: 1.2.0
license: Apache-2.0
measurementPeriod: 2026
measure:
  title: "Diabetes: Hemoglobin A1c Poor Control (>9%)"
  steward: CMS
  identifiers: [CMS122v13, NQF-0059]
  type: intermediate-outcome
  improvementNotation: decrease
  domain: [diabetes]
  setting: [ambulatory]
dataModel: fhir-r4
artifacts:
  - path: cql/HbA1cPoorControl.cql
    type: cql
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
`

describe('parseManifest', () => {
  it('parses a complete valid manifest', () => {
    const result = parseManifest(VALID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.id).toBe('gene/hba1c-poor-control')
    expect(result.manifest.measure.steward).toBe('CMS')
    expect(result.manifest.artifacts[0].type).toBe('cql')
  })

  it('parses a minimal manifest with only required fields', () => {
    const result = parseManifest(`
id: gene/minimal
version: 0.1.0
license: MIT
artifacts:
  - path: sql/measure.sql
    type: sql
    dialect: postgres
`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.measure).toBeUndefined()
    expect(result.manifest.dataModel).toBeUndefined()
  })

  it('rejects an id without a namespace', () => {
    const result = parseManifest('id: nonamespace\nversion: 1.0.0\nlicense: MIT\nartifacts: []')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings[0].check).toBe('manifest.schema')
    expect(result.findings[0].message).toMatch(/namespace\/name/)
  })

  it('rejects a non-semver version', () => {
    const result = parseManifest('id: a/b\nversion: 2026\nlicense: MIT\nartifacts: []')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings.some((f) => f.message.match(/semver/))).toBe(true)
  })

  it('rejects an sql artifact with no dialect', () => {
    const result = parseManifest(`
id: a/b
version: 1.0.0
license: MIT
artifacts:
  - path: q.sql
    type: sql
`)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings.some((f) => f.message.match(/dialect/))).toBe(true)
  })

  it('reports a finding rather than throwing on malformed yaml', () => {
    const result = parseManifest('id: [unclosed')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.findings[0].check).toBe('manifest.schema')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/manifest.test.ts`
Expected: FAIL, cannot resolve `../src/manifest.js`.

- [ ] **Step 3: Write the implementation**

```typescript
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

const ArtifactSchema = z
  .object({
    path: z.string().min(1),
    type: z.enum(ARTIFACT_TYPES),
    dialect: z.string().optional(),
  })
  .refine((a) => a.type !== 'sql' || !!a.dialect, {
    message: 'artifacts of type "sql" must declare a dialect',
  })

const ValueSetSchema = z
  .object({
    oid: z.string().optional(),
    url: z.string().optional(),
    source: z.string().optional(),
  })
  .refine((v) => !!v.oid || !!v.url, {
    message: 'each valueSets entry must have an oid or a url',
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
  version: z.string().regex(SEMVER, 'version must be semver, for example 1.2.0'),
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/manifest.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/manifest.ts packages/core/test/manifest.test.ts
git commit -m "feat(core): add openquality.yaml manifest schema and parser"
```

---

### Task 4: License allowlist

**Files:**
- Create: `packages/core/src/licenses.ts`
- Test: `packages/core/test/licenses.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { checkLicense } from '../src/licenses.js'

describe('checkLicense', () => {
  it('accepts an allowlisted OSI license', () => {
    expect(checkLicense('Apache-2.0')).toEqual([])
  })

  it('accepts an allowlisted Creative Commons license', () => {
    expect(checkLicense('CC-BY-4.0')).toEqual([])
  })

  it('rejects a license not on the allowlist', () => {
    const findings = checkLicense('Proprietary')
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('manifest.license')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/Proprietary/)
  })

  it('rejects a non-commercial license, since it blocks the intended reuse', () => {
    const findings = checkLicense('CC-BY-NC-4.0')
    expect(findings).toHaveLength(1)
  })

  it('is case sensitive, because SPDX identifiers are', () => {
    expect(checkLicense('apache-2.0')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/licenses.test.ts`
Expected: FAIL, cannot resolve `../src/licenses.js`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Finding } from './report.js'

/**
 * SPDX identifiers Open Quality accepts. Deliberately short. Non-commercial
 * and no-derivatives variants are excluded because they block the reuse the
 * registry exists to enable.
 */
export const ALLOWED_LICENSES = [
  'Apache-2.0',
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'LGPL-3.0-only',
  'MPL-2.0',
] as const

export function checkLicense(license: string): Finding[] {
  if ((ALLOWED_LICENSES as readonly string[]).includes(license)) return []
  return [{
    check: 'manifest.license',
    severity: 'error',
    message:
      `license "${license}" is not on the Open Quality allowlist. ` +
      `Allowed: ${ALLOWED_LICENSES.join(', ')}`,
    path: 'openquality.yaml',
  }]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/licenses.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/licenses.ts packages/core/test/licenses.test.ts
git commit -m "feat(core): add SPDX license allowlist check"
```

---

### Task 5: Value set reference check

Enforces the spec rule that value sets are referenced, never embedded. This check validates reference *format*; resolving an OID against VSAC needs the network and belongs to the validator worker plan.

**Files:**
- Create: `packages/core/src/valuesets.ts`
- Test: `packages/core/test/valuesets.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { checkValueSetRefs } from '../src/valuesets.js'

describe('checkValueSetRefs', () => {
  it('accepts a well formed OID', () => {
    expect(checkValueSetRefs([{ oid: '2.16.840.1.113883.3.464.1003.103.12.1001', source: 'vsac' }]))
      .toEqual([])
  })

  it('accepts a canonical URL', () => {
    expect(checkValueSetRefs([{ url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464' }]))
      .toEqual([])
  })

  it('rejects a malformed OID', () => {
    const findings = checkValueSetRefs([{ oid: '2.16.840..1003' }])
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('valuesets.referenced')
    expect(findings[0].severity).toBe('error')
  })

  it('rejects a url that is not http or https', () => {
    const findings = checkValueSetRefs([{ url: 'ftp://example.org/vs' }])
    expect(findings).toHaveLength(1)
  })

  it('returns no findings when the package declares no value sets', () => {
    expect(checkValueSetRefs(undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/valuesets.test.ts`
Expected: FAIL, cannot resolve `../src/valuesets.js`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Finding } from './report.js'

/** Dotted decimal OID: digit groups separated by single dots, no empty groups. */
const OID = /^\d+(\.\d+)+$/

export interface ValueSetRef {
  oid?: string
  url?: string
  source?: string
}

export function checkValueSetRefs(refs: ValueSetRef[] | undefined): Finding[] {
  if (!refs) return []
  const findings: Finding[] = []

  for (const ref of refs) {
    if (ref.oid && !OID.test(ref.oid)) {
      findings.push({
        check: 'valuesets.referenced',
        severity: 'error',
        message: `"${ref.oid}" is not a valid OID`,
        path: 'openquality.yaml',
      })
    }
    if (ref.url && !/^https?:\/\//.test(ref.url)) {
      findings.push({
        check: 'valuesets.referenced',
        severity: 'error',
        message: `value set url "${ref.url}" must be http or https`,
        path: 'openquality.yaml',
      })
    }
  }

  return findings
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/valuesets.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/valuesets.ts packages/core/test/valuesets.test.ts
git commit -m "feat(core): add value set reference format check"
```

---

### Task 6: README section check

Level 1 requires a README with sections for intent, known limitations, and provenance. This check reads heading text only, so it does not care about surrounding prose.

**Files:**
- Create: `packages/core/src/readme.ts`
- Test: `packages/core/test/readme.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { checkReadmeSections, REQUIRED_SECTIONS } from '../src/readme.js'

const COMPLETE = `
# My Measure

## Intent
Measures poor glycemic control.

## Known Limitations
Assumes labs are coded with LOINC.

## Provenance
Derived from CMS122v13.
`

describe('checkReadmeSections', () => {
  it('accepts a readme with all required sections', () => {
    expect(checkReadmeSections(COMPLETE)).toEqual([])
  })

  it('matches headings case insensitively', () => {
    const lower = COMPLETE.replace('## Intent', '## intent')
    expect(checkReadmeSections(lower)).toEqual([])
  })

  it('reports each missing section separately', () => {
    const findings = checkReadmeSections('# Title\n\n## Intent\nsomething\n')
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.message).join(' ')).toMatch(/known limitations/i)
    expect(findings.map((f) => f.message).join(' ')).toMatch(/provenance/i)
  })

  it('reports every section missing when the readme is absent', () => {
    const findings = checkReadmeSections(undefined)
    expect(findings).toHaveLength(REQUIRED_SECTIONS.length)
  })

  it('ignores a section name that appears only in body text', () => {
    const findings = checkReadmeSections('# T\n\n## Intent\nSee provenance and known limitations below.\n')
    expect(findings).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/readme.test.ts`
Expected: FAIL, cannot resolve `../src/readme.js`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Finding } from './report.js'

export const REQUIRED_SECTIONS = ['intent', 'known limitations', 'provenance'] as const

/** Returns lowercased text of every ATX heading in the document. */
function headings(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.match(/^#{1,6}\s+(.*)$/)?.[1])
    .filter((text): text is string => !!text)
    .map((text) => text.trim().toLowerCase())
}

export function checkReadmeSections(readme: string | undefined): Finding[] {
  const found = readme ? headings(readme) : []
  return REQUIRED_SECTIONS
    .filter((required) => !found.some((h) => h.includes(required)))
    .map((required) => ({
      check: 'readme.sections' as const,
      severity: 'error' as const,
      message: `README is missing a "${required}" section, which Level 1 requires`,
      path: 'README.md',
    }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/readme.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/readme.ts packages/core/test/readme.test.ts
git commit -m "feat(core): add README required section check"
```

---

### Task 7: Forbidden content scanner

Implements spec section 5.4. This is heuristic by design. Embedded value set expansions are an error because they are the licensing risk the spec names. Copyright strings and CPT patterns are warnings, because false positives are expected and a human resolves them.

**Files:**
- Create: `packages/core/src/scanner.ts`
- Test: `packages/core/test/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { scanContent } from '../src/scanner.js'

describe('scanContent', () => {
  it('passes a clean CQL file', () => {
    expect(scanContent('cql/M.cql', 'valueset "Diabetes": \'urn:oid:2.16.840.1\'')).toEqual([])
  })

  it('flags an embedded FHIR ValueSet expansion as an error', () => {
    const vs = JSON.stringify({
      resourceType: 'ValueSet',
      expansion: { contains: [{ system: 'http://loinc.org', code: '4548-4' }] },
    })
    const findings = scanContent('fhir/vs.json', vs)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/expansion/i)
  })

  it('allows a ValueSet with only a compose, which is a definition not an expansion', () => {
    const vs = JSON.stringify({
      resourceType: 'ValueSet',
      compose: { include: [{ system: 'http://loinc.org' }] },
    })
    expect(scanContent('fhir/vs.json', vs)).toEqual([])
  })

  it('warns on a CPT code system declaration', () => {
    const findings = scanContent('fhir/m.json', '{"system":"http://www.ama-assn.org/go/cpt"}')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toMatch(/CPT/)
  })

  it('warns on an NCQA copyright string', () => {
    const findings = scanContent('doc/spec.md', 'Copyright 2026 NCQA. HEDIS is a registered trademark.')
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('does not flag a plain mention of HEDIS, since discussing it is allowed', () => {
    expect(scanContent('README.md', 'This measure is similar in intent to a HEDIS measure.')).toEqual([])
  })

  it('does not crash on malformed JSON', () => {
    expect(() => scanContent('fhir/bad.json', '{not json')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/scanner.test.ts`
Expected: FAIL, cannot resolve `../src/scanner.js`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Finding } from './report.js'

const CPT_SYSTEM = /ama-assn\.org\/go\/cpt|urn:oid:2\.16\.840\.1\.113883\.6\.12/i

/** Phrases that assert ownership, as opposed to merely naming a program. */
const COPYRIGHT_CLAIMS = [
  /copyright\s+\d{4}\s+ncqa/i,
  /©\s*\d{4}\s*ncqa/i,
  /hedis\s+is\s+a\s+registered\s+trademark/i,
  /ncqa\s+all\s+rights\s+reserved/i,
]

function hasEmbeddedExpansion(content: string): boolean {
  let doc: unknown
  try {
    doc = JSON.parse(content)
  } catch {
    return false
  }
  const stack: unknown[] = [doc]
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      stack.push(...node)
    } else if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      const expansion = obj.expansion as Record<string, unknown> | undefined
      if (obj.resourceType === 'ValueSet' && expansion && Array.isArray(expansion.contains)) {
        return true
      }
      stack.push(...Object.values(obj))
    }
  }
  return false
}

/**
 * Scans one file for content the registry cannot host. Heuristic by design:
 * it will miss things and produce false positives, so errors block a publish
 * and warnings surface for human review.
 */
export function scanContent(path: string, content: string): Finding[] {
  const findings: Finding[] = []

  if (path.endsWith('.json') && hasEmbeddedExpansion(content)) {
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        'file contains an embedded ValueSet expansion. Reference value sets by OID or ' +
        'canonical URL instead, since redistributing expansions requires a UMLS license.',
      path,
    })
  }

  if (CPT_SYSTEM.test(content)) {
    findings.push({
      check: 'content.forbidden',
      severity: 'warning',
      message: 'file references the CPT code system, which is AMA licensed and cannot be redistributed',
      path,
    })
  }

  for (const pattern of COPYRIGHT_CLAIMS) {
    if (pattern.test(content)) {
      findings.push({
        check: 'content.forbidden',
        severity: 'warning',
        message: 'file contains a third party copyright claim and may include licensed content',
        path,
      })
      break
    }
  }

  return findings
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/scanner.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scanner.ts packages/core/test/scanner.test.ts
git commit -m "feat(core): add forbidden content scanner"
```

---

### Task 8: Conformance level computation

Pure logic over a manifest and a report. This is the heart of the package model, so it gets the most test coverage.

**Files:**
- Create: `packages/core/src/level.ts`
- Test: `packages/core/test/level.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { computeLevel } from '../src/level.js'
import type { ValidationReport, CheckId } from '../src/report.js'
import type { Manifest } from '../src/manifest.js'

const L1_CHECKS: CheckId[] = [
  'manifest.schema', 'manifest.license', 'manifest.dataModel',
  'artifacts.present', 'artifacts.typed', 'valuesets.referenced',
  'readme.sections', 'content.forbidden',
]

function manifest(over: Partial<Manifest> = {}): Manifest {
  return {
    id: 'a/b',
    version: '1.0.0',
    license: 'MIT',
    dataModel: 'fhir-r4',
    measure: { title: 'T', steward: 'CMS' },
    artifacts: [{ path: 'm.cql', type: 'cql' }],
    ...over,
  } as Manifest
}

function report(checksRun: CheckId[], findings: ValidationReport['findings'] = []): ValidationReport {
  return { checksRun, findings }
}

describe('computeLevel', () => {
  it('returns 0 when only the level 0 checks pass', () => {
    const r = computeLevel(manifest(), report(['manifest.schema', 'manifest.license', 'artifacts.present']))
    expect(r.level).toBe(0)
  })

  it('returns 1 when every level 1 check ran and passed', () => {
    const r = computeLevel(manifest(), report(L1_CHECKS))
    expect(r.level).toBe(1)
  })

  it('returns 2 when the deep check for the only artifact type passed', () => {
    const r = computeLevel(manifest(), report([...L1_CHECKS, 'cql.translate']))
    expect(r.level).toBe(2)
  })

  it('does not reach level 2 when a required deep check never ran', () => {
    const r = computeLevel(manifest(), report(L1_CHECKS))
    expect(r.level).toBe(1)
    expect(r.blockers.some((b) => b.match(/cql\.translate/))).toBe(true)
  })

  it('does not reach level 2 when a deep check ran and failed', () => {
    const r = computeLevel(
      manifest(),
      report([...L1_CHECKS, 'cql.translate'], [
        { check: 'cql.translate', severity: 'error', message: 'syntax error' },
      ]),
    )
    expect(r.level).toBe(1)
  })

  it('lets a SQL only package reach level 2, so SQL shops are not second class', () => {
    const sqlPkg = manifest({ artifacts: [{ path: 'm.sql', type: 'sql', dialect: 'postgres' }] })
    const r = computeLevel(sqlPkg, report([...L1_CHECKS, 'sql.parse']))
    expect(r.level).toBe(2)
  })

  it('requires every applicable deep check when a package mixes artifact types', () => {
    const mixed = manifest({
      artifacts: [
        { path: 'm.cql', type: 'cql' },
        { path: 'm.sql', type: 'sql', dialect: 'postgres' },
        { path: 'M.json', type: 'fhir/Measure' },
      ],
    })
    expect(computeLevel(mixed, report([...L1_CHECKS, 'cql.translate', 'sql.parse'])).level).toBe(1)
    expect(computeLevel(mixed, report([...L1_CHECKS, 'cql.translate', 'sql.parse', 'fhir.validate'])).level).toBe(2)
  })

  it('drops to 0 when a level 1 check fails, even if deep checks passed', () => {
    const r = computeLevel(
      manifest(),
      report([...L1_CHECKS, 'cql.translate'], [
        { check: 'readme.sections', severity: 'error', message: 'missing intent' },
      ]),
    )
    expect(r.level).toBe(0)
  })

  it('ignores warnings when computing the level', () => {
    const r = computeLevel(
      manifest(),
      report([...L1_CHECKS, 'cql.translate'], [
        { check: 'content.forbidden', severity: 'warning', message: 'mentions CPT' },
      ]),
    )
    expect(r.level).toBe(2)
  })

  it('lists blockers explaining what stands between the package and the next level', () => {
    const r = computeLevel(manifest({ dataModel: undefined }), report(L1_CHECKS))
    expect(r.level).toBe(0)
    expect(r.blockers.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/level.test.ts`
Expected: FAIL, cannot resolve `../src/level.js`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Manifest } from './manifest.js'
import type { CheckId, ConformanceLevel, ValidationReport } from './report.js'
import { hasError, ran } from './report.js'

const LEVEL_0_CHECKS: CheckId[] = ['manifest.schema', 'manifest.license', 'artifacts.present']

const LEVEL_1_CHECKS: CheckId[] = [
  ...LEVEL_0_CHECKS,
  'manifest.dataModel',
  'artifacts.typed',
  'valuesets.referenced',
  'readme.sections',
  'content.forbidden',
]

/** Maps an artifact type to the deep check Level 2 requires for it. */
function deepCheckFor(artifactType: string): CheckId | undefined {
  if (artifactType === 'cql') return 'cql.translate'
  if (artifactType === 'sql') return 'sql.parse'
  if (artifactType.startsWith('fhir/')) return 'fhir.validate'
  return undefined
}

/** Deep checks this specific package needs, derived from the artifacts it declares. */
export function requiredDeepChecks(manifest: Manifest): CheckId[] {
  const required = new Set<CheckId>()
  for (const artifact of manifest.artifacts) {
    const check = deepCheckFor(artifact.type)
    if (check) required.add(check)
  }
  return [...required]
}

export interface LevelResult {
  level: ConformanceLevel
  /** Human readable reasons the package did not reach the next level up. */
  blockers: string[]
}

function evaluate(checks: CheckId[], report: ValidationReport): string[] {
  const blockers: string[] = []
  for (const check of checks) {
    if (!ran(report, check)) blockers.push(`${check} did not run`)
    else if (hasError(report, check)) blockers.push(`${check} reported an error`)
  }
  return blockers
}

/**
 * Computes the conformance level. Levels measure rigor rather than FHIR
 * adoption, so a SQL only package can reach Level 2 by passing sql.parse.
 * Only errors matter; warnings never change the level.
 */
export function computeLevel(manifest: Manifest, report: ValidationReport): LevelResult {
  const level0Blockers = evaluate(LEVEL_0_CHECKS, report)
  if (level0Blockers.length > 0) {
    return { level: 0, blockers: level0Blockers }
  }

  const level1Blockers = evaluate(
    LEVEL_1_CHECKS.filter((c) => !LEVEL_0_CHECKS.includes(c)),
    report,
  )
  if (!manifest.dataModel) level1Blockers.push('manifest does not declare a dataModel')
  if (level1Blockers.length > 0) {
    return { level: 0, blockers: level1Blockers }
  }

  const level2Blockers = evaluate(requiredDeepChecks(manifest), report)
  if (level2Blockers.length > 0) {
    return { level: 1, blockers: level2Blockers }
  }

  return { level: 2, blockers: [] }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/level.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/level.ts packages/core/test/level.test.ts
git commit -m "feat(core): add conformance level computation"
```

---

### Task 9: Validation orchestrator

Reads a package directory and runs every check from Tasks 4 through 8.

**Files:**
- Create: `packages/core/src/validate.ts`
- Test: `packages/core/test/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('drops to level 0 when the README is missing required sections', async () => {
    await write('openquality.yaml', MANIFEST)
    await write('README.md', '# Just a title\n')
    await write('cql/M.cql', 'library M')

    const result = await validatePackage(dir)
    expect(result.level).toBe(0)
    expect(result.report.findings.some((f) => f.check === 'readme.sections')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/validate.test.ts`
Expected: FAIL, cannot resolve `../src/validate.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/validate.ts`:

```typescript
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseManifest, type Manifest } from './manifest.js'
import { checkLicense } from './licenses.js'
import { checkValueSetRefs } from './valuesets.js'
import { checkReadmeSections } from './readme.js'
import { scanContent } from './scanner.js'
import { computeLevel } from './level.js'
import type { CheckId, ConformanceLevel, Finding, ValidationReport } from './report.js'

export interface ValidationResult {
  manifest?: Manifest
  report: ValidationReport
  level: ConformanceLevel
  blockers: string[]
}

async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Validates a package directory. Runs only checks that need no network, so
 * deep checks (cql.translate, fhir.validate, sql.parse) never appear in
 * checksRun here and a locally validated package tops out at Level 1.
 */
export async function validatePackage(dir: string): Promise<ValidationResult> {
  const findings: Finding[] = []
  const checksRun: CheckId[] = ['manifest.schema']

  const manifestSource = await readIfPresent(join(dir, 'openquality.yaml'))
  if (manifestSource === undefined) {
    findings.push({
      check: 'manifest.schema',
      severity: 'error',
      message: 'openquality.yaml not found at the package root',
      path: 'openquality.yaml',
    })
    return { report: { checksRun, findings }, level: 0, blockers: ['manifest.schema reported an error'] }
  }

  const parsed = parseManifest(manifestSource)
  if (!parsed.ok) {
    findings.push(...parsed.findings)
    return { report: { checksRun, findings }, level: 0, blockers: ['manifest.schema reported an error'] }
  }
  const manifest = parsed.manifest

  checksRun.push('manifest.license')
  findings.push(...checkLicense(manifest.license))

  checksRun.push('manifest.dataModel')

  checksRun.push('artifacts.present', 'artifacts.typed')
  if (manifest.artifacts.length === 0) {
    findings.push({
      check: 'artifacts.present',
      severity: 'error',
      message: 'package declares no artifacts',
      path: 'openquality.yaml',
    })
  }
  for (const artifact of manifest.artifacts) {
    if (!(await exists(join(dir, artifact.path)))) {
      findings.push({
        check: 'artifacts.present',
        severity: 'error',
        message: `declared artifact ${artifact.path} does not exist in the package`,
        path: artifact.path,
      })
    }
  }

  checksRun.push('valuesets.referenced')
  findings.push(...checkValueSetRefs(manifest.valueSets))

  checksRun.push('readme.sections')
  findings.push(...checkReadmeSections(await readIfPresent(join(dir, 'README.md'))))

  checksRun.push('content.forbidden')
  for (const artifact of manifest.artifacts) {
    const content = await readIfPresent(join(dir, artifact.path))
    if (content !== undefined) findings.push(...scanContent(artifact.path, content))
  }

  const report: ValidationReport = { checksRun, findings }
  const { level, blockers } = computeLevel(manifest, report)
  return { manifest, report, level, blockers }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/validate.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validate.ts packages/core/test/validate.test.ts
git commit -m "feat(core): add package validation orchestrator"
```

---

### Task 10: Deterministic packing

The registry addresses tarballs by digest, so packing the same directory twice must produce byte-identical output. That means sorted entries, a fixed mtime, and no uid, gid, or username in the archive.

**Files:**
- Create: `packages/core/src/pack.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/pack.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packPackage } from '../src/pack.js'

let dir: string

async function write(rel: string, content: string) {
  const full = join(dir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf8')
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oq-pack-'))
  await write('openquality.yaml', 'id: a/b\nversion: 1.0.0\nlicense: MIT\nartifacts: []\n')
  await write('README.md', '# x\n')
  await write('cql/M.cql', 'library M\n')
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('packPackage', () => {
  it('produces a byte identical tarball on repeated runs', async () => {
    const a = await packPackage(dir)
    const b = await packPackage(dir)
    expect(a.digest).toBe(b.digest)
    expect(a.tarball.equals(b.tarball)).toBe(true)
  })

  it('returns a sha256 digest as 64 lowercase hex characters', async () => {
    const { digest } = await packPackage(dir)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('includes every package file', async () => {
    const { files } = await packPackage(dir)
    expect(files.sort()).toEqual(['README.md', 'cql/M.cql', 'openquality.yaml'])
  })

  it('excludes .git and node_modules', async () => {
    await write('.git/config', 'x')
    await write('node_modules/dep/index.js', 'x')
    const { files } = await packPackage(dir)
    expect(files.some((f) => f.startsWith('.git/'))).toBe(false)
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false)
  })

  it('changes the digest when a file changes', async () => {
    const before = await packPackage(dir)
    await write('cql/M.cql', 'library M version \'2\'\n')
    const after = await packPackage(dir)
    expect(after.digest).not.toBe(before.digest)
  })

  it('rejects a directory with no openquality.yaml', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'oq-empty-'))
    await expect(packPackage(empty)).rejects.toThrow(/openquality\.yaml/)
    await rm(empty, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/core/test/pack.test.ts`
Expected: FAIL, cannot resolve `../src/pack.js`.

- [ ] **Step 3: Write the implementation**

```typescript
import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { create } from 'tar'

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.DS_Store', 'dist'])

export interface PackResult {
  tarball: Buffer
  /** SHA-256 of the tarball, lowercase hex. The registry's content address. */
  digest: string
  /** Package-relative POSIX paths included, sorted. */
  files: string[]
}

async function collect(root: string, dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await collect(root, full, out)
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'))
  }
}

async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/**
 * Packs a package directory into a deterministic tarball. Entries are sorted,
 * mtime is fixed, and ownership metadata is stripped, so the same content
 * always yields the same digest regardless of machine or checkout time.
 */
export async function packPackage(dir: string): Promise<PackResult> {
  try {
    await stat(join(dir, 'openquality.yaml'))
  } catch {
    throw new Error(`cannot pack ${dir}: openquality.yaml not found at the package root`)
  }

  const files: string[] = []
  await collect(dir, dir, files)
  files.sort()

  const stream = create(
    {
      cwd: dir,
      gzip: { level: 9 },
      portable: true,
      noMtime: true,
      preservePaths: false,
    },
    files,
  ) as unknown as NodeJS.ReadableStream

  const tarball = await toBuffer(stream)
  const digest = createHash('sha256').update(tarball).digest('hex')
  return { tarball, digest, files }
}
```

- [ ] **Step 4: Create the package entrypoint**

`packages/core/src/index.ts`:

```typescript
export * from './report.js'
export * from './manifest.js'
export * from './licenses.js'
export * from './valuesets.js'
export * from './readme.js'
export * from './scanner.js'
export * from './level.js'
export * from './validate.js'
export * from './pack.js'
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS, 8 files, 49 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pack.ts packages/core/src/index.ts packages/core/test/pack.test.ts
git commit -m "feat(core): add deterministic package tarball creation"
```

---

### Task 11: The `oq` CLI

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`, `packages/cli/src/commands/validate.ts`, `packages/cli/src/commands/pack.ts`
- Test: `packages/cli/test/validate.test.ts`

- [ ] **Step 1: Create the CLI package**

`packages/cli/package.json`:

```json
{
  "name": "@openquality/cli",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@openquality/core": "workspace:*",
    "commander": "^12.1.0"
  }
}
```

As with core, there is no `bin` field pointing into `dist`, because nothing builds
`dist`. The CLI is exercised in tests by importing and calling its command functions
directly. Wiring a real `oq` executable is a packaging concern for a later plan.

`packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

No `references` entry. Project references belong to `tsc -b` composite builds, which
this repo does not use; the root `tsconfig.json` already type checks core and cli
together in one pass.

Run: `pnpm install`
Expected: links `@openquality/core` into the CLI package.

- [ ] **Step 2: Write the failing test**

The command function returns an exit code and writes through an injected writer, so the test never spawns a process or captures real stdout.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runValidate } from '../src/commands/validate.js'

let dir: string
let lines: string[]
const writer = (line: string) => { lines.push(line) }

async function write(rel: string, content: string) {
  const full = join(dir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf8')
}

const GOOD_MANIFEST = `
id: gene/hba1c
version: 1.0.0
license: Apache-2.0
dataModel: fhir-r4
measure:
  title: T
artifacts:
  - path: cql/M.cql
    type: cql
`
const GOOD_README = '# T\n\n## Intent\nx\n\n## Known Limitations\nx\n\n## Provenance\nx\n'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oq-cli-'))
  lines = []
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('runValidate', () => {
  it('exits 0 and reports the level for a valid package', async () => {
    await write('openquality.yaml', GOOD_MANIFEST)
    await write('README.md', GOOD_README)
    await write('cql/M.cql', 'library M\n')

    const code = await runValidate(dir, writer)
    expect(code).toBe(0)
    expect(lines.join('\n')).toMatch(/Level 1/)
  })

  it('exits 1 and prints each error when validation fails', async () => {
    await write('openquality.yaml', GOOD_MANIFEST)
    await write('README.md', GOOD_README)

    const code = await runValidate(dir, writer)
    expect(code).toBe(1)
    expect(lines.join('\n')).toMatch(/cql\/M\.cql/)
  })

  it('prints blockers explaining what is needed for the next level', async () => {
    await write('openquality.yaml', GOOD_MANIFEST)
    await write('README.md', GOOD_README)
    await write('cql/M.cql', 'library M\n')

    await runValidate(dir, writer)
    expect(lines.join('\n')).toMatch(/cql\.translate/)
  })

  it('exits 1 with a clear message when the directory is not a package', async () => {
    const code = await runValidate(dir, writer)
    expect(code).toBe(1)
    expect(lines.join('\n')).toMatch(/openquality\.yaml/)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/cli/test/validate.test.ts`
Expected: FAIL, cannot resolve `../src/commands/validate.js`.

- [ ] **Step 4: Write the validate command**

`packages/cli/src/commands/validate.ts`:

```typescript
import { validatePackage } from '@openquality/core'

export type Writer = (line: string) => void

const LEVEL_NAMES = ['Shared', 'Described', 'Verified'] as const

/** Validates a package directory. Returns the process exit code. */
export async function runValidate(dir: string, write: Writer): Promise<number> {
  const { report, level, blockers } = await validatePackage(dir)

  const errors = report.findings.filter((f) => f.severity === 'error')
  const warnings = report.findings.filter((f) => f.severity === 'warning')
  const infos = report.findings.filter((f) => f.severity === 'info')

  for (const finding of errors) {
    write(`error  ${finding.path ?? ''} ${finding.message}`)
  }
  for (const finding of warnings) {
    write(`warn   ${finding.path ?? ''} ${finding.message}`)
  }
  // Printed rather than dropped: Severity includes 'info' because the deep
  // validators in the next plan need it (an unreachable VSAC reports the value
  // set as unverified rather than failing the package). A severity the CLI
  // silently swallows is a latent bug, so every finding gets printed.
  for (const finding of infos) {
    write(`info   ${finding.path ?? ''} ${finding.message}`)
  }

  write('')
  write(`Level ${level} (${LEVEL_NAMES[level]})`)

  if (blockers.length > 0) {
    write('')
    write('To reach the next level:')
    for (const blocker of blockers) write(`  - ${blocker}`)
    write('')
    write('Note: cql.translate, fhir.validate, and sql.parse run on publish, not locally.')
  }

  return errors.length > 0 ? 1 : 0
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run packages/cli/test/validate.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the pack command and entrypoint**

`packages/cli/src/commands/pack.ts`:

```typescript
import { writeFile } from 'node:fs/promises'
import { packPackage } from '@openquality/core'
import type { Writer } from './validate.js'

/** Packs a package directory into a tarball. Returns the process exit code. */
export async function runPack(dir: string, outPath: string | undefined, write: Writer): Promise<number> {
  try {
    const { tarball, digest, files } = await packPackage(dir)
    const target = outPath ?? `package-${digest.slice(0, 12)}.tgz`
    await writeFile(target, tarball)
    write(`packed ${files.length} files`)
    write(`sha256 ${digest}`)
    write(`wrote  ${target}`)
    return 0
  } catch (err) {
    write(`error  ${(err as Error).message}`)
    return 1
  }
}
```

`packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander'
import { runValidate } from './commands/validate.js'
import { runPack } from './commands/pack.js'

const write = (line: string) => console.log(line)

const program = new Command()
program.name('oq').description('Open Quality package tools').version('0.1.0')

program
  .command('validate')
  .description('Validate a package directory and report its conformance level')
  .argument('[dir]', 'package directory', '.')
  .action(async (dir: string) => {
    process.exitCode = await runValidate(dir, write)
  })

program
  .command('pack')
  .description('Pack a package directory into a deterministic tarball')
  .argument('[dir]', 'package directory', '.')
  .option('-o, --out <path>', 'output path')
  .action(async (dir: string, opts: { out?: string }) => {
    process.exitCode = await runPack(dir, opts.out, write)
  })

await program.parseAsync()
```

- [ ] **Step 7: Verify the whole suite and the type build**

Run: `pnpm test`
Expected: PASS, 9 files, 53 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add oq validate and oq pack commands"
```

---

### Task 12: Real-content fixture test

Task 8's tests use synthetic input. This task proves the manifest survives contact with a real CMS eCQM, which is the spec's stated reason for importing CMS content before launch.

**Files:**
- Create: `packages/core/test/fixtures/cms122/openquality.yaml`, `.../README.md`, `.../cql/DiabetesHemoglobinA1cPoorControl.cql`
- Test: `packages/core/test/fixture.test.ts`

- [ ] **Step 1: Create the fixture manifest**

`packages/core/test/fixtures/cms122/openquality.yaml`:

```yaml
id: cms/diabetes-hba1c-poor-control
version: 13.0.0
license: CC0-1.0
measurementPeriod: 2026
measure:
  title: "Diabetes: Hemoglobin A1c (HbA1c) Poor Control (> 9%)"
  steward: CMS
  identifiers: [CMS122v13, NQF-0059]
  type: intermediate-outcome
  improvementNotation: decrease
  domain: [diabetes, chronic-care]
  setting: [ambulatory]
dataModel: fhir-r4
artifacts:
  - path: cql/DiabetesHemoglobinA1cPoorControl.cql
    type: cql
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
  - oid: 2.16.840.1.113883.3.464.1003.198.12.1013
    source: vsac
```

- [ ] **Step 2: Create the fixture README and CQL**

`packages/core/test/fixtures/cms122/README.md`:

```markdown
# Diabetes: Hemoglobin A1c Poor Control (> 9%)

## Intent
Percentage of patients 18 to 75 years of age with diabetes who had
hemoglobin A1c greater than 9.0% during the measurement period.

## Known Limitations
Requires HbA1c results coded with LOINC and available as discrete values.
Results captured only in narrative notes are not counted.

## Provenance
Imported from the eCQI Resource Center, unmodified. Open Quality is not a
measure steward and this package is not affiliated with or endorsed by CMS.
```

`packages/core/test/fixtures/cms122/cql/DiabetesHemoglobinA1cPoorControl.cql`:

```
library DiabetesHemoglobinA1cPoorControl version '13.0.000'

using FHIR version '4.0.1'

valueset "Diabetes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
valueset "HbA1c Laboratory Test": 'urn:oid:2.16.840.1.113883.3.464.1003.198.12.1013'

parameter "Measurement Period" Interval<DateTime>

context Patient

define "Initial Population":
  AgeInYearsAt(start of "Measurement Period") between 18 and 75
    and exists "Diabetes Diagnosis"

define "Diabetes Diagnosis":
  [Condition: "Diabetes"] C
    where C.clinicalStatus ~ 'active'

define "Denominator":
  "Initial Population"

define "Numerator":
  exists "Most Recent HbA1c Above Threshold"

define "Most Recent HbA1c Above Threshold":
  Last([Observation: "HbA1c Laboratory Test"] O
    where O.effective during "Measurement Period"
    sort by effective) R
    where R.value as Quantity > 9.0 '%'
```

- [ ] **Step 3: Write the test**

```typescript
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validatePackage, packPackage } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixtures/cms122')

describe('real CMS eCQM content', () => {
  it('validates to level 1 locally with no errors', async () => {
    const result = await validatePackage(fixture)
    expect(result.report.findings.filter((f) => f.severity === 'error')).toEqual([])
    expect(result.level).toBe(1)
  })

  it('parses the full measure identity block', async () => {
    const { manifest } = await validatePackage(fixture)
    expect(manifest?.measure?.identifiers).toContain('CMS122v13')
    expect(manifest?.measure?.steward).toBe('CMS')
    expect(manifest?.valueSets).toHaveLength(2)
  })

  it('names cql.translate as the only blocker to level 2', async () => {
    const { blockers } = await validatePackage(fixture)
    expect(blockers).toEqual(['cql.translate did not run'])
  })

  it('does not flag CQL value set references as embedded content', async () => {
    const { report } = await validatePackage(fixture)
    expect(report.findings.filter((f) => f.check === 'content.forbidden')).toEqual([])
  })

  it('packs deterministically', async () => {
    const a = await packPackage(fixture)
    const b = await packPackage(fixture)
    expect(a.digest).toBe(b.digest)
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/fixture.test.ts`
Expected: PASS, 5 tests.

If the third test fails with an unexpected blocker, the manifest or a check is wrong, not the fixture. Fix the code rather than weakening the fixture, since this test exists to catch exactly that.

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, 10 files, 58 tests, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/test/fixtures packages/core/test/fixture.test.ts
git commit -m "test(core): validate against real CMS122 eCQM content"
```

---

## Definition of Done

- `pnpm test` passes with 58 tests across 10 files.
- `pnpm typecheck` exits 0.
- `oq validate <dir>` reports a conformance level, lists errors and warnings, and names blockers for the next level.
- `oq pack <dir>` writes a tarball whose digest is stable across runs.
- A real CMS eCQM package validates cleanly to Level 1 with `cql.translate` as its only blocker to Level 2.

## What This Plan Deliberately Excludes

- Deep validators (CQL translation, FHIR profile validation, SQL parsing). Plan 2.
- VSAC OID resolution, which needs a UMLS account and the network. Plan 2.
- Publishing, storage, and the registry API. Plan 3.
- The web app and design system. Plan 4.
- Auth and typed feedback. Plan 5.

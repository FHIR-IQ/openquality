# Open Quality Seed Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `measures/` and `knowledge/` with real, validated content imported from a CC0 upstream source, plus the format and tooling changes that real content forces.

**Architecture:** Four phases. Format changes to `@openquality/core` first (provenance field, `qi-core` data model, terminology scanner). Then a new `packages/importer` that reads a pinned upstream commit and emits package directories, with its output committed to git and a CI drift check proving the tree is the importer's output. Then CI. Hand-authored showcase content last. The validator subsystem stays out entirely, so the corpus ships at Level 1.

**Tech Stack:** TypeScript, Node 22, pnpm workspaces, Vitest, Zod, `yaml`. GitHub Actions. A JVM in CI for the cqframework CQL-to-ELM translator.

**Spec:** [`docs/superpowers/specs/2026-08-01-seed-corpus-design.md`](../specs/2026-08-01-seed-corpus-design.md)

---

## Background you need

You are working in a pnpm monorepo. `packages/core` holds validation logic, `packages/cli` wraps it as the `oq` command. Run anything with `pnpm test` (Vitest, currently 91 tests) and `pnpm oq validate <dir>`.

Three conventions in this codebase you must follow:

1. **Schema parsing does not own semantic rules.** `packages/core/src/manifest.ts` deliberately keeps `.refine` rules out of the Zod schema, because a failure there is tagged `manifest.schema` and aborts the run before other checks execute. Semantic rules live in their own module with their own `CheckId`. Read the comment above `ValueSetSchema` in `manifest.ts` before writing Task 1.
2. **Findings, not exceptions.** Validation code returns `Finding[]`. It never throws.
3. **Only errors change the conformance level.** `packages/core/src/level.ts` uses `hasError`. A `warning` never blocks a level.

**Terminology:** an *artifact* is a file a package declares. A *check* is a `CheckId` in `packages/core/src/report.ts`. A *finding* is one problem with a severity.

---

## File structure

**Modified in `packages/core/src`:**

| File | Change |
|---|---|
| `report.ts` | Add `'manifest.provenance'` to `CheckId` |
| `manifest.ts` | Add loose `provenance` object to schema; add `qi-core` to `DATA_MODELS` |
| `provenance.ts` | **New.** Owns provenance semantic rules |
| `terminology.ts` | **New.** Per-code-system display policy and the CQL check |
| `scanner.ts` | Call `checkTerminology` |
| `validate.ts` | Run the `manifest.provenance` check |
| `level.ts` | Add `manifest.provenance` to `LEVEL_1_CHECKS` |
| `index.ts` | Export the two new modules |

**New package `packages/importer/src`:** one file per responsibility, because a single import script would be hard to test and hard to hold in context.

| File | Responsibility |
|---|---|
| `upstream.ts` | Fetch and extract the pinned upstream tarball. The only file that does network IO |
| `cql.ts` | Parse and rewrite CQL text. Pure functions, no IO |
| `measure.ts` | Read a FHIR `Measure` resource into a flat record. Pure |
| `naming.ts` | Slugs, package ids, semver normalization. Pure |
| `emit.ts` | Build manifest and README text for one package. Pure |
| `plan.ts` | Decide what to import and what to skip, and resolve included libraries. Pure |
| `run.ts` | Orchestration and file writing |
| `cli.ts` | Command entry point |

**New elsewhere:** `TERMINOLOGY.md`, `.github/workflows/ci.yml`, `packages/cli/src/commands/validate-all.ts`.

---

# Phase 1: Format changes

No content is involved. Each task is small and independently testable.

## Task 1: Provenance manifest field

**Files:**
- Modify: `packages/core/src/report.ts`
- Modify: `packages/core/src/manifest.ts`
- Create: `packages/core/src/provenance.ts`
- Modify: `packages/core/src/validate.ts`
- Modify: `packages/core/src/level.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/provenance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/provenance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { checkProvenance } from '../src/provenance.js'

describe('checkProvenance', () => {
  const valid = {
    upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
    ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
    retrieved: '2026-08-01',
    relationship: 'unmodified',
  }

  it('reports nothing when the block is absent', () => {
    expect(checkProvenance(undefined)).toEqual([])
  })

  it('accepts a complete unmodified block', () => {
    expect(checkProvenance(valid)).toEqual([])
  })

  it('requires upstream, ref, retrieved and relationship', () => {
    const findings = checkProvenance({})
    expect(findings).toHaveLength(4)
    expect(findings.every((f) => f.check === 'manifest.provenance')).toBe(true)
    expect(findings.every((f) => f.severity === 'error')).toBe(true)
  })

  it('rejects an upstream that is not http or https', () => {
    const findings = checkProvenance({ ...valid, upstream: 'git@github.com:a/b.git' })
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('http')
  })

  it('rejects a retrieved date that is not ISO yyyy-mm-dd', () => {
    const findings = checkProvenance({ ...valid, retrieved: '1 August 2026' })
    expect(findings[0].message).toContain('YYYY-MM-DD')
  })

  it('rejects an unknown relationship', () => {
    const findings = checkProvenance({ ...valid, relationship: 'copied' })
    expect(findings[0].message).toContain('unmodified')
  })

  it('requires modifications when the relationship is derived', () => {
    const findings = checkProvenance({ ...valid, relationship: 'derived' })
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('modifications')
  })

  it('accepts derived when modifications are listed', () => {
    const findings = checkProvenance({
      ...valid,
      relationship: 'derived',
      modifications: ['stripped CPT display descriptors from 3 code declarations'],
    })
    expect(findings).toEqual([])
  })

  it('rejects an empty modifications list on derived', () => {
    const findings = checkProvenance({ ...valid, relationship: 'derived', modifications: [] })
    expect(findings).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/provenance.test.ts`
Expected: FAIL, cannot resolve `../src/provenance.js`.

- [ ] **Step 3: Add the CheckId**

In `packages/core/src/report.ts`, add `'manifest.provenance'` to the `CheckId` union, directly after `'manifest.measure'`:

```ts
export type CheckId =
  | 'manifest.schema'
  | 'manifest.license'
  | 'manifest.dataModel'
  | 'manifest.measure'
  | 'manifest.provenance'
  | 'artifacts.present'
  | 'artifacts.typed'
  | 'valuesets.referenced'
  | 'readme.sections'
  | 'content.forbidden'
  | 'cql.translate'
  | 'fhir.validate'
  | 'sql.parse'
```

- [ ] **Step 4: Write the provenance module**

Create `packages/core/src/provenance.ts`:

```ts
import type { Finding } from './report.js'

export const RELATIONSHIPS = ['unmodified', 'derived'] as const

/**
 * Shape as it survives manifest schema parsing. Every field is optional there
 * on purpose, following the same reasoning as ValueSetSchema in manifest.ts:
 * a rule enforced in the Zod schema is reported as `manifest.schema` and aborts
 * the run, so the author sees one misattributed error instead of every problem
 * in their package.
 */
export interface ProvenanceRef {
  upstream?: string
  ref?: string
  retrieved?: string
  relationship?: string
  modifications?: string[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function error(message: string): Finding {
  return { check: 'manifest.provenance', severity: 'error', message, path: 'openquality.yaml' }
}

/**
 * Validates the provenance block when it is present. Absence is not an error:
 * a community author writing original logic has no upstream to declare, and
 * requiring the block would make them invent one. Seeded packages get it
 * because the importer always emits it and the CI drift check proves the
 * committed tree is the importer's output.
 */
export function checkProvenance(provenance: ProvenanceRef | undefined): Finding[] {
  if (!provenance) return []
  const findings: Finding[] = []

  if (!provenance.upstream) {
    findings.push(error('provenance.upstream is required: the URL the content came from'))
  } else if (!/^https?:\/\//.test(provenance.upstream)) {
    findings.push(error(`provenance.upstream "${provenance.upstream}" must be an http or https URL`))
  }

  if (!provenance.ref) {
    findings.push(
      error('provenance.ref is required: the upstream commit or release the content was taken from'),
    )
  }

  if (!provenance.retrieved) {
    findings.push(error('provenance.retrieved is required: the date the content was taken'))
  } else if (!ISO_DATE.test(provenance.retrieved)) {
    findings.push(error(`provenance.retrieved "${provenance.retrieved}" must be an ISO date, YYYY-MM-DD`))
  }

  if (!provenance.relationship) {
    findings.push(error(`provenance.relationship is required: ${RELATIONSHIPS.join(' or ')}`))
  } else if (!(RELATIONSHIPS as readonly string[]).includes(provenance.relationship)) {
    findings.push(
      error(
        `provenance.relationship "${provenance.relationship}" is not recognised. ` +
          `Use ${RELATIONSHIPS.join(' or ')}.`,
      ),
    )
  }

  // Checked separately from the enum above so that a package claiming a change
  // it never describes cannot pass. "derived" with no modifications list is the
  // claim that says nothing, and it is the one an importer bug would produce.
  if (provenance.relationship === 'derived' && (provenance.modifications?.length ?? 0) === 0) {
    findings.push(
      error('provenance.relationship "derived" requires a non-empty modifications list saying what changed'),
    )
  }

  return findings
}
```

- [ ] **Step 5: Add the loose schema to the manifest**

In `packages/core/src/manifest.ts`, add this above `export const ManifestSchema`:

```ts
// Every field optional, and no `.refine`. The rules live in provenance.ts so
// the finding carries the `manifest.provenance` CheckId. Same reasoning as
// ValueSetSchema above.
const ProvenanceSchema = z.object({
  upstream: z.string().optional(),
  ref: z.string().optional(),
  retrieved: z.string().optional(),
  relationship: z.string().optional(),
  modifications: z.array(z.string()).optional(),
})
```

Then add this field to `ManifestSchema`, after `valueSets`:

```ts
  provenance: ProvenanceSchema.optional(),
```

- [ ] **Step 6: Run the check during validation**

In `packages/core/src/validate.ts`, add the import:

```ts
import { checkProvenance } from './provenance.js'
```

and insert this block immediately after the `manifest.measure` block, before `checksRun.push('artifacts.present', 'artifacts.typed')`:

```ts
  checksRun.push('manifest.provenance')
  findings.push(...checkProvenance(manifest.provenance))
```

- [ ] **Step 7: Add it to the Level 1 gate**

In `packages/core/src/level.ts`, add `'manifest.provenance'` to `LEVEL_1_CHECKS`:

```ts
const LEVEL_1_CHECKS: CheckId[] = [
  ...LEVEL_0_CHECKS,
  'manifest.dataModel',
  'manifest.measure',
  'manifest.provenance',
  'artifacts.typed',
  'valuesets.referenced',
  'readme.sections',
  'content.forbidden',
]
```

- [ ] **Step 8: Export it**

In `packages/core/src/index.ts`, add after the `readme.js` line:

```ts
export * from './provenance.js'
```

- [ ] **Step 9: Run the tests**

Run: `pnpm test`
Expected: PASS, all previous tests plus 9 new ones.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/provenance.ts packages/core/src/report.ts packages/core/src/manifest.ts packages/core/src/validate.ts packages/core/src/level.ts packages/core/src/index.ts packages/core/test/provenance.test.ts
git commit -m "feat(core): add validated provenance manifest field"
```

---

## Task 2: The qi-core data model

Upstream CQL declares `using QICore version '6.0.0'`. The enum in `manifest.ts` has no `qi-core`, but `spec/README.md` documents it as valid. Code and spec disagree today.

**Files:**
- Modify: `packages/core/src/manifest.ts:21`
- Test: `packages/core/test/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/manifest.test.ts`:

```ts
describe('dataModel', () => {
  const base = [
    'id: cms/example',
    'version: 0.5.0',
    'license: CC0-1.0',
    'artifacts:',
    '  - path: cql/Example.cql',
    '    type: cql',
  ].join('\n')

  it('accepts qi-core, which the upstream eCQM content declares', () => {
    const result = parseManifest(`${base}\ndataModel: qi-core\n`)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.dataModel).toBe('qi-core')
  })

  it('still rejects an unknown data model', () => {
    const result = parseManifest(`${base}\ndataModel: nonsense\n`)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/manifest.test.ts -t "accepts qi-core"`
Expected: FAIL, `result.ok` is `false`.

- [ ] **Step 3: Add the value**

In `packages/core/src/manifest.ts`, change the `DATA_MODELS` constant:

```ts
const DATA_MODELS = ['fhir-r4', 'qi-core', 'qdm-5.6', 'omop-5.4', 'sql-on-fhir', 'custom'] as const
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/core/test/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/manifest.ts packages/core/test/manifest.test.ts
git commit -m "feat(core): accept qi-core as a data model"
```

---

## Task 3: Terminology display policy

Today `scanner.ts` flags any CPT reference at `severity: 'warning'`, and `level.ts` only blocks on errors, so a package carrying AMA-licensed descriptors reaches Level 1 while the README says it cannot exist. This task adds a per-code-system rule and makes licensed display text an error.

The rule is per system because the licences differ. LOINC permits redistributing codes and names with attribution. SNOMED CT is free to use in member territories. CPT has no free redistribution path found.

**Files:**
- Create: `packages/core/src/terminology.ts`
- Modify: `packages/core/src/scanner.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/terminology.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/terminology.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { checkTerminology, displayAllowed } from '../src/terminology.js'

const CPT_CQL = [
  `library Example version '1.0.000'`,
  ``,
  `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
  `codesystem "LOINC": 'http://loinc.org'`,
  ``,
  `code "Medical nutrition therapy; group": '97804' from "CPT" display 'Medical nutrition therapy; group'`,
  `code "Glucose management indicator": '97506-0' from "LOINC" display 'Glucose management indicator'`,
  ``,
].join('\n')

describe('displayAllowed', () => {
  it('forbids display text for CPT', () => {
    expect(displayAllowed('http://www.ama-assn.org/go/cpt')).toBe(false)
  })

  it('forbids display text for the CPT OID form', () => {
    expect(displayAllowed('urn:oid:2.16.840.1.113883.6.12')).toBe(false)
  })

  it('does not confuse the CPT OID with its neighbours', () => {
    expect(displayAllowed('urn:oid:2.16.840.1.113883.6.120')).toBe(true)
  })

  it('allows display text for LOINC and SNOMED CT', () => {
    expect(displayAllowed('http://loinc.org')).toBe(true)
    expect(displayAllowed('http://snomed.info/sct')).toBe(true)
  })

  it('allows display text for an unlisted system', () => {
    expect(displayAllowed('http://example.org/local')).toBe(true)
  })
})

describe('checkTerminology', () => {
  it('reports an error for CPT display text and leaves LOINC alone', () => {
    const findings = checkTerminology('cql/Example.cql', CPT_CQL)
    expect(findings).toHaveLength(1)
    expect(findings[0].check).toBe('content.forbidden')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('97804')
    expect(findings[0].path).toBe('cql/Example.cql')
  })

  it('accepts a CPT code that carries no display text', () => {
    const cql = CPT_CQL.replace(` display 'Medical nutrition therapy; group'`, '')
    expect(checkTerminology('cql/Example.cql', cql)).toEqual([])
  })

  it('ignores files that are not CQL', () => {
    expect(checkTerminology('README.md', CPT_CQL)).toEqual([])
  })

  it('ignores a CQL file with no restricted code system', () => {
    const cql = [
      `library Example version '1.0.000'`,
      `codesystem "LOINC": 'http://loinc.org'`,
      `code "A": '1-1' from "LOINC" display 'A'`,
    ].join('\n')
    expect(checkTerminology('cql/Example.cql', cql)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/terminology.test.ts`
Expected: FAIL, cannot resolve `../src/terminology.js`.

- [ ] **Step 3: Write the terminology module**

Create `packages/core/src/terminology.ts`:

```ts
import type { Finding } from './report.js'

export interface CodeSystemPolicy {
  /** Human readable name, used in messages. */
  name: string
  /** Matches the code system URL as written in a CQL codesystem declaration. */
  match: RegExp
  /** Whether display text for this system can be redistributed. */
  displayAllowed: boolean
}

/**
 * Per code system, because the licences differ and one blanket rule is either
 * too strict or too loose. Only systems that restrict something need an entry:
 * an unlisted system defaults to allowed, since this is a licensing filter and
 * not an allowlist of terminologies a package may use.
 */
export const CODE_SYSTEM_POLICY: CodeSystemPolicy[] = [
  {
    name: 'CPT',
    // The negative lookahead matters: without it the CPT arc also matches
    // urn:oid:2.16.840.1.113883.6.120, a different code system entirely.
    match: /ama-assn\.org\/go\/cpt|urn:oid:2\.16\.840\.1\.113883\.6\.12(?!\d)/i,
    displayAllowed: false,
  },
]

export function policyFor(url: string): CodeSystemPolicy | undefined {
  return CODE_SYSTEM_POLICY.find((p) => p.match.test(url))
}

export function displayAllowed(url: string): boolean {
  return policyFor(url)?.displayAllowed ?? true
}

const CODESYSTEM_DECL = /^\s*codesystem\s+"([^"]+)"\s*:\s*'([^']+)'/gm

/**
 * A CQL code declaration that carries display text:
 *   code "Name": '97804' from "CPT" display 'text'
 * Group 1 is the code, group 2 the code system alias.
 */
const CODE_WITH_DISPLAY =
  /^\s*code\s+"(?:[^"\\]|\\.)*"\s*:\s*'((?:[^'\\]|\\.)*)'\s+from\s+"([^"]+)"\s+display\s+'(?:[^'\\]|\\.)*'/gm

/** Code system aliases declared in this CQL file, mapped to their URLs. */
export function codeSystemAliases(cql: string): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const match of cql.matchAll(CODESYSTEM_DECL)) aliases.set(match[1], match[2])
  return aliases
}

/**
 * Reports code declarations that carry display text from a code system whose
 * licence does not permit redistributing it. Only the display string is the
 * problem: a code plus a system URL is a reference, which is the same rule
 * Open Quality already applies to value sets, and the same convention FHIR
 * itself follows by publishing large terminologies with content=not-present.
 */
export function checkTerminology(path: string, content: string): Finding[] {
  if (!path.endsWith('.cql')) return []

  const restricted = new Map<string, CodeSystemPolicy>()
  for (const [alias, url] of codeSystemAliases(content)) {
    const policy = policyFor(url)
    if (policy && !policy.displayAllowed) restricted.set(alias, policy)
  }
  if (restricted.size === 0) return []

  const findings: Finding[] = []
  for (const match of content.matchAll(CODE_WITH_DISPLAY)) {
    const [, code, alias] = match
    const policy = restricted.get(alias)
    if (!policy) continue
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        `code '${code}' from "${alias}" carries display text. ${policy.name} descriptors are ` +
        `licensed and cannot be redistributed. Keep the code and the code system, remove the ` +
        `display string.`,
      path,
    })
  }
  return findings
}
```

- [ ] **Step 4: Call it from the scanner**

In `packages/core/src/scanner.ts`, add the import at the top:

```ts
import { checkTerminology } from './terminology.js'
```

and add this line inside `scanContent`, immediately before `return findings`:

```ts
  findings.push(...checkTerminology(path, content))
```

- [ ] **Step 5: Export it**

In `packages/core/src/index.ts`, add after the `scanner.js` line:

```ts
export * from './terminology.js'
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test`
Expected: PASS. If `packages/core/test/scanner.test.ts` fails, read the failure before changing anything: the existing CPT warning is intentionally kept, because it flags any CPT reference while the new check flags only display text. Both should fire on a file with CPT display text.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/terminology.ts packages/core/src/scanner.ts packages/core/src/index.ts packages/core/test/terminology.test.ts
git commit -m "feat(core): make licensed code display text a Level 1 error"
```

---

## Task 4: Terminology policy document and doc corrections

The README currently says "No CPT codes", which is stricter than what the code enforces and stricter than the policy the spec settled on. Documentation that overstates the rule is as much a defect as code that understates it.

**Files:**
- Create: `TERMINOLOGY.md`
- Modify: `README.md`
- Modify: `spec/README.md`
- Modify: `measures/README.md`

- [ ] **Step 1: Write TERMINOLOGY.md**

Create `TERMINOLOGY.md`:

```markdown
# Terminology policy

Open Quality references terminology. It does not redistribute it.

This is the same rule the project already applies to value sets, one level down.
A package references value sets by OID or canonical URL and never embeds an
expansion. A package likewise references codes by code and code system, and
carries display text only where the code system's licence permits it.

FHIR itself works this way. The canonical FHIR CodeSystem for LOINC, published
at [loinc/loinc-fhir-codesystem](https://github.com/loinc/loinc-fhir-codesystem),
is 34 KB with `content="not-present"` and zero concepts. The declaration is
published; the content is left to a terminology server.

## Per code system

| Code system | Codes | Display text | Basis |
|-------------|-------|--------------|-------|
| LOINC | yes | yes | Royalty-free licence, attribution required, no modification |
| SNOMED CT | yes | yes | Free to use in the US and other member territories under the affiliate licence |
| ICD-10-CM, HCPCS, CVX | yes | yes | US government content |
| HL7 and THO code systems | yes | yes | Published by HL7 |
| CPT | code and code system only | **no** | AMA licensed. No free redistribution path. The descriptors are the licensed expression |

Systems not listed here default to permitted. This table is a licensing filter,
not an allowlist of terminologies a measure may use.

The rule for CPT is enforced: `content.forbidden` reports an error for a CQL
code declaration that carries display text from a restricted system, which
blocks Level 1. See `packages/core/src/terminology.ts`.

## Attribution

This repository contains LOINC codes and names. LOINC is copyright
Regenstrief Institute, Inc. and the LOINC Committee, and is available at no
cost under the licence at <https://loinc.org/license/>. LOINC codes and names
are used without modification.

This repository contains SNOMED CT codes and display terms. SNOMED CT is
copyright the International Health Terminology Standards Development
Organisation. Use in the United States is covered by the National Library of
Medicine's UMLS licence, which is free to obtain. A consumer of this repository
outside a SNOMED International member territory needs their own affiliate
licence.

## What this does not cover

The scanner is a heuristic first filter. It will miss things and it will
produce false positives. It is backed by the takedown process in
[GOVERNANCE](GOVERNANCE.md), not presented as a guarantee.
```

- [ ] **Step 2: Correct the README content policy**

In `README.md`, find this paragraph under `## Content policy`:

```
Open licenses only. No HEDIS logic. No CPT codes. No redistributed VSAC expansions.
```

Replace it with:

```
Open licenses only. No HEDIS logic. No redistributed VSAC expansions. No CPT
display descriptors, which are AMA licensed; a CPT code and code system may be
referenced. Full rules per code system are in [TERMINOLOGY](TERMINOLOGY.md).
```

- [ ] **Step 3: Add the field to the spec**

In `spec/README.md`, in the manifest example, add these lines after the `valueSets` block:

```yaml
provenance:                                # required for redistributed content
  upstream: https://github.com/cqframework/ecqm-content-qicore-2025
  ref: d4e0edd01b7da2a3b43d5360156b43761438190a
  retrieved: 2026-08-01
  relationship: unmodified                 # unmodified | derived
```

In the same file, add this row to the CRMI field mapping table, after the `valueSets` row:

```
| `provenance` | `RelatedArtifact` of type `derived-from`, plus `Provenance` on the bundle |
```

- [ ] **Step 4: Correct the collection description**

In `measures/README.md`, the `cms-fhir-2026` row currently says "Community reimplementations of published CMS eCQMs". That contradicts the package README in the same collection, which says the content was imported unmodified. Replace the row with:

```
| [`cms-fhir-2026/`](cms-fhir-2026/) | CMS eCQMs for the 2026 reporting year, redistributed from the CC0 cqframework QI-Core content with provenance on each package. Seed content. | Draft |
```

- [ ] **Step 5: Verify nothing broke**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add TERMINOLOGY.md README.md spec/README.md measures/README.md
git commit -m "docs: add terminology policy and correct the content policy wording"
```

---

# Phase 2: The importer

## Task 5: Importer package scaffold and upstream fetch

**Files:**
- Create: `packages/importer/package.json`
- Create: `packages/importer/tsconfig.json`
- Create: `packages/importer/src/upstream.ts`
- Modify: `package.json`

`upstream.ts` is the only file in this package that touches the network. Everything else is a pure function over strings, which is what makes the rest of this phase testable without a fixture repository.

- [ ] **Step 1: Create the package manifest**

Create `packages/importer/package.json`:

```json
{
  "name": "@openquality/importer",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@openquality/core": "workspace:*",
    "yaml": "^2.6.0",
    "tar": "^7.4.0"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

Create `packages/importer/tsconfig.json`, copying the shape of `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Open `packages/cli/tsconfig.json` first and match it exactly if it differs.

- [ ] **Step 3: Add the run script**

In the root `package.json`, add to `scripts`:

```json
    "oq-import": "tsx packages/importer/src/cli.ts"
```

- [ ] **Step 4: Write the upstream module**

Create `packages/importer/src/upstream.ts`:

```ts
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { x as extract } from 'tar'

/** The upstream content this corpus is seeded from. Pinned, never floating. */
export const UPSTREAM = {
  repo: 'cqframework/ecqm-content-qicore-2025',
  url: 'https://github.com/cqframework/ecqm-content-qicore-2025',
  ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
  license: 'CC0-1.0',
} as const

const CACHE_DIR = '.cache/upstream'

function tarballUrl(ref: string): string {
  return `https://codeload.github.com/${UPSTREAM.repo}/tar.gz/${ref}`
}

/**
 * Downloads and extracts the pinned upstream tree, once, into .cache. Cached
 * because the archive is about 450 MB and the importer is re-run on every CI
 * drift check. Returns the extracted root.
 */
export async function fetchUpstream(ref: string = UPSTREAM.ref): Promise<string> {
  const root = join(CACHE_DIR, ref)
  if (await exists(join(root, 'input'))) return root

  await mkdir(CACHE_DIR, { recursive: true })
  const tarballPath = join(CACHE_DIR, `${ref}.tar.gz`)

  if (!(await exists(tarballPath))) {
    const response = await fetch(tarballUrl(ref))
    if (!response.ok || !response.body) {
      throw new Error(`cannot download ${tarballUrl(ref)}: HTTP ${response.status}`)
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tarballPath))
  }

  await mkdir(root, { recursive: true })
  // strip: 1 removes the `<repo>-<sha>/` prefix GitHub adds.
  await extract({ file: tarballPath, cwd: root, strip: 1 })
  return root
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Absolute paths of every .cql file in the upstream tree, sorted. */
export async function listCqlFiles(root: string): Promise<string[]> {
  const dir = join(root, 'input', 'cql')
  const names = (await readdir(dir)).filter((n) => n.endsWith('.cql')).sort()
  return names.map((n) => join(dir, n))
}

/** Absolute paths of every Measure resource in the upstream tree, sorted. */
export async function listMeasureFiles(root: string): Promise<string[]> {
  const dir = join(root, 'input', 'resources', 'measure')
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()
  return names.map((n) => join(dir, n))
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8')
}
```

- [ ] **Step 5: Ignore the cache**

Add to `.gitignore`:

```
.cache/
```

- [ ] **Step 6: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: the new workspace package is linked, no errors.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/importer/package.json packages/importer/tsconfig.json packages/importer/src/upstream.ts package.json .gitignore pnpm-lock.yaml
git commit -m "feat(importer): scaffold the package and pin the upstream source"
```

---

## Task 6: Parse CQL headers

Pure functions over CQL text. No IO, so every case is testable from a string literal.

**Files:**
- Create: `packages/importer/src/cql.ts`
- Test: `packages/importer/test/cql.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/importer/test/cql.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseHeader, parseIncludes, parseValueSets } from '../src/cql.js'

// Trimmed from the real upstream CMS122 library.
const CMS122 = [
  `library CMS122FHIRDiabetesAssessGreaterThan9Percent version '0.5.000'`,
  ``,
  `using QICore version '6.0.0'`,
  ``,
  `include FHIRHelpers version '4.4.000' called FHIRHelpers`,
  `include QICoreCommon version '4.0.000' called QICoreCommon`,
  `include AdvancedIllnessandFrailty version '1.27.000' called AIFrailLTCF`,
  ``,
  `codesystem "LOINC": 'http://loinc.org'`,
  ``,
  `valueset "Diabetes": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'`,
  `valueset "HbA1c Laboratory Test": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013'`,
  ``,
].join('\n')

describe('parseHeader', () => {
  it('reads the library name, version and data model', () => {
    expect(parseHeader(CMS122)).toEqual({
      name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
      version: '0.5.000',
      model: 'QICore',
      modelVersion: '6.0.0',
    })
  })

  it('reads a plain FHIR data model', () => {
    const cql = [`library Example version '1.0.000'`, `using FHIR version '4.0.1'`].join('\n')
    expect(parseHeader(cql)?.model).toBe('FHIR')
  })

  it('returns undefined when there is no library declaration', () => {
    expect(parseHeader('define "X": true')).toBeUndefined()
  })
})

describe('parseIncludes', () => {
  it('reads every include with its version and alias', () => {
    expect(parseIncludes(CMS122)).toEqual([
      { library: 'FHIRHelpers', version: '4.4.000', alias: 'FHIRHelpers' },
      { library: 'QICoreCommon', version: '4.0.000', alias: 'QICoreCommon' },
      { library: 'AdvancedIllnessandFrailty', version: '1.27.000', alias: 'AIFrailLTCF' },
    ])
  })

  it('reads an include with no alias', () => {
    const cql = `include Hospice version '6.18.000'`
    expect(parseIncludes(cql)).toEqual([{ library: 'Hospice', version: '6.18.000', alias: undefined }])
  })

  it('returns an empty list when there are none', () => {
    expect(parseIncludes('define "X": true')).toEqual([])
  })
})

describe('parseValueSets', () => {
  it('reads canonical URLs and derives the OID', () => {
    expect(parseValueSets(CMS122)).toEqual([
      {
        name: 'Diabetes',
        url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001',
        oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
      },
      {
        name: 'HbA1c Laboratory Test',
        url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013',
        oid: '2.16.840.1.113883.3.464.1003.198.12.1013',
      },
    ])
  })

  it('derives the OID from a urn:oid reference', () => {
    const cql = `valueset "Diabetes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'`
    expect(parseValueSets(cql)[0]).toEqual({
      name: 'Diabetes',
      url: undefined,
      oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
    })
  })

  it('leaves the OID undefined when the URL does not end in one', () => {
    const cql = `valueset "Local": 'http://example.org/ValueSet/local-thing'`
    expect(parseValueSets(cql)[0]).toEqual({
      name: 'Local',
      url: 'http://example.org/ValueSet/local-thing',
      oid: undefined,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/cql.test.ts`
Expected: FAIL, cannot resolve `../src/cql.js`.

- [ ] **Step 3: Write the parser**

Create `packages/importer/src/cql.ts`:

```ts
export interface CqlHeader {
  name: string
  version: string
  model?: string
  modelVersion?: string
}

export interface CqlInclude {
  library: string
  version: string
  alias?: string
}

export interface CqlValueSet {
  name: string
  url?: string
  oid?: string
}

const LIBRARY = /^library\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'/m
const USING = /^using\s+([A-Za-z0-9_]+)(?:\s+version\s+'([^']+)')?/m
const INCLUDE = /^include\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'(?:\s+called\s+([A-Za-z0-9_]+))?/gm
const VALUESET = /^valueset\s+"([^"]+)"\s*:\s*'([^']+)'/gm

/** Dotted decimal OID, matching the rule in @openquality/core valuesets.ts. */
const OID = /^\d+(\.\d+)+$/
const URN_OID = 'urn:oid:'

export function parseHeader(cql: string): CqlHeader | undefined {
  const library = cql.match(LIBRARY)
  if (!library) return undefined
  const using = cql.match(USING)
  return {
    name: library[1],
    version: library[2],
    model: using?.[1],
    modelVersion: using?.[2],
  }
}

export function parseIncludes(cql: string): CqlInclude[] {
  return [...cql.matchAll(INCLUDE)].map((m) => ({
    library: m[1],
    version: m[2],
    alias: m[3],
  }))
}

/**
 * Derives the OID from a value set reference. Upstream writes canonical URLs
 * ending in the OID; hand-written CQL in this repository writes urn:oid.
 * Both forms appear, so both are handled here rather than at the call site.
 */
export function oidFrom(reference: string): string | undefined {
  if (reference.startsWith(URN_OID)) {
    const candidate = reference.slice(URN_OID.length)
    return OID.test(candidate) ? candidate : undefined
  }
  const last = reference.split('/').pop() ?? ''
  return OID.test(last) ? last : undefined
}

export function parseValueSets(cql: string): CqlValueSet[] {
  return [...cql.matchAll(VALUESET)].map((m) => {
    const reference = m[2]
    return {
      name: m[1],
      // A urn:oid reference is not a URL, and the manifest's valuesets.referenced
      // check rejects a url that is not http or https.
      url: reference.startsWith(URN_OID) ? undefined : reference,
      oid: oidFrom(reference),
    }
  })
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/importer/test/cql.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/importer/src/cql.ts packages/importer/test/cql.test.ts
git commit -m "feat(importer): parse CQL headers, includes and value sets"
```

---

## Task 7: Strip restricted display text from CQL

The rewrite that makes CPT-carrying measures publishable. Removing the `display` clause is metadata only, so the CQL still translates. Removing the `code` declaration itself would break the logic and is not done.

**Files:**
- Modify: `packages/importer/src/cql.ts`
- Test: `packages/importer/test/cql-strip.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/importer/test/cql-strip.test.ts`:

```ts
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
    const { removed } = stripRestrictedDisplays(CQL)
    expect(removed).toEqual(['CPT 97804', 'CPT 99211'])
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/cql-strip.test.ts`
Expected: FAIL, `stripRestrictedDisplays` is not exported.

- [ ] **Step 3: Implement the strip**

First add this import at the **top** of `packages/importer/src/cql.ts`, above the existing interface declarations:

```ts
import { codeSystemAliases, policyFor } from '@openquality/core'
```

Then append the rest to the bottom of the same file:

```ts
export interface StripResult {
  cql: string
  /** One entry per removed display, as "<system name> <code>". */
  removed: string[]
}

/**
 * A code declaration carrying display text. Group 1 is everything up to and
 * including the code system alias, so a replacement can keep it and drop only
 * the display clause. Group 2 is the code, group 3 the alias.
 */
const CODE_WITH_DISPLAY =
  /^(\s*code\s+"(?:[^"\\]|\\.)*"\s*:\s*'((?:[^'\\]|\\.)*)'\s+from\s+"([^"]+)")\s+display\s+'(?:[^'\\]|\\.)*'/gm

/**
 * Removes display text for code systems whose licence does not permit
 * redistributing it, keeping the code and the code system. Metadata only, so
 * the CQL still translates to ELM. Removing the code declaration outright
 * would break every definition that references it.
 */
export function stripRestrictedDisplays(cql: string): StripResult {
  const restricted = new Map<string, string>()
  for (const [alias, url] of codeSystemAliases(cql)) {
    const policy = policyFor(url)
    if (policy && !policy.displayAllowed) restricted.set(alias, policy.name)
  }
  if (restricted.size === 0) return { cql, removed: [] }

  const removed: string[] = []
  const rewritten = cql.replace(CODE_WITH_DISPLAY, (match, head: string, code: string, alias: string) => {
    const system = restricted.get(alias)
    if (!system) return match
    removed.push(`${system} ${code}`)
    return head
  })

  return { cql: rewritten, removed }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/importer/test/cql-strip.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/importer/src/cql.ts packages/importer/test/cql-strip.test.ts
git commit -m "feat(importer): strip licensed code display text from imported CQL"
```

---

## Task 8: Read the upstream Measure resource

**Files:**
- Create: `packages/importer/src/measure.ts`
- Test: `packages/importer/test/measure.test.ts`

Field shapes below were read from the real `CMS122FHIRDiabetesAssessGreaterThan9Percent.json`. Note what is **not** there: no CMS measure version such as `v13`, and the publisher is NCQA, not CMS.

- [ ] **Step 1: Write the failing test**

Create `packages/importer/test/measure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readMeasure } from '../src/measure.js'

// Trimmed from the real upstream resource. Field shapes are verbatim.
const RESOURCE = {
  resourceType: 'Measure',
  id: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  url: 'https://madie.cms.gov/Measure/CMS122FHIRDiabetesAssessGreaterThan9Percent',
  version: '0.5.000',
  name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  title: 'Diabetes: Glycemic Status Assessment Greater Than 9%FHIR',
  status: 'active',
  experimental: false,
  publisher: 'National Committee for Quality Assurance',
  description:
    'Percentage of patients 18-75 years of age with diabetes who had a glycemic status assessment > 9.',
  effectivePeriod: { start: '2026-01-01', end: '2026-12-31' },
  library: ['https://madie.cms.gov/Library/CMS122FHIRDiabetesAssessGreaterThan9Percent'],
  identifier: [
    {
      type: { coding: [{ code: 'short-name' }] },
      system: 'https://madie.cms.gov/measure/shortName',
      value: 'CMS122FHIR',
    },
    {
      type: { coding: [{ code: 'publisher' }] },
      system: 'https://madie.cms.gov/measure/cmsId',
      value: '122FHIR',
    },
  ],
}

describe('readMeasure', () => {
  it('reads identity, title and description', () => {
    const m = readMeasure(JSON.stringify(RESOURCE))
    expect(m?.name).toBe('CMS122FHIRDiabetesAssessGreaterThan9Percent')
    expect(m?.version).toBe('0.5.000')
    expect(m?.description).toContain('Percentage of patients 18-75')
  })

  it('strips the FHIR suffix the upstream titles carry', () => {
    const m = readMeasure(JSON.stringify(RESOURCE))
    expect(m?.title).toBe('Diabetes: Glycemic Status Assessment Greater Than 9%')
  })

  it('reads the steward from publisher, which is NCQA not CMS', () => {
    const m = readMeasure(JSON.stringify(RESOURCE))
    expect(m?.steward).toBe('National Committee for Quality Assurance')
  })

  it('builds identifiers from the cmsId and short name', () => {
    const m = readMeasure(JSON.stringify(RESOURCE))
    expect(m?.identifiers).toEqual(['CMS122FHIR'])
  })

  it('reads the measurement period year from effectivePeriod', () => {
    expect(readMeasure(JSON.stringify(RESOURCE))?.measurementPeriod).toBe(2026)
  })

  it('reads the library name', () => {
    expect(readMeasure(JSON.stringify(RESOURCE))?.library).toBe(
      'CMS122FHIRDiabetesAssessGreaterThan9Percent',
    )
  })

  it('returns undefined for a resource that is not a Measure', () => {
    expect(readMeasure(JSON.stringify({ resourceType: 'Library' }))).toBeUndefined()
  })

  it('returns undefined for text that is not JSON', () => {
    expect(readMeasure('not json')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/measure.test.ts`
Expected: FAIL, cannot resolve `../src/measure.js`.

- [ ] **Step 3: Write the reader**

Create `packages/importer/src/measure.ts`:

```ts
export interface UpstreamMeasure {
  name: string
  version?: string
  title?: string
  description?: string
  /** Measure.publisher. On this source it is the steward, and it is not CMS. */
  steward?: string
  identifiers: string[]
  measurementPeriod?: number
  /** The primary CQL library name, taken from the Measure.library canonical. */
  library?: string
  status?: string
}

interface Coding { code?: string }
interface Identifier {
  type?: { coding?: Coding[] }
  system?: string
  value?: string
}
interface MeasureResource {
  resourceType?: string
  name?: string
  version?: string
  title?: string
  description?: string
  publisher?: string
  status?: string
  identifier?: Identifier[]
  effectivePeriod?: { start?: string }
  library?: string[]
}

const CMS_ID_SYSTEM = 'https://madie.cms.gov/measure/cmsId'
const SHORT_NAME_SYSTEM = 'https://madie.cms.gov/measure/shortName'

/**
 * Upstream titles carry a trailing "FHIR" that is a naming artifact of the
 * QDM-to-FHIR translation, not part of the measure name.
 */
function cleanTitle(title: string | undefined): string | undefined {
  return title?.replace(/FHIR$/, '').trim()
}

/**
 * Identifiers, preferring the short name. The cmsId on this source is a bare
 * "122FHIR", which is not a usable identifier on its own; the short name
 * "CMS122FHIR" is the same value with the prefix, so it is what gets published.
 */
function identifiersFrom(identifier: Identifier[] | undefined): string[] {
  const shortName = identifier?.find((i) => i.system === SHORT_NAME_SYSTEM)?.value
  if (shortName) return [shortName]
  const cmsId = identifier?.find((i) => i.system === CMS_ID_SYSTEM)?.value
  return cmsId ? [`CMS${cmsId}`] : []
}

/** Parses a FHIR Measure resource. Returns undefined rather than throwing. */
export function readMeasure(json: string): UpstreamMeasure | undefined {
  let resource: MeasureResource
  try {
    resource = JSON.parse(json) as MeasureResource
  } catch {
    return undefined
  }
  if (resource.resourceType !== 'Measure' || !resource.name) return undefined

  const year = resource.effectivePeriod?.start?.slice(0, 4)

  return {
    name: resource.name,
    version: resource.version,
    title: cleanTitle(resource.title),
    description: resource.description,
    steward: resource.publisher,
    identifiers: identifiersFrom(resource.identifier),
    measurementPeriod: year && /^\d{4}$/.test(year) ? Number(year) : undefined,
    library: resource.library?.[0]?.split('/').pop(),
    status: resource.status,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/importer/test/measure.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/importer/src/measure.ts packages/importer/test/measure.test.ts
git commit -m "feat(importer): read upstream FHIR Measure resources"
```

---

## Task 9: Naming and version normalization

**Files:**
- Create: `packages/importer/src/naming.ts`
- Test: `packages/importer/test/naming.test.ts`

The package version is the upstream `Measure.version` normalized to semver. Upstream writes `0.5.000`, which normalizes to `0.5.0`. Do not invent a CMS measure number: the upstream resource does not carry one, and asserting `13.0.0` would claim a correspondence to the published QDM measure that this FHIR translation has not earned.

- [ ] **Step 1: Write the failing test**

Create `packages/importer/test/naming.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeVersion, packageId, slugFor } from '../src/naming.js'

describe('normalizeVersion', () => {
  it('normalizes the upstream zero-padded form', () => {
    expect(normalizeVersion('0.5.000')).toBe('0.5.0')
    expect(normalizeVersion('1.27.000')).toBe('1.27.0')
    expect(normalizeVersion('4.4.000')).toBe('4.4.0')
  })

  it('leaves an already canonical version alone', () => {
    expect(normalizeVersion('1.2.3')).toBe('1.2.3')
  })

  it('pads a two-part version', () => {
    expect(normalizeVersion('2.1')).toBe('2.1.0')
  })

  it('returns undefined for something it cannot parse', () => {
    expect(normalizeVersion('draft')).toBeUndefined()
    expect(normalizeVersion(undefined)).toBeUndefined()
  })
})

describe('slugFor', () => {
  it('builds a slug from the measure title', () => {
    expect(slugFor('Diabetes: Glycemic Status Assessment Greater Than 9%')).toBe(
      'diabetes-glycemic-status-assessment-greater-than-9',
    )
  })

  it('collapses runs of punctuation and whitespace', () => {
    expect(slugFor('Breast   Cancer -- Screening')).toBe('breast-cancer-screening')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugFor('%Statin Therapy%')).toBe('statin-therapy')
  })
})

describe('packageId', () => {
  it('joins namespace and slug', () => {
    expect(packageId('cms', 'breast-cancer-screening')).toBe('cms/breast-cancer-screening')
  })

  it('matches the manifest id pattern', () => {
    expect(packageId('cqframework', 'fhir-helpers')).toMatch(
      /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/naming.test.ts`
Expected: FAIL, cannot resolve `../src/naming.js`.

- [ ] **Step 3: Write the module**

Create `packages/importer/src/naming.ts`:

```ts
/**
 * Normalizes an upstream version to canonical semver. Upstream writes
 * zero-padded parts, "0.5.000", which the manifest's semver regex accepts but
 * which is not canonical and sorts badly. Returns undefined when the input is
 * not a dotted numeric version, which is a skip condition for the importer.
 */
export function normalizeVersion(version: string | undefined): string | undefined {
  if (!version) return undefined
  const parts = version.trim().split('.')
  if (parts.length < 2 || parts.length > 3) return undefined
  if (!parts.every((p) => /^\d+$/.test(p))) return undefined
  const [major, minor, patch = '0'] = parts
  return `${Number(major)}.${Number(minor)}.${Number(patch)}`
}

/**
 * A package name slug. Must satisfy the manifest id pattern, which allows
 * lowercase alphanumerics and hyphens and must start with an alphanumeric.
 */
export function slugFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function packageId(namespace: string, slug: string): string {
  return `${namespace}/${slug}`
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/importer/test/naming.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/importer/src/naming.ts packages/importer/test/naming.test.ts
git commit -m "feat(importer): add slug and semver normalization"
```

---

## Task 10: Emit the manifest and README

**Files:**
- Create: `packages/importer/src/emit.ts`
- Test: `packages/importer/test/emit.test.ts`

The "Known limitations" section is deliberately empty with a standing invitation. It is the one Level 1 section that cannot be generated honestly, because it is exactly the human knowledge the corpus exists to capture. An empty section that says so is honest; a fabricated one is not.

- [ ] **Step 1: Write the failing test**

Create `packages/importer/test/emit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { checkReadmeSections, parseManifest } from '@openquality/core'
import { emitManifest, emitReadme, type PackagePlan } from '../src/emit.js'

const PLAN: PackagePlan = {
  id: 'cms/diabetes-glycemic-status-assessment-greater-than-9',
  version: '0.5.0',
  slug: 'diabetes-glycemic-status-assessment-greater-than-9',
  title: 'Diabetes: Glycemic Status Assessment Greater Than 9%',
  description: 'Percentage of patients 18-75 years of age with diabetes.',
  steward: 'National Committee for Quality Assurance',
  identifiers: ['CMS122FHIR'],
  measurementPeriod: 2026,
  dataModel: 'qi-core',
  cqlFileName: 'CMS122FHIRDiabetesAssessGreaterThan9Percent.cql',
  valueSets: [
    {
      name: 'Diabetes',
      url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001',
      oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
    },
  ],
  libraryFileNames: ['FHIRHelpers.cql', 'QICoreCommon.cql'],
  provenance: {
    upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
    ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
    retrieved: '2026-08-01',
    relationship: 'unmodified',
  },
}

describe('emitManifest', () => {
  it('produces a manifest the core parser accepts', () => {
    const result = parseManifest(emitManifest(PLAN))
    expect(result.ok).toBe(true)
  })

  it('carries identity, licence and data model', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.id).toBe('cms/diabetes-glycemic-status-assessment-greater-than-9')
    expect(manifest.version).toBe('0.5.0')
    expect(manifest.license).toBe('CC0-1.0')
    expect(manifest.dataModel).toBe('qi-core')
    expect(manifest.measurementPeriod).toBe(2026)
  })

  it('records the steward as given, not as CMS', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.measure.steward).toBe('National Committee for Quality Assurance')
  })

  it('declares the measure CQL and every vendored library as artifacts', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.artifacts).toEqual([
      { path: 'cql/CMS122FHIRDiabetesAssessGreaterThan9Percent.cql', type: 'cql' },
      { path: 'cql/FHIRHelpers.cql', type: 'cql' },
      { path: 'cql/QICoreCommon.cql', type: 'cql' },
    ])
  })

  it('emits no dependencies, because libraries are vendored not referenced', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.dependencies).toBeUndefined()
  })

  it('references value sets by oid and url, never embedding them', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.valueSets).toEqual([
      {
        oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
        url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001',
        source: 'vsac',
      },
    ])
  })

  it('emits the provenance block', () => {
    const manifest = parse(emitManifest(PLAN))
    expect(manifest.provenance.relationship).toBe('unmodified')
    expect(manifest.provenance.ref).toBe('d4e0edd01b7da2a3b43d5360156b43761438190a')
  })

  it('lists modifications when the content was derived', () => {
    const derived = {
      ...PLAN,
      provenance: {
        ...PLAN.provenance,
        relationship: 'derived' as const,
        modifications: ['removed CPT display text from 3 code declarations'],
      },
    }
    const manifest = parse(emitManifest(derived))
    expect(manifest.provenance.modifications).toHaveLength(1)
  })
})

describe('emitReadme', () => {
  it('satisfies every section Level 1 requires', () => {
    expect(checkReadmeSections(emitReadme(PLAN))).toEqual([])
  })

  it('uses the upstream description as the intent', () => {
    expect(emitReadme(PLAN)).toContain('Percentage of patients 18-75 years of age with diabetes.')
  })

  it('leaves known limitations empty and asks for contributions', () => {
    const readme = emitReadme(PLAN)
    expect(readme).toContain('## Known Limitations')
    expect(readme).toContain('None recorded yet')
    expect(readme).toContain('knowledge/')
  })

  it('states the upstream commit in provenance', () => {
    expect(emitReadme(PLAN)).toContain('d4e0edd01b7da2a3b43d5360156b43761438190a')
  })

  it('says the steward is not CMS where that is the case', () => {
    expect(emitReadme(PLAN)).toContain('National Committee for Quality Assurance')
  })

  it('lists the modifications when the content was derived', () => {
    const derived = {
      ...PLAN,
      provenance: {
        ...PLAN.provenance,
        relationship: 'derived' as const,
        modifications: ['removed CPT display text from 3 code declarations'],
      },
    }
    expect(emitReadme(derived)).toContain('removed CPT display text from 3 code declarations')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/emit.test.ts`
Expected: FAIL, cannot resolve `../src/emit.js`.

- [ ] **Step 3: Write the emitter**

Create `packages/importer/src/emit.ts`:

```ts
import { stringify } from 'yaml'
import type { CqlValueSet } from './cql.js'

export interface PlanProvenance {
  upstream: string
  ref: string
  retrieved: string
  relationship: 'unmodified' | 'derived'
  modifications?: string[]
}

export interface PackagePlan {
  id: string
  version: string
  slug: string
  title: string
  description?: string
  steward?: string
  identifiers: string[]
  measurementPeriod?: number
  dataModel: string
  cqlFileName: string
  /**
   * Included libraries vendored into this package's cql/ directory, resolved
   * transitively. They are artifacts of this package, not dependencies on other
   * packages: see the note in emitManifest.
   */
  libraryFileNames: string[]
  valueSets: CqlValueSet[]
  provenance: PlanProvenance
}

/** Every seeded package is CC0, matching the upstream licence. */
const LICENSE = 'CC0-1.0'

export function emitManifest(plan: PackagePlan): string {
  const manifest: Record<string, unknown> = {
    id: plan.id,
    version: plan.version,
    license: LICENSE,
  }
  if (plan.measurementPeriod) manifest.measurementPeriod = plan.measurementPeriod

  const measure: Record<string, unknown> = { title: plan.title }
  if (plan.steward) measure.steward = plan.steward
  if (plan.identifiers.length > 0) measure.identifiers = plan.identifiers
  manifest.measure = measure

  manifest.dataModel = plan.dataModel

  // The measure library first, then every library it includes. All are real
  // files in this package, so all are declared: `artifacts.present` then checks
  // each one exists, which is the guarantee that a vendored package is complete.
  //
  // Deliberately NOT emitted as `dependencies`. A shared CQL library is not a
  // measure, and the manifest requires `measure.title` for Level 1, so
  // publishing FHIRHelpers as its own package would mean inventing measure
  // identity for something that is not a measure.
  manifest.artifacts = [
    { path: `cql/${plan.cqlFileName}`, type: 'cql' },
    ...plan.libraryFileNames.map((name) => ({ path: `cql/${name}`, type: 'cql' })),
  ]

  // Only value sets that resolved to an OID or a URL are emitted. The core
  // check rejects an entry with neither, and a value set the parser could not
  // resolve is a skip condition rather than something to emit half of.
  const valueSets = plan.valueSets
    .filter((v) => v.oid || v.url)
    .map((v) => {
      const entry: Record<string, unknown> = {}
      if (v.oid) entry.oid = v.oid
      if (v.url) entry.url = v.url
      entry.source = 'vsac'
      return entry
    })
  if (valueSets.length > 0) manifest.valueSets = valueSets

  const provenance: Record<string, unknown> = {
    upstream: plan.provenance.upstream,
    ref: plan.provenance.ref,
    retrieved: plan.provenance.retrieved,
    relationship: plan.provenance.relationship,
  }
  if (plan.provenance.modifications?.length) {
    provenance.modifications = plan.provenance.modifications
  }
  manifest.provenance = provenance

  return stringify(manifest, { lineWidth: 0 })
}

export function emitReadme(plan: PackagePlan): string {
  const lines: string[] = [`# ${plan.title}`, '']

  lines.push('## Intent', '')
  lines.push(plan.description ?? plan.title, '')

  lines.push('## Known Limitations', '')
  lines.push(
    'None recorded yet. This section is deliberately empty rather than filled in',
    'automatically: known limitations are exactly the knowledge that is not written',
    'down anywhere, and inventing them would be worse than leaving the gap visible.',
    '',
    'If you have implemented this measure and hit something a future implementer',
    'should know, that is the most useful contribution you can make here. File it',
    'in [`knowledge/`](../../../knowledge/). It needs a GitHub account and nothing else.',
    '',
  )

  lines.push('## Provenance', '')
  lines.push(
    `Redistributed from [${plan.provenance.upstream}](${plan.provenance.upstream}) at commit`,
    `\`${plan.provenance.ref}\`, retrieved ${plan.provenance.retrieved}, under ${LICENSE}.`,
    '',
  )

  if (plan.provenance.relationship === 'derived' && plan.provenance.modifications?.length) {
    lines.push('Modified from the upstream content:', '')
    for (const modification of plan.provenance.modifications) lines.push(`- ${modification}`)
    lines.push('')
  } else {
    lines.push('Redistributed unmodified.', '')
  }

  if (plan.steward) {
    lines.push(
      `Measure steward: ${plan.steward}. The steward is not the publisher of this`,
      'package, and Open Quality is not a measure steward. See',
      '[`measures/cms-fhir-2026/README.md`](../README.md) for what the steward line means',
      'on this collection.',
      '',
    )
  }

  lines.push(
    'Upstream describes this content as draft, translated from the QDM eCQMs as they',
    'existed in MADiE. The package version is the upstream version and reflects that.',
    '',
  )

  return lines.join('\n')
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/importer/test/emit.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/importer/src/emit.ts packages/importer/test/emit.test.ts
git commit -m "feat(importer): emit package manifests and READMEs"
```

---

## Task 11: Decide what to import and what to skip

The importer is fail-closed. A measure it cannot map is skipped with a recorded reason, never fabricated and never silently dropped.

**Files:**
- Create: `packages/importer/src/plan.ts`
- Test: `packages/importer/test/plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/importer/test/plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { planPackage, resolveLibraries } from '../src/plan.js'
import type { UpstreamMeasure } from '../src/measure.js'

const MEASURE: UpstreamMeasure = {
  name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  version: '0.5.000',
  title: 'Diabetes: Glycemic Status Assessment Greater Than 9%',
  description: 'Percentage of patients 18-75 years of age with diabetes.',
  steward: 'National Committee for Quality Assurance',
  identifiers: ['CMS122FHIR'],
  measurementPeriod: 2026,
  library: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  status: 'active',
}

const CQL = [
  `library CMS122FHIRDiabetesAssessGreaterThan9Percent version '0.5.000'`,
  `using QICore version '6.0.0'`,
  `include FHIRHelpers version '4.4.000' called FHIRHelpers`,
  `valueset "Diabetes": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'`,
].join('\n')

const CONTEXT = { ref: 'abc123', retrieved: '2026-08-01', upstream: 'https://example.org/upstream' }

describe('planPackage', () => {
  it('plans a complete measure', () => {
    const result = planPackage(MEASURE, CQL, CONTEXT)
    expect(result.skipped).toBeUndefined()
    expect(result.plan?.id).toBe('cms/diabetes-glycemic-status-assessment-greater-than-9')
    expect(result.plan?.version).toBe('0.5.0')
    expect(result.plan?.dataModel).toBe('qi-core')
  })

  it('leaves libraryFileNames empty; the caller vendors them', () => {
    const result = planPackage(MEASURE, CQL, CONTEXT)
    expect(result.plan?.libraryFileNames).toEqual([])
  })

  it('marks the package derived and lists what was stripped', () => {
    const withCpt = [
      CQL,
      `codesystem "CPT": 'http://www.ama-assn.org/go/cpt'`,
      `code "MNT": '97804' from "CPT" display 'Medical nutrition therapy'`,
    ].join('\n')
    const result = planPackage(MEASURE, withCpt, CONTEXT)
    expect(result.plan?.provenance.relationship).toBe('derived')
    expect(result.plan?.provenance.modifications?.[0]).toContain('CPT 97804')
    expect(result.cql).not.toContain('display')
  })

  it('marks the package unmodified when nothing was stripped', () => {
    expect(planPackage(MEASURE, CQL, CONTEXT).plan?.provenance.relationship).toBe('unmodified')
  })

  it('skips a measure with no parseable version', () => {
    const result = planPackage({ ...MEASURE, version: 'draft' }, CQL, CONTEXT)
    expect(result.plan).toBeUndefined()
    expect(result.skipped?.reason).toContain('version')
  })

  it('skips a measure with no description', () => {
    const result = planPackage({ ...MEASURE, description: undefined }, CQL, CONTEXT)
    expect(result.skipped?.reason).toContain('description')
  })

  it('skips a measure with no title', () => {
    const result = planPackage({ ...MEASURE, title: undefined }, CQL, CONTEXT)
    expect(result.skipped?.reason).toContain('title')
  })

  it('skips when the CQL declares no library header', () => {
    const result = planPackage(MEASURE, 'define "X": true', CONTEXT)
    expect(result.skipped?.reason).toContain('library')
  })

  it('records the measure name on every skip so the report can name it', () => {
    const result = planPackage({ ...MEASURE, version: 'draft' }, CQL, CONTEXT)
    expect(result.skipped?.measure).toBe('CMS122FHIRDiabetesAssessGreaterThan9Percent')
  })
})

describe('resolveLibraries', () => {
  const available = new Map([
    ['FHIRHelpers', `library FHIRHelpers version '4.4.000'`],
    ['QICoreCommon', [`library QICoreCommon version '4.0.000'`, `include FHIRHelpers version '4.4.000'`].join('\n')],
    ['Deep', `library Deep version '1.0.000'\ninclude QICoreCommon version '4.0.000'`],
  ])

  it('resolves a direct include', () => {
    const { resolved, missing } = resolveLibraries(`include FHIRHelpers version '4.4.000'`, available)
    expect(resolved).toEqual(['FHIRHelpers'])
    expect(missing).toEqual([])
  })

  it('resolves transitively', () => {
    const { resolved } = resolveLibraries(`include Deep version '1.0.000'`, available)
    expect(resolved).toEqual(['Deep', 'FHIRHelpers', 'QICoreCommon'])
  })

  it('returns a stable sorted order so importer output is deterministic', () => {
    const a = resolveLibraries(`include Deep version '1.0.000'`, available).resolved
    const b = resolveLibraries(`include Deep version '1.0.000'`, available).resolved
    expect(a).toEqual(b)
    expect(a).toEqual([...a].sort())
  })

  it('reports a missing library rather than guessing', () => {
    const { resolved, missing } = resolveLibraries(`include Absent version '1.0.000'`, available)
    expect(resolved).toEqual([])
    expect(missing).toEqual(['Absent'])
  })

  it('terminates on a circular include', () => {
    const cyclic = new Map([
      ['A', `library A version '1.0.000'\ninclude B version '1.0.000'`],
      ['B', `library B version '1.0.000'\ninclude A version '1.0.000'`],
    ])
    const { resolved } = resolveLibraries(`include A version '1.0.000'`, cyclic)
    expect(resolved).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/plan.test.ts`
Expected: FAIL, cannot resolve `../src/plan.js`.

- [ ] **Step 3: Write the planner**

Create `packages/importer/src/plan.ts`:

```ts
import { parseHeader, parseIncludes, parseValueSets, stripRestrictedDisplays } from './cql.js'
import { normalizeVersion, packageId, slugFor } from './naming.js'
import type { UpstreamMeasure } from './measure.js'
import type { PackagePlan } from './emit.js'

export interface ImportContext {
  upstream: string
  ref: string
  retrieved: string
}

export interface Skip {
  measure: string
  reason: string
}

export interface PlanResult {
  plan?: PackagePlan
  /** The rewritten CQL to write alongside the plan. */
  cql?: string
  skipped?: Skip
}

/** The namespace seeded CMS-programme measures are published under. */
export const MEASURE_NAMESPACE = 'cms'

/** Maps a CQL `using` declaration to an Open Quality dataModel value. */
function dataModelFor(model: string | undefined): string | undefined {
  if (model === 'QICore') return 'qi-core'
  if (model === 'FHIR') return 'fhir-r4'
  return undefined
}

/**
 * Plans one measure package, or explains why it cannot be planned. Fail-closed
 * on purpose: a measure that cannot be mapped is reported, never guessed at.
 * Silent truncation would read as complete coverage.
 */
/**
 * Every library this CQL includes, transitively. Returned in a stable sorted
 * order so the importer's output is deterministic and the CI drift check does
 * not fire on ordering alone.
 *
 * A library that is included but missing from `available` is left out rather
 * than guessed at; the caller turns that into a skip.
 */
export function resolveLibraries(
  cqlSource: string,
  available: Map<string, string>,
): { resolved: string[]; missing: string[] } {
  const resolved = new Set<string>()
  const missing = new Set<string>()
  const queue = parseIncludes(cqlSource).map((i) => i.library)

  while (queue.length > 0) {
    const name = queue.shift() as string
    if (resolved.has(name) || missing.has(name)) continue
    const source = available.get(name)
    if (!source) {
      missing.add(name)
      continue
    }
    resolved.add(name)
    for (const include of parseIncludes(source)) queue.push(include.library)
  }

  return { resolved: [...resolved].sort(), missing: [...missing].sort() }
}

export function planPackage(
  measure: UpstreamMeasure,
  cqlSource: string,
  context: ImportContext,
): PlanResult {
  const skip = (reason: string): PlanResult => ({ skipped: { measure: measure.name, reason } })

  const version = normalizeVersion(measure.version)
  if (!version) return skip(`no parseable version, upstream had "${measure.version ?? 'nothing'}"`)

  if (!measure.title) return skip('no title on the upstream Measure resource')
  if (!measure.description) {
    return skip('no description on the upstream Measure resource, so Intent cannot be generated')
  }

  const header = parseHeader(cqlSource)
  if (!header) return skip('the CQL declares no library header')

  const dataModel = dataModelFor(header.model)
  if (!dataModel) {
    return skip(`the CQL declares an unmapped data model, "${header.model ?? 'none'}"`)
  }

  const { cql, removed } = stripRestrictedDisplays(cqlSource)

  const slug = slugFor(measure.title)

  const plan: PackagePlan = {
    id: packageId(MEASURE_NAMESPACE, slug),
    version,
    slug,
    title: measure.title,
    description: measure.description,
    steward: measure.steward,
    identifiers: measure.identifiers,
    measurementPeriod: measure.measurementPeriod,
    dataModel,
    cqlFileName: `${header.name}.cql`,
    libraryFileNames: [],
    valueSets: parseValueSets(cqlSource),
    provenance: {
      upstream: context.upstream,
      ref: context.ref,
      retrieved: context.retrieved,
      relationship: removed.length > 0 ? 'derived' : 'unmodified',
      modifications:
        removed.length > 0
          ? [`removed licensed display text from ${removed.length} code declarations: ${removed.join(', ')}`]
          : undefined,
    },
  }

  return { plan, cql }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/importer/test/plan.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/importer/src/plan.ts packages/importer/test/plan.test.ts
git commit -m "feat(importer): plan packages fail-closed with recorded skips"
```

---

## Task 12: Orchestration, file writing and the import report

**Files:**
- Create: `packages/importer/src/run.ts`
- Create: `packages/importer/src/cli.ts`
- Create: `packages/importer/src/index.ts`
- Test: `packages/importer/test/report.test.ts`

- [ ] **Step 1: Write the failing test for the report**

Create `packages/importer/test/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderImportReport } from '../src/run.js'

describe('renderImportReport', () => {
  const base = {
    ref: 'abc123',
    retrieved: '2026-08-01',
    upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
  }

  it('accounts for every measure, imported and skipped', () => {
    const report = renderImportReport({
      ...base,
      imported: ['cms/a', 'cms/b'],
      skipped: [{ measure: 'CMS999Broken', reason: 'no parseable version' }],
    })
    expect(report).toContain('2 measures')
    expect(report).toContain('1 skipped')
    expect(report).toContain('CMS999Broken')
    expect(report).toContain('no parseable version')
  })

  it('states the pinned commit', () => {
    const report = renderImportReport({ ...base, imported: [], skipped: [] })
    expect(report).toContain('abc123')
  })

  it('says so plainly when nothing was skipped', () => {
    const report = renderImportReport({ ...base, imported: ['cms/a'], skipped: [] })
    expect(report).toContain('Nothing was skipped')
  })

  it('is generated, and says so, so nobody hand-edits it', () => {
    const report = renderImportReport({ ...base, imported: [], skipped: [] })
    expect(report).toContain('Generated by')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/report.test.ts`
Expected: FAIL, cannot resolve `../src/run.js`.

- [ ] **Step 3: Write the orchestrator**

Create `packages/importer/src/run.ts`:

```ts
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseHeader } from './cql.js'
import { emitManifest, emitReadme, type PackagePlan } from './emit.js'
import { readMeasure } from './measure.js'
import { normalizeVersion, packageId, slugFor } from './naming.js'
import { planPackage, resolveLibraries, type ImportContext, type Skip } from './plan.js'
import { UPSTREAM, fetchUpstream, listCqlFiles, listMeasureFiles, readText } from './upstream.js'

export const MEASURES_DIR = 'measures/cms-fhir-2026'
export const REPORT_PATH = 'measures/import-report.md'

export interface ImportSummary {
  upstream: string
  ref: string
  retrieved: string
  imported: string[]
  skipped: Skip[]
}

export function renderImportReport(summary: ImportSummary): string {
  const lines: string[] = [
    '# Import report',
    '',
    `Generated by \`pnpm oq-import\`. Do not edit by hand: CI re-runs the importer and`,
    'fails if the committed tree differs from its output.',
    '',
    `Upstream: [${summary.upstream}](${summary.upstream})`,
    `Commit: \`${summary.ref}\``,
    `Retrieved: ${summary.retrieved}`,
    '',
    '## Result',
    '',
    `- ${summary.imported.length} measures imported`,
    `- ${summary.skipped.length} skipped`,
    '',
  ]

  lines.push('## Skipped', '')
  if (summary.skipped.length === 0) {
    lines.push('Nothing was skipped. Every upstream measure imported.', '')
  } else {
    lines.push(
      'Each of these was left out rather than guessed at. A skip is a gap in the',
      'corpus, not a silent omission.',
      '',
      '| Measure | Reason |',
      '|---------|--------|',
    )
    for (const skip of summary.skipped) lines.push(`| \`${skip.measure}\` | ${skip.reason} |`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Writes one self-contained package: the manifest, the README, the measure CQL,
 * and every library the measure includes. Vendoring the libraries is what makes
 * the package readable and evaluable on its own, which is the whole point of a
 * package. The alternative, publishing each shared library as its own package,
 * would require inventing a `measure.title` for something that is not a measure.
 */
async function writePackage(
  dir: string,
  plan: PackagePlan,
  cql: string,
  libraries: Map<string, string>,
): Promise<void> {
  await mkdir(join(dir, 'cql'), { recursive: true })
  await writeFile(join(dir, 'openquality.yaml'), emitManifest(plan))
  await writeFile(join(dir, 'README.md'), emitReadme(plan))
  await writeFile(join(dir, 'cql', plan.cqlFileName), cql)
  for (const name of plan.libraryFileNames) {
    const source = libraries.get(name.replace(/\.cql$/, ''))
    if (source !== undefined) await writeFile(join(dir, 'cql', name), source)
  }
}

/**
 * Imports the pinned upstream content into measures/. Removes the generated
 * directories first, so a measure that disappears upstream disappears here too
 * and the drift check stays meaningful.
 */
export async function runImport(retrieved: string, ref: string = UPSTREAM.ref): Promise<ImportSummary> {
  const root = await fetchUpstream(ref)
  const context: ImportContext = { upstream: UPSTREAM.url, ref, retrieved }

  const cqlByLibrary = new Map<string, string>()
  for (const path of await listCqlFiles(root)) {
    cqlByLibrary.set(basename(path, '.cql'), await readText(path))
  }

  await rm(MEASURES_DIR, { recursive: true, force: true })

  const imported: string[] = []
  const skipped: Skip[] = []

  for (const path of await listMeasureFiles(root)) {
    const measure = readMeasure(await readText(path))
    if (!measure) {
      skipped.push({ measure: basename(path, '.json'), reason: 'not a readable Measure resource' })
      continue
    }

    const source = measure.library ? cqlByLibrary.get(measure.library) : undefined
    if (!source) {
      skipped.push({ measure: measure.name, reason: `no CQL found for library "${measure.library ?? 'none'}"` })
      continue
    }

    const { plan, cql, skipped: skip } = planPackage(measure, source, context)
    if (!plan || !cql) {
      if (skip) skipped.push(skip)
      continue
    }

    // Libraries are vendored, so a missing one means the package would be
    // incomplete. Skip rather than ship something that cannot be evaluated.
    const { resolved, missing } = resolveLibraries(source, cqlByLibrary)
    if (missing.length > 0) {
      skipped.push({
        measure: measure.name,
        reason: `includes libraries not present upstream: ${missing.join(', ')}`,
      })
      continue
    }
    plan.libraryFileNames = resolved.map((name) => `${name}.cql`)

    await writePackage(join(MEASURES_DIR, plan.slug), plan, cql, cqlByLibrary)
    imported.push(plan.id)
  }

  const summary: ImportSummary = {
    upstream: UPSTREAM.url,
    ref,
    retrieved,
    imported: imported.sort(),
    skipped,
  }
  await writeFile(REPORT_PATH, renderImportReport(summary))
  return summary
}

```

- [ ] **Step 4: Write the CLI entry point**

Create `packages/importer/src/cli.ts`:

```ts
#!/usr/bin/env node
import { runImport } from './run.js'

/**
 * The retrieval date is passed in rather than read from the clock, so a re-run
 * of the same pinned commit produces byte-identical output. The drift check
 * depends on that.
 */
const retrieved = process.argv[2] ?? process.env.OQ_IMPORT_DATE

if (!retrieved || !/^\d{4}-\d{2}-\d{2}$/.test(retrieved)) {
  console.error('usage: pnpm oq-import <YYYY-MM-DD>')
  console.error('The date is the retrieval date recorded in every package provenance block.')
  console.error('Pass the same date on a re-import, or the drift check will fail on the date alone.')
  process.exit(2)
}

const summary = await runImport(retrieved)
console.log(`imported ${summary.imported.length} measures`)
console.log(`skipped ${summary.skipped.length}`)
for (const skip of summary.skipped) console.log(`  ${skip.measure}: ${skip.reason}`)
```

- [ ] **Step 5: Write the package index**

Create `packages/importer/src/index.ts`:

```ts
export * from './cql.js'
export * from './emit.js'
export * from './measure.js'
export * from './naming.js'
export * from './plan.js'
export * from './run.js'
export * from './upstream.js'
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/importer/src/run.ts packages/importer/src/cli.ts packages/importer/src/index.ts packages/importer/test/report.test.ts
git commit -m "feat(importer): orchestrate the import and generate the import report"
```

---

## Task 13: Run the import and commit the corpus

This is the first task that produces content. Expect to find real problems here: that is what the import report is for.

**Files:**
- Create: `measures/cms-fhir-2026/**` (generated)
- Create: `measures/import-report.md` (generated)
- Delete: `measures/cms-fhir-2026/diabetes-hba1c-poor-control/`

- [ ] **Step 1: Remove the superseded hand-written package**

The existing package declares `steward: CMS`, version `13.0.0`, and the measure's former title. All three disagree with upstream, which says NCQA, `0.5.000`, and "Glycemic Status Assessment". The import replaces it.

```bash
git rm -r measures/cms-fhir-2026/diabetes-hba1c-poor-control
```

- [ ] **Step 2: Run the import**

Run: `pnpm oq-import 2026-08-01`
Expected: about 53 measures imported, each with its included libraries vendored into its own `cql/`, plus a skip list. The first download is about 450 MB and takes a few minutes.

- [ ] **Step 3: Read the import report before anything else**

Run: `cat measures/import-report.md`

Read every skip. A skip is a finding, not noise. If a whole class of measures skipped for the same reason, that is a bug in Task 11 or Task 8, not an upstream problem. Fix it and re-run before continuing.

- [ ] **Step 4: Validate every generated package**

Run:

```bash
for dir in measures/cms-fhir-2026/*/; do
  pnpm oq validate "$dir" > /dev/null || echo "FAILED: $dir"
done
```

Expected: no output. Any `FAILED` line must be fixed in the importer, not by hand-editing the generated package. Hand edits fail the drift check in Task 15.

- [ ] **Step 5: Confirm no licensed display text survived**

Run: `grep -rn 'from "CPT"' measures/ | grep display`
Expected: no output.

- [ ] **Step 6: Add the steward note to the collection README**

In `measures/cms-fhir-2026/README.md`, add this section after the `## Provenance` heading content:

```markdown
## About the steward line

Many packages in this collection show
`steward: National Committee for Quality Assurance`. That is what the upstream
`Measure.publisher` says, and it is accurate: NCQA stewards a number of the
measures in the CMS eCQM programme.

It does not mean this collection contains HEDIS content. HEDIS is a separate
NCQA product with its own licence, and Open Quality's content policy excludes
it. These are CMS-programme eCQMs published under CC0 through MADiE. The
steward of a measure and the licensor of a specification are different things.
```

- [ ] **Step 7: Update the package table in the collection README**

Replace the single-row package table with a generated count, since a 53-row hand-maintained table will go stale:

```markdown
This collection currently holds the measures listed in
[`../import-report.md`](../import-report.md), imported from the pinned upstream
commit recorded there.
```

- [ ] **Step 8: Commit the corpus**

```bash
git add measures/
git commit -m "feat(measures): import the CC0 QI-Core 2026 eCQM corpus

Generated by pnpm oq-import from cqframework/ecqm-content-qicore-2025 at
d4e0edd01b7da2a3b43d5360156b43761438190a. See measures/import-report.md for
what imported and what was skipped.

Replaces the hand-written diabetes package, which disagreed with upstream on
steward, version and title."
```

---

## Task 14: Golden fixture for the importer

A committed expected output, so a change to the importer shows up as a reviewable diff on one package rather than a silent change across 53 directories.

**Files:**
- Create: `packages/importer/test/fixtures/upstream/measure/Example.json`
- Create: `packages/importer/test/fixtures/upstream/cql/Example.cql`
- Create: `packages/importer/test/fixtures/expected/openquality.yaml`
- Create: `packages/importer/test/fixtures/expected/README.md`
- Test: `packages/importer/test/golden.test.ts`

- [ ] **Step 1: Create the input fixtures**

Create `packages/importer/test/fixtures/upstream/cql/Example.cql`:

```
library Example version '0.5.000'

using QICore version '6.0.0'

include FHIRHelpers version '4.4.000' called FHIRHelpers

codesystem "CPT": 'http://www.ama-assn.org/go/cpt'
codesystem "LOINC": 'http://loinc.org'

valueset "Diabetes": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'

code "Medical nutrition therapy": '97804' from "CPT" display 'Medical nutrition therapy; group'
code "Glucose management indicator": '97506-0' from "LOINC" display 'Glucose management indicator'

define "Initial Population":
  AgeInYearsAt(start of "Measurement Period") between 18 and 75
```

Create `packages/importer/test/fixtures/upstream/measure/Example.json`:

```json
{
  "resourceType": "Measure",
  "id": "Example",
  "version": "0.5.000",
  "name": "Example",
  "title": "Example Measure: Glycemic StatusFHIR",
  "status": "active",
  "publisher": "National Committee for Quality Assurance",
  "description": "Percentage of patients 18-75 years of age with an example condition.",
  "effectivePeriod": { "start": "2026-01-01", "end": "2026-12-31" },
  "library": ["https://madie.cms.gov/Library/Example"],
  "identifier": [
    {
      "type": { "coding": [{ "code": "short-name" }] },
      "system": "https://madie.cms.gov/measure/shortName",
      "value": "CMS999FHIR"
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/importer/test/golden.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emitManifest, emitReadme } from '../src/emit.js'
import { readMeasure } from '../src/measure.js'
import { planPackage } from '../src/plan.js'

const FIXTURES = join(import.meta.dirname, 'fixtures')

const CONTEXT = {
  upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
  ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
  retrieved: '2026-08-01',
}

async function planFixture() {
  const measure = readMeasure(await readFile(join(FIXTURES, 'upstream/measure/Example.json'), 'utf8'))
  const cql = await readFile(join(FIXTURES, 'upstream/cql/Example.cql'), 'utf8')
  const result = planPackage(measure!, cql, CONTEXT)
  expect(result.skipped).toBeUndefined()
  return result
}

describe('golden import', () => {
  it('produces the expected manifest', async () => {
    const { plan } = await planFixture()
    const expected = await readFile(join(FIXTURES, 'expected/openquality.yaml'), 'utf8')
    expect(emitManifest(plan!)).toBe(expected)
  })

  it('produces the expected README', async () => {
    const { plan } = await planFixture()
    const expected = await readFile(join(FIXTURES, 'expected/README.md'), 'utf8')
    expect(emitReadme(plan!)).toBe(expected)
  })

  it('marks the fixture derived because it carries CPT display text', async () => {
    const { plan } = await planFixture()
    expect(plan!.provenance.relationship).toBe('derived')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/importer/test/golden.test.ts`
Expected: FAIL, the expected files do not exist.

- [ ] **Step 4: Generate the expected files**

Run this once to write the current output as the golden baseline:

```bash
pnpm tsx -e "
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { emitManifest, emitReadme } from './packages/importer/src/emit.ts'
import { readMeasure } from './packages/importer/src/measure.ts'
import { planPackage } from './packages/importer/src/plan.ts'
const F = 'packages/importer/test/fixtures'
const m = readMeasure(await readFile(F + '/upstream/measure/Example.json', 'utf8'))
const cql = await readFile(F + '/upstream/cql/Example.cql', 'utf8')
const { plan } = planPackage(m, cql, {
  upstream: 'https://github.com/cqframework/ecqm-content-qicore-2025',
  ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
  retrieved: '2026-08-01',
})
await mkdir(F + '/expected', { recursive: true })
await writeFile(F + '/expected/openquality.yaml', emitManifest(plan))
await writeFile(F + '/expected/README.md', emitReadme(plan))
"
```

- [ ] **Step 5: Read the generated files before trusting them**

Run: `cat packages/importer/test/fixtures/expected/openquality.yaml`

A golden file you did not read is a golden file that locks in a bug. Confirm: `dataModel: qi-core`, `version: 0.5.0`, `steward: National Committee for Quality Assurance`, `relationship: derived`, a `modifications` entry naming `CPT 97804`, and a `valueSets` entry with both `oid` and `url`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/importer/test/golden.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/importer/test/fixtures packages/importer/test/golden.test.ts
git commit -m "test(importer): add a golden fixture for generated package output"
```

---

# Phase 3: CI

## Task 15: The validate-all command

CI needs one command that validates every package and fails on the first that falls below Level 1.

**Files:**
- Create: `packages/cli/src/commands/validate-all.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/validate-all.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/validate-all.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runValidateAll } from '../src/commands/validate-all.js'

let root: string
const lines: string[] = []
const write = (line: string) => lines.push(line)

async function writePackage(name: string, manifest: string, readme: string): Promise<void> {
  const dir = join(root, name)
  await mkdir(join(dir, 'cql'), { recursive: true })
  await writeFile(join(dir, 'openquality.yaml'), manifest)
  await writeFile(join(dir, 'README.md'), readme)
  await writeFile(join(dir, 'cql', 'A.cql'), `library A version '1.0.000'\n`)
}

const GOOD_MANIFEST = [
  'id: cms/good',
  'version: 1.0.0',
  'license: CC0-1.0',
  'dataModel: qi-core',
  'measure:',
  '  title: Good',
  'artifacts:',
  '  - path: cql/A.cql',
  '    type: cql',
  '',
].join('\n')

const GOOD_README = '# Good\n\n## Intent\nx\n\n## Known Limitations\nx\n\n## Provenance\nx\n'

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oq-validate-all-'))
  lines.length = 0
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('runValidateAll', () => {
  it('returns 0 when every package reaches the floor', async () => {
    await writePackage('good', GOOD_MANIFEST, GOOD_README)
    expect(await runValidateAll([root], 1, write)).toBe(0)
  })

  it('returns 1 and names the package that falls below the floor', async () => {
    await writePackage('good', GOOD_MANIFEST, GOOD_README)
    await writePackage('bad', GOOD_MANIFEST.replace('id: cms/good', 'id: cms/bad'), '# Bad\n')
    const code = await runValidateAll([root], 1, write)
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('bad')
  })

  it('reports how many packages it checked', async () => {
    await writePackage('good', GOOD_MANIFEST, GOOD_README)
    await runValidateAll([root], 1, write)
    expect(lines.join('\n')).toContain('1 package')
  })

  it('returns 0 for a root that contains no packages', async () => {
    expect(await runValidateAll([root], 1, write)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/test/validate-all.test.ts`
Expected: FAIL, cannot resolve `../src/commands/validate-all.js`.

- [ ] **Step 3: Write the command**

Create `packages/cli/src/commands/validate-all.ts`:

```ts
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { validatePackage } from '@openquality/core'
import type { Writer } from './validate.js'

/** Immediate subdirectories of `root` that contain an openquality.yaml. */
async function findPackages(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const found: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    try {
      await stat(join(dir, 'openquality.yaml'))
      found.push(dir)
    } catch {
      // Not a package. Collections nest one level, so this is expected.
    }
  }
  return found.sort()
}

/**
 * Validates every package under the given roots and fails if any falls below
 * the floor. Reports every failure rather than stopping at the first, because
 * a contributor fixing CI wants the whole list.
 */
export async function runValidateAll(roots: string[], floor: number, write: Writer): Promise<number> {
  const dirs: string[] = []
  for (const root of roots) dirs.push(...(await findPackages(root)))

  const failures: string[] = []
  for (const dir of dirs) {
    const { level, blockers } = await validatePackage(dir)
    if (level >= floor) continue
    failures.push(dir)
    write(`FAIL  ${dir}  Level ${level}, needs Level ${floor}`)
    for (const blocker of blockers) write(`        ${blocker}`)
  }

  write('')
  write(`Checked ${dirs.length} package${dirs.length === 1 ? '' : 's'}, ${failures.length} below Level ${floor}`)
  return failures.length > 0 ? 1 : 0
}
```

- [ ] **Step 4: Wire it into the CLI**

In `packages/cli/src/index.ts`, add the import:

```ts
import { runValidateAll } from './commands/validate-all.js'
```

and register the command after the existing `validate` command:

```ts
program
  .command('validate-all')
  .description('Validate every package under one or more collection roots')
  .argument('<roots...>', 'collection directories')
  .option('--floor <level>', 'minimum acceptable conformance level', '1')
  .action(async (roots: string[], opts: { floor: string }) => {
    process.exitCode = await runValidateAll(roots, Number(opts.floor), write)
  })
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Verify against the real corpus**

Run: `pnpm oq validate-all measures/cms-fhir-2026`
Expected: `0 below Level 1`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/validate-all.ts packages/cli/src/index.ts packages/cli/test/validate-all.test.ts
git commit -m "feat(cli): add oq validate-all with a conformance floor"
```

---

## Task 16: CI workflow and the drift check

The drift check is what makes the `unmodified` and `derived` provenance claims verifiable. Without it, a hand edit to a generated package silently falsifies a validated manifest field.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test

  validate-corpus:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Every package reaches Level 1
        run: pnpm oq validate-all measures/cms-fhir-2026
      - name: No licensed display text
        run: |
          if grep -rn 'from "CPT"' measures/ | grep -q display; then
            echo "CPT display text found in measures/"
            grep -rn 'from "CPT"' measures/ | grep display
            exit 1
          fi

  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache the upstream tarball
        uses: actions/cache@v4
        with:
          path: .cache
          key: upstream-d4e0edd01b7da2a3b43d5360156b43761438190a
      - name: Re-run the importer
        # The date must match what is recorded in the committed packages, or
        # every provenance block differs and the diff is noise.
        run: pnpm oq-import 2026-08-01
      - name: Committed tree must equal importer output
        run: |
          if ! git diff --exit-code -- measures/; then
            echo ""
            echo "The committed corpus differs from what the importer produces."
            echo "Generated packages must not be edited by hand: change the importer"
            echo "in packages/importer and re-run 'pnpm oq-import 2026-08-01'."
            exit 1
          fi
```

- [ ] **Step 2: Verify the drift check locally**

Run:

```bash
pnpm oq-import 2026-08-01 && git diff --exit-code -- measures/
```

Expected: exit code 0, no diff. If there is a diff, the importer is not deterministic. The usual cause is a date or an ordering that is not pinned. Fix it before committing, because a drift check that fails on a clean tree gets disabled within a week.

- [ ] **Step 3: Prove the check catches a hand edit**

```bash
echo "# hand edit" >> measures/cms-fhir-2026/*/README.md
pnpm oq-import 2026-08-01
git diff --exit-code -- measures/ && echo "BROKEN: drift check did not fire" || echo "drift check works"
git checkout -- measures/
```

Expected: `drift check works`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add test, corpus validation and importer drift checks"
```

---

## Task 17: REMOVED — CQL translation in CI

**Do not implement this task.** It was cut during execution after two assumptions
behind it were tested and both failed.

**There is no runnable translator artifact.** The plan pinned
`info.cqframework:cql-to-elm:3.11.0-jar-with-dependencies`. That returns 404.
The current release is 3.29.0, the runnable artifact is `cql-to-elm-cli`, and
neither publishes a `jar-with-dependencies`. The `clinical_quality_language`
GitHub release carries source only, with no assets. Running the translator in CI
therefore means assembling a Maven classpath or building from source.

**Per-package translation could not work as written.** The job ran
`--input "$dir/cql"` per package, but a measure library includes shared
libraries. CMS122 includes seven. Under the original design those lived in
separate packages, so translation would have failed on nearly every measure.

Together these turned "one small slice of the validator subsystem" into a JVM, a
dependency-resolution step, a version pin to maintain, and a new class of CI
flakiness, for a project maintained by one person. What it bought was a badge.

The corpus therefore ships at **Level 1**, and says so. Upstream cqframework
already validates that this content translates, so re-running it here proved
little. Level 2 is deferred with the rest of the validator subsystem.

`packages/importer/src/translate.ts` is not created.

---

# Phase 4: Hand-authored content

## Task 18: SQL-on-FHIR showcase package

Two independent implementations of one measure, in one corpus, is the clearest available demonstration that `dataModel` and the conformance ladder do real work.

**Files:**
- Create: `measures/community/glycemic-status-assessment-sql-on-fhir/openquality.yaml`
- Create: `measures/community/glycemic-status-assessment-sql-on-fhir/README.md`
- Create: `measures/community/glycemic-status-assessment-sql-on-fhir/views/patient-hba1c.json`

- [ ] **Step 1: Identify the CQL counterpart**

Run: `ls measures/cms-fhir-2026/ | grep -i glycemic`

Record the exact slug. The showcase package README must link to it, and the manifest must reference the same value set OIDs. Read that package's `openquality.yaml` before writing this one.

- [ ] **Step 2: Write the ViewDefinition**

Create `measures/community/glycemic-status-assessment-sql-on-fhir/views/patient-hba1c.json`:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_hba1c",
  "status": "draft",
  "resource": "Observation",
  "select": [
    {
      "column": [
        { "name": "observation_id", "path": "getResourceKey()", "type": "string" },
        { "name": "patient_id", "path": "subject.getReferenceKey(Patient)", "type": "string" },
        { "name": "effective_date_time", "path": "effective.ofType(dateTime)", "type": "dateTime" },
        { "name": "value_quantity", "path": "value.ofType(Quantity).value", "type": "decimal" },
        { "name": "value_unit", "path": "value.ofType(Quantity).unit", "type": "string" }
      ]
    }
  ],
  "where": [
    {
      "path": "code.coding.exists(system = 'http://loinc.org' and code in ('4548-4' | '17856-6' | '4549-2'))",
      "description": "HbA1c results by LOINC code. The CQL implementation resolves the same concept through the HbA1c Laboratory Test value set rather than by enumerating codes, which is the difference this package exists to expose."
    }
  ]
}
```

- [ ] **Step 3: Write the manifest**

Create `measures/community/glycemic-status-assessment-sql-on-fhir/openquality.yaml`. Replace the `oid` values below with the ones you read in Step 1 if they differ:

```yaml
id: community/glycemic-status-assessment-sql-on-fhir
version: 0.1.0
license: CC0-1.0
measurementPeriod: 2026
measure:
  title: "Diabetes: Glycemic Status Assessment Greater Than 9% (SQL on FHIR)"
  steward: National Committee for Quality Assurance
  identifiers: [CMS122FHIR]
  type: intermediate-outcome
  improvementNotation: decrease
  domain: [diabetes, chronic-care]
  setting: [ambulatory]
dataModel: sql-on-fhir
artifacts:
  - path: views/patient-hba1c.json
    type: sql-on-fhir/ViewDefinition
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    url: http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
  - oid: 2.16.840.1.113883.3.464.1003.198.12.1013
    url: http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013
    source: vsac
```

There is no `provenance` block: this package is original work, not redistributed content. That is exactly the case the optional provenance rule in Task 1 exists to allow.

- [ ] **Step 4: Write the README**

Create `measures/community/glycemic-status-assessment-sql-on-fhir/README.md`:

```markdown
# Diabetes: Glycemic Status Assessment Greater Than 9% (SQL on FHIR)

A SQL-on-FHIR ViewDefinition implementation of the same measure that
[`cms-fhir-2026`](../../cms-fhir-2026/) carries in CQL. It exists so the corpus
holds one measure implemented two independent ways.

## Intent

Project HbA1c observations into a tabular form so the measure's numerator can be
computed in SQL against a warehouse, rather than through a CQL engine.
Percentage of patients 18 to 75 years of age with diabetes whose most recent
glycemic status assessment was greater than 9%, or who had none.

## Known Limitations

This package is a partial implementation and says so rather than pretending
otherwise. It ships the observation projection only. The denominator, the
exclusions, and the numerator logic are not implemented here.

It also enumerates HbA1c LOINC codes directly in the `where` clause, while the
CQL implementation resolves the same concept through the HbA1c Laboratory Test
value set. Those two will drift apart the moment the value set changes. That
divergence is the point of publishing both: it is a real interpretation issue,
and it is recorded in [`knowledge/`](../../../knowledge/).

Not clinically validated. Not suitable for reporting.

## Provenance

Original work, authored for Open Quality as a worked example of the package
format. Not redistributed from any upstream source, which is why this package
carries no `provenance` block.

The measure it implements is stewarded by the National Committee for Quality
Assurance. Open Quality is not a measure steward and is not affiliated with or
endorsed by NCQA or CMS.
```

- [ ] **Step 5: Validate it**

Run: `pnpm oq validate measures/community/glycemic-status-assessment-sql-on-fhir`
Expected: `Level 1 (Described)`, with `fhir.validate did not run` listed as the only blocker to Level 2. A ViewDefinition is a FHIR resource, so `requiredDeepChecks` demands `fhir.validate`, which is out of scope for this plan. That is the honest result.

- [ ] **Step 6: Commit**

```bash
git add measures/community/glycemic-status-assessment-sql-on-fhir
git commit -m "feat(measures): add a SQL-on-FHIR implementation of the glycemic status measure"
```

---

## Task 19: Knowledge corpus entries

Hand-written, because the value of this corpus is knowledge that is not written down anywhere else. Generated entries would dilute it.

**Files:**
- Create: `knowledge/cms122/2026-002-value-set-versus-enumerated-loinc.md`
- Create: `knowledge/cms122/2026-003-measure-renamed-and-retitled.md`
- Create: `knowledge/cms122/2026-004-steward-is-ncqa-not-cms.md`
- Create: `knowledge/cms122/test-cases/2026-005-no-result-counts-as-numerator.md`
- Create: `knowledge/cms122/2026-006-draft-versioning-of-seeded-packages.md`
- Create: `knowledge/cms122/2026-007-vendored-library-duplication.md`
- Modify: `knowledge/cms122/2026-001-missing-hba1c-counts-as-poor-control.md`

- [ ] **Step 1: Write the value set divergence entry**

Create `knowledge/cms122/2026-002-value-set-versus-enumerated-loinc.md`:

```markdown
---
id: cms122-2026-002
type: interpretation-issue
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, terminology]
reporter: aks129
---

## Summary

The CQL implementation resolves HbA1c results through the "HbA1c Laboratory
Test" value set. The SQL-on-FHIR implementation in the same corpus enumerates
LOINC codes directly. The two agree today and will diverge the moment the value
set changes.

## Detail

`cms/diabetes-glycemic-status-assessment-greater-than-9` declares
`valueset "HbA1c Laboratory Test": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013'`
and matches observations against it, so the set of qualifying codes is whatever
VSAC currently expands that OID to.

`community/glycemic-status-assessment-sql-on-fhir` filters on an inline list of
LOINC codes in the ViewDefinition `where` clause. That list was correct when it
was written and is not bound to the value set.

This is not a defect in either implementation. It is the tradeoff a SQL
implementation usually has to make, because expanding a value set at query time
needs terminology service access the warehouse often does not have. The point of
recording it is that the tradeoff is usually invisible: a reader comparing the
two would assume they compute the same thing.

The input that exposes it is any HbA1c LOINC code added to the value set after
the ViewDefinition was written. The CQL picks it up; the SQL does not.

## Resolution

Open. Two candidate answers worth discussing:

1. The SQL implementation ships the expansion it was built against as a
   versioned lookup table, making the binding explicit and dated. This conflicts
   with the content policy, which forbids redistributing VSAC expansions, so it
   would have to be a reference to a locally materialised table rather than
   shipped content.
2. The package format grows a way to declare "this artifact uses a frozen
   expansion of value set X as of date Y", so the staleness is machine-readable
   rather than a comment.

Neither is decided. Comments welcome.
```

- [ ] **Step 2: Write the retitling entry**

Create `knowledge/cms122/2026-003-measure-renamed-and-retitled.md`:

```markdown
---
id: cms122-2026-003
type: implementation-note
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: resolved
categories: [measure-metadata]
reporter: aks129
---

## Summary

CMS122 is titled "Diabetes: Glycemic Status Assessment Greater Than 9%" in the
2026 FHIR content. Older material calls it "Diabetes: Hemoglobin A1c (HbA1c)
Poor Control (> 9%)". Searching for the old name finds nothing in this corpus.

## Detail

The measure was retitled to reflect that it now accepts a glucose management
indicator (GMI) result as well as an HbA1c result. The logic changed with it:
an implementation that matches only HbA1c will undercount.

Two further naming traps in the same content:

- The upstream `Measure.title` carries a trailing `FHIR`, as in
  "Diabetes: Glycemic Status Assessment Greater Than 9%FHIR". It is an artifact
  of the QDM-to-FHIR translation pipeline, not part of the measure name. The
  Open Quality importer strips it.
- The CQL library is named `CMS122FHIRDiabetesAssessGreaterThan9Percent`, which
  matches neither the old nor the new title.

## Resolution

Resolved as documentation. The package uses the current title, and this entry
exists so a search for the old name reaches it.
```

- [ ] **Step 3: Write the steward entry**

Create `knowledge/cms122/2026-004-steward-is-ncqa-not-cms.md`:

```markdown
---
id: cms122-2026-004
type: implementation-note
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: resolved
categories: [measure-metadata, licensing]
reporter: aks129
---

## Summary

The steward of CMS122 is the National Committee for Quality Assurance, not CMS.
The same is true of several other measures in the CMS eCQM programme. This
surprises people, and it looks alarming next to a content policy that excludes
HEDIS because NCQA licenses it.

## Detail

`Measure.publisher` in the upstream FHIR content reads
`National Committee for Quality Assurance` for CMS122, CMS125 and CMS165, among
others. The measures are still CMS-programme eCQMs, published through MADiE and
redistributable under CC0.

The distinction that resolves the apparent conflict: **the steward of a measure
and the licensor of a specification are different things.** NCQA develops and
stewards a number of eCQMs whose specifications CMS publishes openly. HEDIS is a
separate NCQA product, separately licensed, and none of it is in this corpus.

An earlier hand-written package in this repository recorded `steward: CMS` for
this measure. That was wrong, and the import corrected it.

## Resolution

Resolved. The manifest records the steward as upstream states it, and
`measures/cms-fhir-2026/README.md` explains what the steward line means so a
reader does not have to reconstruct this.
```

- [ ] **Step 4: Write the test-case entry**

This is the entry type that turns the corpus from prose into something runnable. It references the upstream test bundles by path and commit rather than copying them, because the upstream repository is about 360 MB.

The upstream layout: `input/tests/measure/<MeasureName>/<uuid>/` holds one test case each. There are 390 for CMS122. The directory name is a UUID, but the bundle inside is descriptively named, for example `CMS122FHIR-v0.5.000-IPPass-PatientAge75.json`, and a sibling `MeasureReport-*.json` carries the expected population counts.

Find the case this entry describes. It is the one whose name indicates a numerator pass with no observation:

```bash
cd .cache/upstream/d4e0edd01b7da2a3b43d5360156b43761438190a/input/tests/measure/CMS122FHIRDiabetesAssessGreaterThan9Percent
ls */CMS122FHIR-*.json | sed 's|.*/||' | sort | grep -i -E 'numer|nopass|noresult|missing'
```

Pick the closest match and record two things: the UUID directory name, and the bundle file name. Then read its `MeasureReport` to get the real expected counts rather than assuming them:

```bash
python3 -c "
import json,sys,glob
path = glob.glob('<uuid>/MeasureReport-*.json')[0]
report = json.load(open(path))
for group in report.get('group', []):
    for population in group.get('population', []):
        code = (population.get('code',{}).get('coding') or [{}])[0].get('code')
        print(code, population.get('count'))
"
```

Substitute the UUID, the bundle name, and the counts you read into the entry below wherever it says `<uuid>`, `<bundle-file-name>`, and the expected result list. Do not write the entry with the values left as-is: an unrun test case with invented counts is worse than no test case.

Create `knowledge/cms122/test-cases/2026-005-no-result-counts-as-numerator.md`:

```markdown
---
id: cms122-2026-005
type: test-case
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, test-data]
reporter: aks129
---

## Summary

A denominator-eligible patient with no glycemic status result in the measurement
period belongs in the numerator. This is the case first-time implementers get
wrong, and it is the one worth running first.

## Input

Referenced, not copied. The upstream repository is about 360 MB, so this corpus
points at the data rather than duplicating it.

- Repository: <https://github.com/cqframework/ecqm-content-qicore-2025>
- Commit: `d4e0edd01b7da2a3b43d5360156b43761438190a`
- Path: `input/tests/measure/CMS122FHIRDiabetesAssessGreaterThan9Percent/<uuid>/<bundle-file-name>`

Fetch it with:

```bash
curl -sL "https://raw.githubusercontent.com/cqframework/ecqm-content-qicore-2025/d4e0edd01b7da2a3b43d5360156b43761438190a/input/tests/measure/CMS122FHIRDiabetesAssessGreaterThan9Percent/<uuid>/<bundle-file-name>"
```

## Expected result

Taken from the `MeasureReport` upstream ships alongside the bundle in the same
directory, not asserted independently:

- initial-population: 1
- denominator: 1
- numerator: 1

The patient is aged 18 to 75, has an active diabetes diagnosis, and has no
qualifying HbA1c or GMI observation in the measurement period. The measure
counts a missing result as poor control, so the numerator is 1 and not 0.

## Why this one

Logic written as "numerator = patients with a result above 9%" passes every
test with a result and fails only this one. See
[`cms122-2026-001`](../2026-001-missing-hba1c-counts-as-poor-control.md) for
the reasoning behind the behaviour.

## Status

Open: referenced but not yet executed by any tooling in this repository.
Reference execution against a cohort is out of scope until the deep validator
subsystem exists. Recording the case now means it is ready when execution is.
```

- [ ] **Step 5: Write the versioning entry**

Create `knowledge/cms122/2026-006-draft-versioning-of-seeded-packages.md`:

```markdown
---
id: cms122-2026-006
type: implementation-note
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: resolved
categories: [measure-metadata, packaging]
reporter: aks129
---

## Summary

Seeded packages carry a `0.x` version, not the CMS measure number. A reader
expecting `13.0.0` for CMS122v13 will not find it, and that is deliberate.

## Detail

The upstream FHIR `Measure` resource carries `version: 0.5.000` and no CMS
measure version anywhere. Its identifiers are a short name `CMS122FHIR` and a
`cmsId` of `122FHIR`. There is no `v13`.

Open Quality therefore publishes the upstream version, normalised to canonical
semver as `0.5.0`. Two reasons:

1. It is what the source says. Deriving `13.0.0` from the eCQM numbering would
   assert that this FHIR translation corresponds to published QDM measure
   version 13, which upstream does not claim and which no check could verify.
2. Upstream calls this content draft. A `0.x` version says so in the one field
   every consumer already reads.

The CMS identifier is not lost: it is in `measure.identifiers` as `CMS122FHIR`,
which is where a search for the measure will look.

## Resolution

Resolved as a documented convention. If upstream later publishes a resource
carrying a CMS measure version, the importer should prefer it and this entry
should be superseded rather than edited.
```

- [ ] **Step 6: Write the dependency drift entry**

Create `knowledge/cms122/2026-007-vendored-library-duplication.md`:

```markdown
---
id: cms122-2026-007
type: interpretation-issue
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: open
categories: [packaging, cql]
reporter: aks129
---

## Summary

Every package vendors the CQL libraries its measure includes, so the same library
file appears in many packages. Different packages can carry different versions of
the same library, and nothing in the corpus surfaces that.

## Detail

`CMS122FHIRDiabetesAssessGreaterThan9Percent.cql` includes seven libraries:

```
include FHIRHelpers version '4.4.000' called FHIRHelpers
include QICoreCommon version '4.0.000' called QICoreCommon
include AdvancedIllnessandFrailty version '1.27.000' called AIFrailLTCF
```

Those files are copied into the package's own `cql/` directory and declared as
artifacts. The package is then complete: it can be read and evaluated without
fetching anything else. That is deliberate, and it is why the alternative was
rejected. Publishing each shared library as its own package would have required a
`measure.title` for something that is not a measure, which Level 1 demands.

The cost is duplication, and duplication hides disagreement. Two measures can
include the same library at different versions, and a reader comparing them will
not notice unless they look. Check the current state with:

```bash
for f in $(find measures -name '*.cql'); do
  basename "$f" .cql | tr '\n' ' '
  head -1 "$f" | sed -E "s/.*version '([^']*)'.*/\1/"
done | sort -u | awk '{print $1}' | uniq -d
```

Any library name printed by that command exists at more than one version in the
corpus.

## Why this is recorded rather than fixed

Two measures legitimately built against different versions of a shared library
are not in conflict. Forcing them onto one version would change measure logic to
serve tidiness, which is the wrong trade. The gap is that the disagreement is
invisible, not that it exists.

Upstream has the same question and answers it differently, by shipping every
library version in one flat directory. A package registry cannot do that.

## Resolution

Open. The likely answer is a report rather than a rule: the importer could list
libraries carried at more than one version, the way `import-report.md` lists
skips. Nothing is decided.
```

- [ ] **Step 7: Correct the existing entry**

The existing `knowledge/cms122/2026-001-missing-hba1c-counts-as-poor-control.md` points at `cms/diabetes-hba1c-poor-control` version `13.0.0`. That package no longer exists: Task 13 replaced it. Update the front matter:

```yaml
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
```

Then add this paragraph at the end of the `## Resolution` section:

```markdown
Repointed on 2026-08-01 from `cms/diabetes-hba1c-poor-control` version 13.0.0,
which was a hand-written package that disagreed with the upstream content on
steward, version and title. See [`cms122-2026-003`](2026-003-measure-renamed-and-retitled.md).
The measure now also accepts a glucose management indicator result, so the
no-result branch this entry describes must consider both.
```

- [ ] **Step 8: Verify every entry points at a package that exists**

Run:

```bash
for id in $(grep -h '^measure:' knowledge/*/*.md | awk '{print $2}' | sort -u); do
  slug="${id#*/}"
  ls -d measures/*/"$slug" > /dev/null 2>&1 || echo "DANGLING: $id"
done
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add knowledge/
git commit -m "docs(knowledge): add corpus entries from the seed import"
```

---

## Task 20: Update the project status

The README's status table still says the registry is the next thing and that local validation stops at Level 1. Both changed.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the status table**

In `README.md`, replace the `Deep validators` row and add a row, so the table reads:

```
| Package format | shipped | Manifest schema, conformance levels, license policy, content scanning, provenance |
| Validation core | shipped | Validates a package directory and computes its level |
| `oq` CLI | shipped | `oq validate`, `oq validate-all` and `oq pack` |
| Seed corpus | shipped | ~53 CC0 eCQM packages imported from cqframework, with a CI drift check |
| Deep validators | next | CQL to ELM, FHIR profile validation, SQL parsing, VSAC resolution |
| Registry | planned | Publish, search, install |
| Typed feedback | planned | Questions, interpretation issues, defect reports, implementation notes |
```

- [ ] **Step 2: Correct the local validation note**

Replace:

```
Local validation stops at Level 1. Level 2 needs the deep validators.
```

with:

```
Local validation stops at Level 1, and so does the seeded corpus. Level 2 needs
the deep validators, which do not exist yet.
```

- [ ] **Step 3: Update the try-it section**

Replace the `pnpm test` line's comment and the validate example with:

```bash
pnpm install
pnpm test
pnpm oq validate-all measures/cms-fhir-2026
```

Remove the stale `# 91 tests` comment: the count changed in this plan and a hardcoded number in a README goes stale on the next commit. Do the same in `CONTRIBUTING.md`, which also says `pnpm test # 91 tests`.

- [ ] **Step 4: Add the terminology policy to the repository map**

Add this row to the repository map table:

```
| [`TERMINOLOGY.md`](TERMINOLOGY.md) | Which code systems may be redistributed, and with or without display text |
```

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm oq validate-all measures/cms-fhir-2026 measures/community`
Expected: tests pass, `0 below Level 1`.

- [ ] **Step 6: Commit**

```bash
git add README.md CONTRIBUTING.md
git commit -m "docs: update status for the seed corpus and CQL translation"
```

---

## Definition of done

- [ ] `pnpm test` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm oq validate-all measures/cms-fhir-2026 measures/community` reports `0 below Level 1`.
- [ ] Every imported package contains every CQL library its measure includes, so it validates standalone.
- [ ] `pnpm oq-import 2026-08-01 && git diff --exit-code -- measures/` produces no diff.
- [ ] `grep -rn 'from "CPT"' measures/ | grep display` produces no output.
- [ ] `measures/import-report.md` accounts for every upstream measure, imported or skipped.
- [ ] At least one measure exists both as CQL and as a SQL-on-FHIR ViewDefinition.
- [ ] Every `measure:` in `knowledge/` resolves to a package that exists.
- [ ] At least six hand-written knowledge corpus entries exist, including one `test-case` that references upstream data by path and commit rather than copying it.
- [ ] The CI workflow has run green on a pull request.

## Known deferrals

These are out of scope by design. Do not add them.

- The whole deep validator subsystem: `cql.translate`, `fhir.validate`, `sql.parse` and VSAC resolution. Every package in the corpus therefore sits at Level 1, which is the honest result. See the note on Task 17.
- The CPT-to-SNOMED substitution table. Stripping display descriptors makes the corpus clean without it, and no free redistributable AMA cross map has been confirmed.
- Tuva Health content. Recorded in the spec with the reasoning.
- The hosted registry, publishing, and search.

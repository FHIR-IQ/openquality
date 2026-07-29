# Open Quality

An open registry for healthcare quality measures.

Publish a measure in CQL, SQL, or SQL-on-FHIR. The registry validates it and the
community reviews it. Today every organization that does quality measurement
rebuilds the same logic on its own, then pays auditors to confirm it is right.

Site: https://openquality.vercel.app

## Status

Pre-launch. The package format and the validation core work. The registry does not
exist yet.

| Piece | State | What it is |
|-------|-------|------------|
| Package format | shipped | Manifest schema, conformance levels, license policy, content scanning |
| Validation core | shipped | Validates a package directory and computes its level |
| `oq` CLI | shipped | `oq validate` and `oq pack` |
| Deep validators | next | CQL to ELM, FHIR profile validation, SQL parsing, VSAC resolution |
| Registry | planned | Publish, search, install |
| Typed feedback | planned | Questions, interpretation issues, defect reports, implementation notes |

Local validation stops at Level 1. Level 2 needs the deep validators.

## Try it

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm test                                              # 91 tests
pnpm oq validate packages/core/test/fixtures/cms122    # a real CMS eCQM
```

Expected output:

```
Level 1 (Described)

To reach the next level:
  - cql.translate did not run

Note: cql.translate, fhir.validate, and sql.parse run on publish, not locally.
```

## What a package looks like

A package is a directory with an `openquality.yaml` manifest and the artifacts the
manifest declares.

```yaml
id: cms/diabetes-hba1c-poor-control
version: 13.0.0
license: CC0-1.0
measurementPeriod: 2026
measure:
  title: "Diabetes: Hemoglobin A1c Poor Control (> 9%)"
  steward: CMS
  identifiers: [CMS122v13, NQF-0059]
dataModel: fhir-r4
artifacts:
  - path: cql/DiabetesHemoglobinA1cPoorControl.cql
    type: cql
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
```

A package references value sets by OID and never embeds the expansions. This keeps
VSAC and CPT licensed content out of the artifact, so the file is safe to publish.

`dataModel` is what makes shared SQL usable by anyone other than its author. SQL
written against an undeclared warehouse schema is unreadable to a stranger.

## Conformance levels

Levels measure rigor, not FHIR adoption. A SQL-only package can reach the top.
Most organizations doing quality measurement write SQL against a warehouse, not
CQL. A level system that required FHIR to reach the top would exclude them.

- **Level 0, Shared.** Valid manifest, open license, at least one artifact. Any language.
- **Level 1, Described.** Declared data model, typed artifacts, resolvable value sets, and a README stating intent, known limitations, and provenance.
- **Level 2, Verified.** Deep validation passes for every artifact. CQL translates to ELM. FHIR resources validate against the CRMI and ECR profiles. SQL parses against its declared dialect and ships its schema.

## Content policy

Open licenses only. No HEDIS logic. No CPT codes. No redistributed VSAC expansions.

NCQA holds copyright on the HEDIS specifications, so that logic cannot be published
here. You can publish your own implementation written against a public
specification. You can also publish test cases and review comments, which is often
the part an employer will approve releasing even when they will not release the SQL.

The forbidden content scanner is a heuristic first filter. It will miss things and
it will produce false positives. It is backed by a takedown process, not presented
as a guarantee.

## Packages

| Package | What it does |
|---------|--------------|
| `@openquality/core` | Manifest schema, validation checks, conformance levels, deterministic packing |
| `@openquality/cli` | The `oq` command |

Seven of the nine core modules are pure and browser-safe. `validate` and `pack` use
`node:fs`, so importing the package root pulls Node-only code into a browser bundle.
A browser-safe subpath export is planned.

## Docs

- [Design spec](docs/superpowers/specs/2026-07-27-openquality-registry-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-27-package-format-and-validation-core.md)

## Not a measure steward

Open Quality is not a measure steward and is not affiliated with or endorsed by CMS,
NCQA, or HL7. Seeded content is redistributed from public sources with provenance
stated on each package.

## License

MIT. See [LICENSE](LICENSE).

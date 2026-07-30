# Open Quality

An open, community-owned corpus of healthcare quality measures — and a shared record
of what the community has learned about each one.

Publish a measure in CQL, SQL, or SQL-on-FHIR. Everything is validated, versioned, and
open for review. Alongside the measures sits the part that usually gets lost: a typed
record of interpretation questions, defects, and test cases, attached to the measure and
pinned to a version.

Site: https://openquality.vercel.app

## Why this exists

Quality measurement is rebuilt from scratch inside every organization that does it.
Payers, health systems, and vendors each staff teams to implement the same national
measures against their own data, then pay auditors to certify the result. The same
ambiguities in the same specifications are rediscovered independently, the code is
almost never shared, and what one team learned about a measure never reaches the next.

There is no common unit for exchanging measure logic, and no shared place to record what
the community has figured out. Open Quality is an attempt at both — a package format
anyone can publish, and a knowledge corpus anyone can read.

This is early and honest about it. The package format and the validation core work; the
hosted registry does not exist yet. See [Status](#status).

## How this fits the ecosystem

Open Quality is not another measure engine and not a competitor to the tools people
already rely on. It is the open corpus and community layer that sits alongside them.

- **[cqframework](https://github.com/cqframework)** builds the CQL language, the
  translator, the execution engines, and the annual eCQM/dQM content. Open Quality reuses
  that tooling and shared libraries rather than reinventing them, and points its content
  at the same connectathons.
- **[HL7 CRMI](https://build.fhir.org/ig/HL7/crmi-ig/)** (Canonical Resource Management
  Infrastructure) defines how knowledge artifacts are packaged, versioned, and moved
  through a lifecycle. Open Quality's package format maps onto CRMI so a package can be
  emitted as a CRMI artifact bundle and consumed by CRMI-aware tooling. See
  [`spec/`](spec/).
- **Reason Health / ReasonHub** and other CRMI-native platforms are authoring and
  syndication systems. Open Quality is deliberately the *open, public-good* end of the
  same space, and aims to interoperate, not overlap.

What Open Quality adds that isn't already covered: radical openness, first-class support
for **SQL and SQL-on-FHIR** (not just FHIR-canonical artifacts), and the
[knowledge corpus](#the-knowledge-corpus) of interpretation issues.

## Status

Pre-launch.

| Piece | State | What it is |
|-------|-------|------------|
| Package format | shipped | Manifest schema, conformance levels, license policy, content scanning |
| Validation core | shipped | Validates a package directory and computes its level |
| `oq` CLI | shipped | `oq validate` and `oq pack` |
| Deep validators | next | CQL to ELM, FHIR profile validation, SQL parsing, VSAC resolution |
| Registry | planned | Publish, search, install |
| Typed feedback | planned | Questions, interpretation issues, defect reports, implementation notes |

Local validation stops at Level 1. Level 2 needs the deep validators.

## Repository map

This is a single repository, laid out so the intent is legible at a glance.

| Path | What lives here |
|------|-----------------|
| [`spec/`](spec/) | The package format, the conformance levels, and the CRMI mapping |
| [`measures/`](measures/) | Measure package collections, indexed by data model and year |
| [`knowledge/`](knowledge/) | The interpretation-issue corpus — questions, defects, and test cases per measure |
| `packages/` | The tooling: `@openquality/core` and the `oq` CLI |
| `site/` | The openquality.vercel.app front end |
| `docs/` | Design specs and implementation plans |

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

A package references value sets by OID and never embeds the expansions. This keeps VSAC
and CPT licensed content out of the artifact, so the file is safe to publish.

`dataModel` is what makes shared SQL usable by anyone other than its author. SQL written
against an undeclared warehouse schema is unreadable to a stranger.

## Conformance levels

Levels measure rigor, not FHIR adoption. A SQL-only package can reach the top. Most
organizations doing quality measurement write SQL against a warehouse, not CQL. A level
system that required FHIR to reach the top would exclude them.

- **Level 0, Shared.** Valid manifest, open license, at least one artifact. Any language.
- **Level 1, Described.** Declared data model, typed artifacts, resolvable value sets, and
  a README stating intent, known limitations, and provenance.
- **Level 2, Verified.** Deep validation passes for every artifact. CQL translates to ELM.
  FHIR resources validate against the CRMI and QI-Core profiles. SQL parses against its
  declared dialect and ships its schema.

Full definitions, including the CRMI mapping, are in [`spec/`](spec/).

## The knowledge corpus

The measures are half the value. The other half is what the community learns about them.

[`knowledge/`](knowledge/) holds typed feedback attached to a measure and pinned to a
version — a question, an interpretation issue, a defect report, an implementation note, or
a validation result. "Known interpretation issues for CMS122" becomes a query instead of
an archaeology project.

This is also the contribution an employer will often approve when they will not approve
releasing the SQL itself. The schema is built as a machine-readable superset of the
categories in the [ONC eCQM Issue Tracker](https://oncprojectracking.healthit.gov/support/projects/CQM/summary),
so the corpus is continuous with where implementers already file questions.

## Content policy

Open licenses only. No HEDIS logic. No CPT codes. No redistributed VSAC expansions.

NCQA holds copyright on the HEDIS specifications, so that logic cannot be published here.
You can publish your own implementation written against a public specification. You can
also publish test cases and review comments, which is often the part an employer will
approve releasing even when they will not release the SQL.

The forbidden content scanner is a heuristic first filter. It will miss things and it will
produce false positives. It is backed by a takedown process, not presented as a guarantee.

## Get involved

Community is the point. There are three ways in, and none of them require you to publish
code:

1. **Publish a measure package.** See [CONTRIBUTING](CONTRIBUTING.md).
2. **File an interpretation issue or a test case** against a measure in
   [`knowledge/`](knowledge/). This is the highest-value, lowest-friction contribution.
3. **Review** what others have published.

The measure and clinical-reasoning community mostly gathers on the FHIR Zulip
([`#cql`](https://chat.fhir.org/#narrow/stream/179220-cql)) and in the HL7 Clinical
Quality Information work group. We show up there too.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) and the [Governance](GOVERNANCE.md)
model. Governance is worth a look up front: Open Quality is founded and stewarded by
FHIR IQ today, with a written commitment to broaden to community governance as it grows.

## Not a measure steward

Open Quality is not a measure steward and is not affiliated with or endorsed by CMS, NCQA,
or HL7. Seeded content is redistributed from public sources with provenance stated on each
package.

## License

MIT. See [LICENSE](LICENSE).

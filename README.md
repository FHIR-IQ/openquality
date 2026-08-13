# Open Quality

An open corpus of healthcare quality measures, and a shared record of what
implementers have learned about each one. Founder-stewarded today, with a written
commitment to community governance as it grows; see [GOVERNANCE](GOVERNANCE.md)
and [VISION](VISION.md).

Publish a measure in CQL, SQL, or SQL-on-FHIR. Everything is validated, versioned, and
open for review. Alongside the measures sits the part that usually gets lost: a typed
record of interpretation questions, defects, and test cases, attached to the measure and
pinned to a version.

Site: https://openquality.us

## Why this exists

Quality measurement is rebuilt from scratch inside every organization that does it.
Payers, health systems, and vendors each staff teams to implement the same national
measures against their own data, then pay auditors to certify the result. The same
ambiguities in the same specifications get rediscovered independently, the code is rarely
shared, and what one team learns about a measure rarely reaches the next.

There is no common unit for exchanging measure logic, and no shared place to record what
the community has figured out. Open Quality is an attempt at both: a package format
anyone can publish, and a knowledge corpus anyone can read.

The goal is an open marketplace for measure logic. Somewhere to find a measure, see what
other implementers already learned about it, and take the artifacts, without a vendor
contract, a licensing negotiation, or knowing the right person to ask. Today a researcher
or a small team has none of those things, and pays for access or goes without.

Browsing and downloading work now, through the [library](https://openquality.us/library),
a machine-readable [catalogue](https://openquality.us/index.json), and git. Publishing
still goes through a pull request. See [Status](#status).

### Who this is for

Today, getting an answer about a measure depends on knowing the right person.

A recent example. A PhD candidate wrote a Hospital at Home eligibility library that ran
at 30 to 40 seconds per patient. He could not tell whether the cause was his logic, his
engine, or his data. Someone made an introduction to an engineer who had spent years
optimizing CQL. That engineer explained it in one email: defines cache, functions do not,
every retrieve iterates the whole bundle. The library now runs in under a second, and
returns the same results.

That answer existed because of one introduction. It is not searchable, it is not attached
to a measure, and the next person will not find it.

Most people doing this work are not on Zulip, do not attend connectathons, hold no NCQA
support contract, and do not work at an insurer with a staff of analysts. As quality
measurement moves from manual abstraction to digital, they need somewhere to go that does
not depend on who they happen to know.

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
  through a lifecycle. That is the interoperability target, and Open Quality tracks it
  rather than inventing a parallel model. **No CRMI emitter exists yet.** What exists
  today is `oq fhir-package`, which emits a FHIR NPM package that CQL Studio, the FHIR
  package registry, and IG Publisher already read.

  Format is deliberately not the product. Open Quality aims to ingest whatever standard
  format a tool already emits, so nobody has to adopt anything of ours to publish here.
  What is missing from the ecosystem is not another way to package a measure. It is an
  open place to find one. See [`spec/`](spec/).
- **Reason Health / ReasonHub** and other CRMI-native platforms are authoring and
  syndication systems. Open Quality is deliberately the *open, public-good* end of the
  same space, and aims to interoperate, not overlap.
- **[The FHIR package registry](https://registry.fhir.org)** distributes FHIR conformance
  artifacts, and does that well. It answers "where do I get this package." It is not built
  to answer "why is this measure slow," "does a missing HbA1c count as poor control," or
  "how did someone else read this denominator." Different problem, not a smaller one.
- **[NCQA's Digital Quality Implementers Community](https://www.ncqa.org/digital-quality-implementers-community/)**
  (DQIC) is a consensus effort focused, in NCQA's own description, first on *CQL engines*,
  with other tooling and languages as future work. Engines are well covered. Measures and
  analytics practice are not.

What Open Quality adds that isn't already covered: radical openness, first-class support
for **SQL and SQL-on-FHIR** (not just FHIR-canonical artifacts), and the
[knowledge corpus](#the-knowledge-corpus) of interpretation issues.

Being open source is also what makes the corpus possible. There is no HEDIS license to
negotiate and no legacy vendor to pay for the right to discuss a measure in public.

## Status

Pre-launch.

| Piece | State | What it is |
|-------|-------|------------|
| Package format | shipped | Manifest schema, conformance levels, license policy, content scanning, provenance |
| Validation core | shipped | Validates a package directory and computes its level |
| `oq` CLI | shipped | `oq validate`, `oq validate-all`, `oq pack`, `oq fhir-package` |
| Seed corpus | shipped | 52 CC0 eCQM packages imported from cqframework, with a CI drift check |
| Deep validators | next | CQL to ELM, FHIR profile validation, SQL parsing, VSAC resolution |
| Registry | planned | Publish, search, install |
| Registry-hosted feedback | planned | The [`knowledge/`](knowledge/) corpus, searchable and writable from a web UI instead of a pull request |

Local validation stops at Level 1, and so does the seeded corpus. Level 2 needs
the deep validators, which do not exist yet.

## Repository map

This is a single repository, laid out so the intent is legible at a glance.

| Path | What lives here |
|------|-----------------|
| [VISION.md](VISION.md) | The problem, the mission, and the next year's goals |
| [`spec/`](spec/) | The package format, the conformance levels, and the CRMI mapping |
| [`measures/`](measures/) | Measure package collections, indexed by data model and year |
| [`knowledge/`](knowledge/) | The interpretation-issue corpus — questions, defects, and test cases per measure |
| [`TERMINOLOGY.md`](TERMINOLOGY.md) | Which code systems may be redistributed, and with or without display text |
| `packages/` | The tooling: `@openquality/core` and the `oq` CLI |
| `site/` | The openquality.us front end |
| `docs/` | Design specs and implementation plans |

## Try it

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm test
pnpm oq validate-all measures/cms-fhir-2026
```

Expected output:

```text
Checked 52 packages, 0 below Level 1
```

## Reading the corpus from a tool

There is no registry server, and a tool that wants to list or fetch packages does not
need one. The whole read interface is one static document:

```text
https://openquality.us/index.json
```

No credentials, no OAuth, no host for anyone to run. It lists every package with its
id, version, steward, data model, licence, conformance level, and the repository paths
of its manifest and artifacts, plus every knowledge entry. A client reads it, decides
what it wants, and fetches those paths from the `raw` base URL the document names.

The conformance level in that file is computed by running the same validator
`oq validate` runs, not asserted, and CI fails if the file drifts from the corpus it
describes.

`ref` is `main`, which moves. Pin a commit or tag and substitute it into `raw` if you
need the same bytes twice.

## Using a measure in CQL Studio or another FHIR tool

A package can be emitted as a FHIR NPM package, which is the format CQL Studio
loads, the FHIR package registry serves, and IG Publisher produces:

```bash
pnpm oq fhir-package measures/cms-fhir-2026/diabetes-glycemic-status-assessment-greater-than-9
```

Each CQL file becomes a `Library` resource carrying the CQL as a `text/cql`
attachment, with its `include` statements stated as `depends-on`. FHIR resources
the package already holds, such as a SQL-on-FHIR `ViewDefinition`, are packaged
as they are.

The resources are marked `experimental` and their canonical URLs point at
`openquality.us` rather than at the measure steward, because a repackaged copy is
not an authoritative publication of the logic. The tarball is byte-for-byte
reproducible, so its digest addresses its content.

## What a package looks like

A package is a directory with an `openquality.yaml` manifest and the artifacts the
manifest declares.

```yaml
id: cms/diabetes-glycemic-status-assessment-greater-than-9
version: 0.5.0
license: CC0-1.0
measurementPeriod: 2026
measure:
  title: "Diabetes: Glycemic Status Assessment Greater Than 9%"
  steward: National Committee for Quality Assurance
  identifiers: [CMS122FHIR]
dataModel: qi-core
artifacts:
  - path: cql/CMS122FHIRDiabetesAssessGreaterThan9Percent.cql
    type: cql
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.198.12.1013
    url: http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013
    source: vsac
```

Trimmed from the real package in
[`measures/cms-fhir-2026/diabetes-glycemic-status-assessment-greater-than-9/`](measures/cms-fhir-2026/diabetes-glycemic-status-assessment-greater-than-9/),
which declares nine artifacts and nine value sets in full.

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

Open licenses only. No HEDIS logic. No redistributed VSAC expansions. No CPT
display descriptors, which are AMA licensed; a CPT code and code system may be
referenced. Full rules per code system are in [TERMINOLOGY](TERMINOLOGY.md).

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

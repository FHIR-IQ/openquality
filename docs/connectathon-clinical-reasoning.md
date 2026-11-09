# Open Quality at a Clinical Reasoning connectathon

A proposed scenario for the HL7 Clinical Reasoning track, written after Bryn Rhodes
offered to add one. It is written to be useful rather than decorative: the point is to
find out what breaks, not to demonstrate that something works.

## What this tests

**Can a measure published with no server be consumed by CRMI-aware tooling?**

Open Quality distributes over git and static files. There is no repository service: no
`$package` operation, no `$data-requirements`, no search API. What there is is the
artifacts those operations would return, emitted as files.

If that is enough for existing tooling, then publishing a measure openly costs nobody a
server. If it is not enough, this scenario finds out exactly where, which is the more
useful result.

## Preconditions

54 measure packages are published, 52 of them CC0 eCQMs imported from
[cqframework/ecqm-content-qicore-2025](https://github.com/cqframework/ecqm-content-qicore-2025)
at a pinned commit, plus 17 shared library packages those measures depend on. Every
measure package carries:

- a FHIR `Measure` resource
- the measure's own CQL, with the shared libraries it includes listed as dependencies
- a manifest with provenance stating whether the content is `unmodified` or `derived`,
  and naming exactly what changed

Two output forms, built from one list of resources so they cannot disagree. Both
resolve dependencies transitively and include every library package the measure depends
on. For 17 measures that is not the exact version their CQL includes (see Scenario 2):

```bash
pnpm oq fhir-bundle <package-dir>    # CRMI artifact Bundle, the $package shape
pnpm oq fhir-package <package-dir>   # FHIR NPM .tgz
```

The catalogue is at `https://openquality.us/index.json`. Nothing needs installing to read
it.

## Scenario 1: load and evaluate a published measure

**Roles:** a Consumer (any CQL engine or measure evaluator) and the Repository (static
files).

1. Read the catalogue and select a measure.
2. Fetch the package and emit the CRMI artifact Bundle.
3. Load the Bundle. The first entry is an `asset-collection` Library with a `composed-of`
   reference to the measure's own artifacts and a `depends-on` reference to each shared
   library it carries.
4. Evaluate the measure against your own test patients.

**What we want to learn**

- Does the Bundle load without hand-editing? If not, what is missing?
- Are the `depends-on` relationships between libraries sufficient to resolve them?
- Is `experimental: true` on the Library resources a problem for any consumer? It is set
  deliberately, because these are repackaged copies, not authoritative publication.
- Canonical URLs point at `openquality.us`, not at the steward, for the same reason. Does
  that break resolution anywhere?

**What would count as failure, and be worth more than success:** a consumer that cannot
load the Bundle, or that resolves a canonical to the wrong artifact.

## Scenario 2: shared libraries resolved across tools

Bryn Rhodes reports that CRMI supports shared libraries and that the tooling does too,
from authoring in VS Code, CQL Studio and MADiE through at least the HAPI reference
implementation. This scenario tests that at the scale of a full measure set.

The 52 CMS measures depend on 17 shared library packages (`FHIRHelpers`,
`QICoreCommon`, `SupplementalDataElements` and 14 more), each published once. A measure
names the libraries it includes directly; the libraries name theirs. Until 2026-10-12
every measure carried its own copy instead: 301 CQL files for 69 distinct libraries.

1. Load the 17 library packages into the tool.
2. Load measures one at a time, without their dependencies bundled, and let the tool
   resolve each `depends-on` against what is already loaded.
3. Load two measures that share libraries into one environment, and check each resolves
   to the one copy.
4. Evaluate a measure loaded this way and compare the result with the same measure loaded
   from its self-contained bundle.

**What we want to learn:** which tools resolve shared libraries by canonical and version
on their own, which need the dependencies bundled, and where they disagree. Every
difference is a finding, recorded against the measure and version under Scenario 3.

**The first thing to test is a known mismatch.** 17 of the measures, as published
upstream, include an older version of a shared library than upstream publishes: for
example nine includes of `Status version '1.13.000'` where only Status 1.15.000 exists in
`input/cql`. The importer resolved each by name to the newer library, so their bundles
carry Status 1.15.000. A tool that resolves by name will load them; a tool that requires
the exact version will not. Which tools do which is unknown, because nothing here runs a
translator. The full list is
[`corpus-2026-008`](../knowledge/corpus/2026-008-included-library-versions-not-published.md),
and `pnpm oq validate-all measures/cms-fhir-2026` prints it.

The change behind this was ours to make: Level 1 used to require a measure title, so a
library-only package had no valid shape. Recorded and resolved as `corpus-2026-002`.

## Scenario 3: record what broke

The part that does not exist elsewhere, and the reason the corpus is worth having.

Anything found in scenarios 1 or 2 becomes a typed entry: an interpretation issue, a
defect, or a test case, attached to a measure and pinned to a version. Filing needs a
GitHub account and nothing else, and every measure in the
[library](https://openquality.us/library) links to the four forms with the measure and
version already filled in.

Connectathon findings currently live in issues spread across per-measure repositories,
which is the archaeology problem this corpus exists to fix. Entries can cross-reference
those rather than copy them, so the answer stays where the measure developers work.

**A test case contributed here is the highest-value artifact,** because it is the one
thing that can be re-run rather than re-read.

## Scenario 4: author against the CMS QMD patterns, and contribute back

Proposed by Bryn Rhodes for the track: an authoring scenario that uses the Open Quality
repository and contributes back to it, applying the authoring patterns in the
[CMS FHIR Quality Measure Development IG](https://build.fhir.org/ig/cqframework/cms-qmd/patterns.html)
(`cms.fhir.qmd`, 0.8.0 continuous build, on US Core 6.1.0 and US Quality Core 0.5.0).

**Roles:** an Author (VS Code CQL, CQL Studio or MADiE), the Repository (Open Quality),
and a Reviewer (any participant).

1. **Find.** Pick a measure from the catalogue or through the MCP server
   (`get_measure`, `known_issues`), and pull its CQL, its shared library dependencies,
   and the interpretation issues already recorded against it.
2. **Author.** Bring one measure in line with the patterns, or author a new one with
   them: the US Quality Core model with its version, model-qualified retrieves, status
   functions on every retrieve, `~` for direct-reference codes and `in` for value sets,
   explicit `day of` precision, and calendar durations where the intent is calendar
   time.
3. **Test.** Add test cases for the populations the change touches.
4. **Contribute back.** Open a pull request to Open Quality with the result as a new
   package version. The package is `derived` and its manifest names each change. The
   validator comments on the pull request, so no local tooling is needed.
5. **Record what the patterns did not settle.** A pattern that needed judgment, or that
   two authors applied differently, becomes an interpretation issue against the measure
   and version, citing the pattern. These go back to the cms-qmd IG as issues.

**Baseline, measured 2026-11-09** over the 70 CQL files in the corpus:

| Pattern | Today |
|---|---|
| Model declaration includes a version (SHALL) | all 70 files. 68 declare `QICore` 6.0.0, 5 `USCore` 6.1.0, 2 `FHIR` 4.0.1 |
| No string-based membership testing (SHOULD NOT) | none found |
| No `contains` on terminology-valued elements | none found |
| Retrieves qualified with the model name (best practice when a library uses more than one model) | none of 662 retrieves. 5 files declare two models, and hold 125 of them |
| Authored against US Quality Core | no file |

So the work is mostly the model move from QI-Core 6.0.0 to US Quality Core 0.5.0 and
what follows from it, not cleanup of the CQL already there. These are text matches over
the CQL, with comments and the contents of strings and quoted identifiers removed (so a
unit like `'mm[Hg]'` is not read as a retrieve), not a translation. A pattern that only
shows up after translation is not counted. An earlier count of 744 retrieves had matched
brackets inside comments, units and code names. `pnpm oq validate <package>` reports the
same checks for one package.

**What we want to learn**

- Which patterns an author can apply mechanically, and which need a judgment the IG does
  not yet make.
- Whether US Quality Core 0.5.0 and its derived ModelInfo work the same way in each
  authoring tool.
- What a repository has to check to accept pattern-conformant contributions from people
  it has never met.

**What Open Quality changed for this scenario**

- A package can declare `dataModel: us-quality-core`, and its FHIR npm package depends
  on `fhir.onc.us-quality-core`
  ([#21](https://github.com/FHIR-IQ/openquality/issues/21)). Declaring US Core as a
  dependency as well is still open
  ([#24](https://github.com/FHIR-IQ/openquality/issues/24)).
- The validator reports the patterns it can read from CQL text, as check
  `cql.patterns` ([#22](https://github.com/FHIR-IQ/openquality/issues/22)): a model
  declaration without a version, string-based membership and `contains` on a
  terminology-valued element are warnings. Unqualified retrieves are one info line per
  file, and only in a library that declares more than one model, which is where the IG
  calls qualifying a best practice. None of them changes a package's level or blocks a
  pull request.

## Known limitations, stated up front

- **Level 2 is unreachable.** `cql.translate`, `fhir.validate` and `sql.parse` are named
  in the code and unimplemented, so every package sits at Level 1. Nothing here claims
  its CQL translates.
- **No repository service.** Artifacts only.
- **17 measures include library versions the corpus does not carry.** Inherited from
  upstream and reported as a warning, not fixed. See Scenario 2.
- **Licensed content is stripped.** Six measures are `derived` because AMA-licensed CPT
  descriptors were removed from twelve codes, in both the CQL and the `Measure` resource.
  The code and code system are kept; only the display text is gone. See
  [TERMINOLOGY.md](../TERMINOLOGY.md).
- **No HEDIS logic, ever.** NCQA licensing excludes it permanently.
- **Not a measure steward.** Not affiliated with or endorsed by CMS, NCQA or HL7.

## What we need from the track

1. One consumer willing to load a Bundle and say what broke.
2. Shared libraries loaded once and resolved by more than one tool, with the differences
   written down.
3. Anything found, recorded as an entry rather than a hallway conversation.
4. Authors willing to apply the CMS QMD patterns to one measure and open a pull request.

Contact: open an issue on [the repository](https://github.com/FHIR-IQ/openquality/issues),
or find us on FHIR Zulip [`#cql`](https://chat.fhir.org/#narrow/stream/179220-cql).

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

54 packages are published, 52 of them CC0 eCQMs imported from
[cqframework/ecqm-content-qicore-2025](https://github.com/cqframework/ecqm-content-qicore-2025)
at a pinned commit. Every package carries:

- a FHIR `Measure` resource
- the measure CQL, plus every library it includes, vendored
- a manifest with provenance stating whether the content is `unmodified` or `derived`,
  and naming exactly what changed

Two output forms, built from one list of resources so they cannot disagree:

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
   reference to every other entry.
4. Evaluate the measure against your own test patients.

**What we want to learn**

- Does the Bundle load without hand-editing? If not, what is missing?
- Are the `depends-on` relationships between libraries sufficient to resolve them, given
  every library is vendored in the same package?
- Is `experimental: true` on the Library resources a problem for any consumer? It is set
  deliberately, because these are repackaged copies, not authoritative publication.
- Canonical URLs point at `openquality.us`, not at the steward, for the same reason. Does
  that break resolution anywhere?

**What would count as failure, and be worth more than success:** a consumer that cannot
load the Bundle, or that resolves a canonical to the wrong artifact.

## Scenario 2: the vendoring problem

This is the known weak point, and the scenario exists to put numbers on it.

Every package vendors the libraries its measure includes. Across the 52 CMS packages that
is 301 CQL files under 69 distinct names, 232 of them redundant copies. `FHIRHelpers`,
`QICoreCommon` and `SupplementalDataElements` each appear in all 52.

Measured: every shared library name currently resolves to exactly one content hash, so
the copies have not diverged. That is a fact about today, not a guarantee.

1. Load two packages that share a library into the same environment.
2. Observe what happens with two `Library` resources of the same name and version.

**What we want to learn:** whether vendoring is merely wasteful or actually breaks
resolution when two packages meet in one tool. The answer decides how urgent the fix is.

The root cause is ours: Level 1 requires measure identity, including a title, and a shared
library is not a measure, so there was no legal shape for a library-only package. Recorded
as `corpus-2026-002`.

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

## Known limitations, stated up front

- **Level 2 is unreachable.** `cql.translate`, `fhir.validate` and `sql.parse` are named
  in the code and unimplemented, so every package sits at Level 1. Nothing here claims
  its CQL translates.
- **No repository service.** Artifacts only.
- **Licensed content is stripped.** Six measures are `derived` because AMA-licensed CPT
  descriptors were removed from twelve codes, in both the CQL and the `Measure` resource.
  The code and code system are kept; only the display text is gone. See
  [TERMINOLOGY.md](../TERMINOLOGY.md).
- **No HEDIS logic, ever.** NCQA licensing excludes it permanently.
- **Not a measure steward.** Not affiliated with or endorsed by CMS, NCQA or HL7.

## What we need from the track

1. One consumer willing to load a Bundle and say what broke.
2. A view on whether vendoring is a real problem or a cosmetic one.
3. Anything found, recorded as an entry rather than a hallway conversation.

Contact: open an issue on [the repository](https://github.com/FHIR-IQ/openquality/issues),
or find us on FHIR Zulip [`#cql`](https://chat.fhir.org/#narrow/stream/179220-cql).

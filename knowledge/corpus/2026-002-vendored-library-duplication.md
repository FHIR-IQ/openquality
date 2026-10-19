---
id: corpus-2026-002
scope: corpus
type: implementation-note
measurementPeriod: 2026
status: resolved
categories: [packaging, cql]
reporter: aks129
---

## Summary

Every package vendors the CQL libraries its measure includes, so the same
library file is copied into many packages. The corpus has no way to say that
two copies of `FHIRHelpers.cql` are the same artifact, and a fix to a shared
library has to be applied everywhere it was copied.

## Detail

Across the 52 packages in `measures/cms-fhir-2026/`, there are 301 `.cql`
files but only 69 distinct filenames. `FHIRHelpers.cql` alone appears in all
52 packages. That is the shape of the duplication: a handful of shared
libraries, copied into most or all of the collection.

`CMS122FHIRDiabetesAssessGreaterThan9Percent.cql`, the library behind
`cms/diabetes-glycemic-status-assessment-greater-than-9`, includes seven of
them:

```
include FHIRHelpers version '4.4.000' called FHIRHelpers
include QICoreCommon version '4.0.000' called QICoreCommon
include AdvancedIllnessandFrailty version '1.27.000' called AIFrailLTCF
```

Those files are copied into the package's own `cql/` directory and declared
as artifacts. The package is then complete: it can be read and evaluated
without fetching anything else. That is deliberate, and it is why the
alternative was rejected. Publishing each shared library as its own package
would have required a `measure.title` for something that is not a measure,
which Level 1 demands.

**Checked, and today it cannot diverge.** The natural worry is that different
packages carry different versions of the same library. Measuring the current
corpus rules that out: every one of the 69 library names appears at exactly
one version across all 301 files. It is not just true today, it is
structurally guaranteed by how the importer builds a package. `resolveLibraries`
in `packages/importer/src/plan.ts` looks up each included library by name
against a `Map<string, string>` built from the upstream CQL directory, which
holds exactly one file per name. There is no second version for the importer
to choose between, so it cannot introduce one.

## Why this is recorded rather than closed

The guarantee is a property of *this* import, not of the package format. It
holds because upstream cqframework content ships one file per library name
and the importer is the only thing that writes to `measures/cms-fhir-2026/`.
Two things would break it, and neither is prevented by anything in the
corpus:

1. Upstream ships two versions of a library name in a future release (a
   in-progress migration, a deprecated-but-not-removed library). The importer
   would resolve whichever one the source map happened to hold, silently.
2. A hand-written or community package (`measures/community/`) vendors its
   own copy of a shared library, built against a different upstream version
   than the imported packages use. Nothing compares the two: they are just
   two files with the same name in different directories.

The real cost today is the duplication itself: a defect found in a vendored
library's logic (as opposed to the display-text stripping this importer
already does) has to be fixed by hand in up to 52 copies, and nothing in the
corpus would tell an author that copy 12 of 52 was missed.

## Resolution

Resolved 2026-10-12 by removing the copies rather than reporting on them.

Each of the 17 shared libraries the CMS measures include is now a package of its own,
`cms/lib-<name>` (for example `cms/lib-fhirhelpers`). A package can declare `library`
identity (the CQL library name and header version) in place of `measure`, which is what
was missing: Level 1 used to require `measure.title`, so a library-only package had no
valid shape.

Each measure lists the libraries its CQL includes directly under `dependencies`, and each
library lists its own. `oq validate-all` fails if any dependency is not a package in the
corpus. The CQL files in `cms-fhir-2026` went from 301 to 69: 52 measure libraries and
17 shared ones, each stored once.

A measure still loads on its own. `oq fhir-bundle`, `oq fhir-package` and the MCP
server's `get_bundle` resolve dependencies transitively and include them. A test
(`tools/test/library-sets.test.ts`) holds every measure's bundle to the exact set of
Library resources it carried before the change, compared by id, version, CQL bytes and
dependency edges.

Both failure modes listed above are closed. There is one copy of each library, so copies
cannot diverge. A hand-authored package can still carry its own copy of a library, which
stays valid but is no longer how the imported corpus works.

**Later finding.** The one-copy guarantee holds, but it hid a different gap: 17 measures
include an older version of a shared library than the one upstream publishes, and the
importer resolved them by name to the newer one. "Loads on its own" above holds only for
a tool that resolves includes by name. See `corpus-2026-008`.

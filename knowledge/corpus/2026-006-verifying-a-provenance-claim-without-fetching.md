---
id: corpus-2026-006
scope: corpus
type: implementation-note
status: open
categories: [packaging, provenance, tooling, security]
reporter: anonymous
---

## Summary

A community package can declare `relationship: unmodified` against any upstream
and nothing checks it. The CI job that makes that claim verifiable today only
covers the 53 seeded packages, because it works by re-running the importer.

A design for closing this without ever fetching a URL during validation is
recorded below. It is not implemented.

## The problem

`checkProvenance` in `packages/core/src/provenance.ts` validates the *shape* of
a provenance block: an http upstream, a ref, an ISO date, a known relationship,
and a non-empty modifications list when the relationship is `derived`. Every one
of those rules is about form. None of them looks at the upstream.

For `measures/cms-fhir-2026/` that gap is closed from the outside: CI re-runs the
importer and fails on any diff, so `unmodified` is a checked claim rather than an
asserted one. That mechanism does not generalise, because it depends on the
content having been produced by our importer in the first place.

So a hand-authored package can say it is an unmodified copy of some upstream and
be believed. Provenance is the project's central claim, and this is the one place
it rests on trust.

## The design

Contributed by the outside reviewer who reported
[[2026-004-undeclared-symlink-hid-content-from-the-scanner]] and
[[2026-005-the-scanner-trusted-its-own-parser]]. The framing is theirs:

> Don't fetch at validate time at all. Separate proving the claim from checking
> it.

The primitive already exists. `packPackage` computes a sha256 over a
deterministic tarball, with entries sorted, mtime fixed, and ownership stripped,
so the same content yields the same digest on any machine at any time. Today
that digest is only printed and used to name the tarball file. Bind provenance
to it instead.

**Proving**, once, in CI, when a pull request declares a provenance block:

1. Fetch the one declared target, and nothing else. Sandboxed, host
   allowlisted, no redirects off the allowlist, no private IP ranges, size and
   time capped.
2. Re-derive the package the way the importer does today.
3. Diff it against what the pull request contains.
4. On a match, record the package's `packPackage` digest, along with who
   verified it and when.

**Checking**, every time, offline:

`oq validate` recomputes the local digest and compares it against the recorded
one. A match means the claim still holds. A mismatch is a hard error: the
content has drifted since the last time anyone checked it against upstream.

The properties that make this worth doing:

- **Zero network calls in the path that runs on a stranger's machine.** The
  fetch happens once, in a place we control, under constraints we set. A
  contributor running `oq validate` locally makes no requests at all.
- **It covers community packages the same way as seeded ones**, because the CI
  job keys off the declared provenance block rather than off our importer.
- **Drift becomes detectable rather than invisible.** Today, editing a file in a
  package that claims `unmodified` produces no finding outside
  `cms-fhir-2026/`. Under this design it produces a digest mismatch.

## The part that still needs deciding

Where the verification record lives. The obvious place is the manifest, as
`provenance.verifiedDigest` plus the verifier and timestamp. That works for
hand-authored packages and breaks for generated ones.

Verified rather than assumed: injecting a `verifiedDigest` field into
`measures/cms-fhir-2026/severe-obstetric-complications/openquality.yaml` and
re-running `pnpm oq-import 2026-08-01` removes it. `emitManifest` builds each
seeded manifest from the plan, so anything CI writes into one is destroyed by
the next import, and the drift job then fails on the diff. The determinism
contract and an in-manifest verification record cannot both hold.

Two ways out, neither chosen yet:

1. **A separate ledger.** A repository-level file mapping package id and version
   to a verified digest, upstream, ref, verifier, and timestamp. The generated
   manifests stay byte-identical to importer output, so the drift check is
   untouched, and the record is one file to review rather than 53 diffs. The
   cost is that a package tarball no longer carries its own verification.
2. **Teach the importer to carry it through.** `emitManifest` would read an
   existing manifest and preserve the field. That keeps the record in the
   package and gives up the property that the importer is a pure function of
   upstream content plus a date, which is what makes the drift check meaningful.

Option 1 preserves the invariant the project already depends on, so it is the
one to try first.

Also undecided: what a verified digest means once a package has more than one
verification, whether an expired or very old verification should warn, and
whether `relationship: derived` can be verified at all or only ever attested.

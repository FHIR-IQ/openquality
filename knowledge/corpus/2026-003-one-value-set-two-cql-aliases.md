---
id: corpus-2026-003
scope: corpus
type: implementation-note
measurementPeriod: 2026
status: resolved
categories: [packaging, terminology, tooling]
reporter: anonymous
---

## Summary

CQL legitimately declares one value set under two names. A manifest that lists
value sets by walking those declarations therefore names the same OID twice,
which no check caught until someone went looking for it.

## Detail

An outside reviewer built a package with the same value set OID declared twice
and watched it validate clean at Level 1 with no warning. They were testing a
hypothetical. The seeded corpus already contained a real one.

`CMS1028FHIRPCSevereOBComps.cql` declares the same value set twice:

```cql
valueset "Placenta Accreta": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1029.302'
valueset "Placental Accreta Spectrum": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1029.302'
```

Two aliases, one value set. That is ordinary CQL: an author names a concept
the way the surrounding logic reads, and two pieces of logic can want two
names for the same terminology. The CQL is not wrong.

The importer walked those declarations and emitted one manifest entry per
declaration, so `measures/cms-fhir-2026/severe-obstetric-complications`
declared `2.16.840.1.113762.1.4.1029.302` twice. The manifest lists **value
sets**, not the names logic gives them, so that was a defect in the emitter
rather than a faithful record of the source.

The general lesson: anything deriving a manifest from CQL declarations is
mapping a namespace of aliases onto a set of resources, and that mapping is
many-to-one. Deduplicate on the resource identity, not on the declaration.

## Resolution

Resolved. Two changes, because there were two defects:

1. `packages/importer/src/emit.ts` deduplicates value set references on the
   `(oid, url)` pair, preserving first-seen order so output stays
   deterministic. Keyed on the pair rather than the OID alone: two entries
   sharing an OID but disagreeing on its URL are contradictory rather than
   redundant, and collapsing them would hide that from the check below.
2. `packages/core/src/valuesets.ts` reports a repeated value set as a
   **warning**, and one OID carrying two different URLs as an **error**.

The split is deliberate. A repeated reference resolves to the same terminology
either way, so it does not move the conformance level; only errors do. Two URLs
for one OID is a claim the package cannot support, so it blocks Level 1.

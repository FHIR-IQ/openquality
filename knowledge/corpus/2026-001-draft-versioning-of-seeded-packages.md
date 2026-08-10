---
id: corpus-2026-001
scope: corpus
type: implementation-note
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

Open Quality therefore publishes the upstream version, normalised to
canonical semver as `0.5.0`. Two reasons:

1. It is what the source says. Deriving `13.0.0` from the eCQM numbering
   would assert that this FHIR translation corresponds to published QDM
   measure version 13, which upstream does not claim and which no check
   could verify.
2. Upstream calls this content draft. A `0.x` version says so in the one
   field every consumer already reads.

The CMS identifier is not lost: it is in `measure.identifiers` as
`CMS122FHIR`, which is where a search for the measure will look.

## Resolution

Resolved as a documented convention. If upstream later publishes a resource
carrying a CMS measure version, the importer should prefer it and this entry
should be superseded rather than edited.

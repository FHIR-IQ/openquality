# Hospital at Home Eligibility — proposed submission

**Status: proposed, awaiting content.** This is a reserved slot for the first community
measure, not a published package. It has no `openquality.yaml` and no logic yet, so it does
not validate — that is intentional until the contributor submits the artifacts.

## What this will be

Portable, executable eligibility logic for **Hospital at Home** patient screening —
translating currently textual inclusion and exclusion criteria into CQL so eligible patients
can be identified computably.

## Provenance

Proposed by Tim Schwirtlich (Northwestern University, Institute for AI in Medicine) as part
of dissertation work on the computability and standardization of Hospital at Home eligibility
screening. Nothing here is authored on his behalf; the package will be contributed by its
author under an approved open license.

## How to fill this in

This directory already exists, so copy the skeleton's files into it rather than copying the
directory over it:

```bash
cp measures/TEMPLATE/openquality.yaml measures/community/hospital-at-home-eligibility/
mkdir -p measures/community/hospital-at-home-eligibility/cql
# add your .cql files there, then:
pnpm oq validate measures/community/hospital-at-home-eligibility
```

[`measures/TEMPLATE/`](../../TEMPLATE/) is a working package that reaches Level 1 as it
stands, with every manifest field annotated. Its README also explains what belongs under
Intent, Known Limitations, and Provenance, which are the three sections Level 1 requires and
the three no tool can write for you.

Replace this README when the package lands. The remaining rules are in
[CONTRIBUTING](../../../CONTRIBUTING.md#1-publish-a-measure-package): value sets referenced
by OID or canonical URL and never embedded, and no licensed display text.

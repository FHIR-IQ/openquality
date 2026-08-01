# Terminology policy

Open Quality references terminology. It does not redistribute it.

This is the same rule the project already applies to value sets, one level down.
A package references value sets by OID or canonical URL and never embeds an
expansion. A package likewise references codes by code and code system, and
carries display text only where the code system's licence permits it.

FHIR itself works this way. The canonical FHIR CodeSystem for LOINC, published
at [loinc/loinc-fhir-codesystem](https://github.com/loinc/loinc-fhir-codesystem),
is 34 KB with `content="not-present"` and zero concepts. The declaration is
published; the content is left to a terminology server.

## Per code system

| Code system | Codes | Display text | Basis |
|-------------|-------|--------------|-------|
| LOINC | yes | yes | Royalty-free licence, attribution required, no modification |
| SNOMED CT | yes | yes | Free to use in the US and other member territories under the affiliate licence |
| ICD-10-CM, HCPCS, CVX | yes | yes | US government content |
| HL7 and THO code systems | yes | yes | Published by HL7 |
| CPT | code and code system only | **no** | AMA licensed. No free redistribution path. The descriptors are the licensed expression |

Systems not listed here default to permitted. This table is a licensing filter,
not an allowlist of terminologies a measure may use.

The rule for CPT is enforced: `content.forbidden` reports an error for a CQL
code declaration that carries display text from a restricted system, which
blocks Level 1. See `packages/core/src/terminology.ts`.

## Attribution

These are the terms that apply wherever this repository carries codes and
display text from the systems below. As of this writing the repository holds
one hand-written CQL file that references value sets by OID only and declares
no LOINC or SNOMED CT codes; the terms below take effect as soon as content
referencing those systems is added, seed corpus included.

Where this repository carries LOINC codes and names: LOINC is copyright
Regenstrief Institute, Inc. and the LOINC Committee, and is available at no
cost under the licence at <https://loinc.org/license/>. LOINC codes and names
are used without modification.

Where this repository carries SNOMED CT codes and display terms: SNOMED CT is
copyright the International Health Terminology Standards Development
Organisation. Use in the United States is covered by the National Library of
Medicine's UMLS licence, which is free to obtain. A consumer of this repository
outside a SNOMED International member territory needs their own affiliate
licence.

## What this does not cover

The scanner is a heuristic first filter. It will miss things and it will
produce false positives. It is backed by the takedown process in
[GOVERNANCE](GOVERNANCE.md), not presented as a guarantee.

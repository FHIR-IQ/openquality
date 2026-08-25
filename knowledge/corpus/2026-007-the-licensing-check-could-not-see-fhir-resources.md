---
id: corpus-2026-007
scope: corpus
type: defect
status: resolved
categories: [packaging, terminology, licensing]
reporter: aks129
---

## Summary

The check that enforces this project's hardest content rule, that AMA-licensed
CPT descriptors are never redistributed, read CQL and nothing else. It returned
no findings for every other file type, including FHIR resources, where the same
twelve licensed descriptors also appear.

Nothing had shipped through the hole. It was found while preparing to emit FHIR
`Measure` resources, which is the change that would have put licensed text in
the corpus.

## Detail

`checkTerminology` opened with `if (!path.endsWith('.cql')) return []`. Every
other file returned clean, and clean here meant "not looked at."

That mattered because a FHIR `Measure` carries its effective data requirements
as a contained `Library`, and that Library records every directly referenced
code as a `cqf-directReferenceCode` extension:

```json
{
  "url": "http://hl7.org/fhir/StructureDefinition/cqf-directReferenceCode",
  "valueCoding": {
    "system": "http://www.ama-assn.org/go/cpt",
    "code": "97802",
    "display": "Medical nutrition therapy; initial assessment and intervention, ..."
  }
}
```

Measured against the pinned upstream release: 6 of the 81 upstream `Measure`
resources carry CPT codings with display text, 20 occurrences of 12 distinct
codes. Those are the **same twelve codes and the same six measures** the CQL
rule already strips. The second copy simply sat somewhere the check could not
read.

The CI grep beside the validator had the same blind spot, matching only
`from "CPT"`, which is CQL syntax.

## Resolution

Two checks now, one policy. The CQL rule is unchanged. A second walks any
document that parses, finds Coding-shaped objects naming a restricted system
with a `display`, and reports one error per code.

**Neither check gates on the file extension any more**, which is the part worth
carrying forward. That gate was the defect in `corpus-2026-005` too, where
renaming a file past a `.json` check was the bypass. The bytes are
redistributed whether they sit in a `.cql` file, a `.json` file or a README, so
all three are read the same way. One pre-existing test asserted the old
behaviour, that a non-CQL file is ignored, and it was asserting the bug.

The resource check fails closed: a file that names a restricted code system and
cannot be parsed is reported, because a document the checker could not read is
not a document known to be clean. That is `corpus-2026-005`'s lesson applied
before it was needed rather than after.

The CI grep now reads both forms.

## What to take from it

Three defects in this repository now share one shape: a check that answers "I
found nothing" when the honest answer is "I was not looking there." Symlinks,
then an unparseable file, now a file type. Every future check should be asked
what it declines to read before it is asked what it finds.

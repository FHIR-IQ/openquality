# Reply to Preston and Tim (one email)

Thread: "CQL Studio - Question about new CQL-SQL on FHIR feature"
To: preston.lee@prestonlee.com, tim.schwirtlich@northwestern.edu
Cc: evan.machusak@optum.com, gene@fhiriq.com
Status: NOT SENT. Gmail connector was disconnected, so this could not be saved as a draft.

---

Hi Preston, Tim,

Answering you both in one message.

Two things are live since I last wrote.

The registry code is public and MIT licensed: https://github.com/FHIR-IQ/openquality
The site is up: https://openquality.vercel.app

Clone it and run `pnpm install && pnpm test` for 91 tests, then
`pnpm oq validate packages/core/test/fixtures/cms122` to see it validate a real
CMS eCQM.

Preston, I also filed an enhancement issue against cql-studio for the 3.x
series rather than describe it in email:

https://github.com/preston/cql-studio/issues/10

The short version. An Open Quality package is a directory with one
`openquality.yaml` manifest and the artifacts it declares. CQL Studio already
holds most of the manifest fields: library name, library version, FHIR version,
and the valueset declarations in the CQL header. The rest is license, steward,
and data model, which is a short form. Export is a file write. Import is a file
read plus a workspace scaffold. That fits the browser-side authoring scope you
described for 2.x, because writing a manifest needs no server and no patient
data.

I put one accurate caveat in the issue. Seven of our nine core modules are pure
and browser-safe. Two use node:fs, and the barrel export currently pulls them
into a bundle. We will add a browser-safe subpath export and an injectable file
reader before any in-UI validation lands. That is our work to do, not yours.

I would rather write the pull request than hand you a feature request. Tell me
if the direction is useful and I will scope it against your 3.x plans.

You also asked for attributable blurbs. Use this one:

  "CQL Studio is where I do the authoring and testing work that used to require
  a full local Java toolchain. For the Open Quality Initiative it means a
  measure author can go from a blank file to tested logic in a browser, which
  is the difference between a contributor who finishes and one who gives up
  during setup."
  Eugene Vestel, FHIR IQ

Rewrite it however you need. If you want a version that names the CQL-to-SQL
work specifically, say so and I will send one.

Wednesday works. Tim said 1:30pm PT and that suits me. Send the invite and I
will take it.

Tim, on contributing your criteria. You flagged that eligibility criteria differ
from program to program and asked whether that is a problem. It is not, and the
format already handles it. You publish each variant as its own version under one
package id, so one of them can be the reference standard and the others sit
beside it as named variants. Nobody has to pretend there is a single correct
answer.

Concretely:

  id: northwestern/hospital-at-home-eligibility
  version: 1.0.0
  license: CC-BY-4.0
  measure:
    title: Hospital at Home Eligibility
    steward: Northwestern

You keep the copyright under MIT or CC-BY. You get attribution and a citable
artifact. The validator checks the manifest, the license, and that every value
set is referenced by OID rather than embedded, so the package is safe to publish.

No rush on any of it while you finish the dissertation. Whenever you are ready.

One thing that would help me more than agreement from either of you. Clone the
repo and run `oq validate` against a measure you already have, then tell me what
it gets wrong. It validates real CMS eCQM content today and it will certainly
break on something I have not seen.

Best,
Gene

---

## Before sending, check

1. Whether Preston or Tim sent anything after 2026-07-27. This reply is written
   against the thread as of Evan's optimization review on Jul 27 and Tim's reply
   that afternoon. If newer messages exist, they are not answered here.
2. Whether Wednesday 1:30pm PT is still the agreed slot.
3. The attributable blurb. It is written in your voice but it is a quote with
   your name on it, so it should be words you actually endorse.

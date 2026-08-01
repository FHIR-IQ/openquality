# DRAFT — FHIR Zulip #cql intro post

**Not sent.** Post to `#cql` (https://chat.fhir.org/#narrow/stream/179220-cql) as a new topic.
Then a one-line cross-post to `#analytics on FHIR` (179219) for the SQL-on-FHIR angle.

- **Topic:** Open Quality — an open corpus of quality measures (CQL / SQL / SQL-on-FHIR) + interpretation feedback
- **Norms applied:** leads with open-source + community-owned; discloses FHIR IQ affiliation; frames as complementary to cqframework and Reason Health; ends with a concrete ask rather than a broadcast.

---

Hi all — I want to introduce a small open-source project and ask for feedback from this group specifically.

**Open Quality** (https://github.com/FHIR-IQ/openquality, site https://openquality.vercel.app) is an open, MIT-licensed, community-owned corpus of healthcare quality measures. You can publish a measure in CQL, SQL, or SQL-on-FHIR; it's validated against tiered conformance levels; and — the part I most want to build — each measure carries a typed record of interpretation issues, defects, and test cases, so "known issues for CMS122" becomes a query instead of tribal knowledge.

A few things that matter to this crowd:

- It **aligns with HL7 CRMI** for packaging, versioning, and lifecycle (mapping documented in the repo's `spec/`), and represents measures per the Quality Measure IG / CQL.
- It **reuses cqframework tooling and shared libraries** rather than reinventing them, and is meant to **complement** existing platforms like Reason Health's, not compete — it's deliberately the open, public-good end of the space.
- It supports **SQL / SQL-on-FHIR v2 ViewDefinitions** as first-class, not just FHIR-canonical artifacts.

Disclosure: I'm Gene Vestel (FHIR IQ). It's founder-stewarded today with a written commitment to broaden to community governance.

Asks: (1) does the CRMI mapping look right to people who live in that IG? (2) would a corpus of interpretation issues be useful to your work, and what would make it useful? (3) anyone interested in contributing a measure or a test case, or in seeing this at a Clinical Reasoning connectathon track? Happy to take criticism — that's why I'm posting here first.

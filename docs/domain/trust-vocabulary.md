# Trust vocabulary

Norn documents are attributed, mechanically validated and fingerprinted. They are not cryptographically signed unless an explicit asymmetric signature layer is added in a future release.

| Term | Meaning | Use it for |
|---|---|---|
| **Published** | A document has been written to its canonical path after passing schema, relation and identity checks. | Human labels for framework documents and productions. |
| **Attributed** | A document carries a non-empty `author_agent_id` identifying the Agent that produced it. | Labels for `author_agent_id` and productions with known authorship. |
| **Mechanically validated** | A schema or business validator identified by name has checked the document and returned a verdict. | Replacing unqualified "verified" claims. |
| **Proof** | An artefact produced by a named verifier and bound to a specific document or run. | Evidence records, receipts and verification artefacts. |
| **Fingerprint** | A SHA-256 digest over a canonical byte representation. | Plan, repair and authorization confirmation tokens. |
| **Trace** | An event or provenance entry without an explicit verdict. | Audit trails, lineage and history. |

## Machine fields remain stable

The JSON schemas keep their historical field names (`author_agent_id`, `schema_version`, etc.). This vocabulary applies to human-readable labels and public documentation only.

## What to avoid in public labels

- "Signed" when no cryptographic signature is involved.
- "Verified" without naming the validator and the verdict.
- "Proof" for ordinary provenance or author attribution.

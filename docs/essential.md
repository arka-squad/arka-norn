# Essential Workflow

Essential is the default Feature workflow for a known product outcome that still needs complete UX, technical stability and traceability.

```text
feature_brief
  -> [technical_contract_appendix]
  -> development_report
  -> delivery_audit
  -> [corrective development_report]
  -> delivery_validation
```

The brief combines problem, objective, expected outcome, scope, impacted areas, ordered batches, acceptance criteria for code/functional/UX/security, expected tests, risks and definition of done.

A `corrections_required` audit loops to development. The corrective report must close every finding by ID. Validation targets only the latest report; a prior validation becomes stale after another delivery.

```bash
arka-norn essential start "Search by status" --project product
arka-norn essential next <feature> --session <session> --json
```

Escalate to Complete when framing reveals major uncertainty, a new architecture, critical migration, broad external contracts or unresolved security boundaries. Use FastDev only when the change is truly bounded.

See the [canonical example](../examples/feature-essential/).

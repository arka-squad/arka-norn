# FastDev Workflow

FastDev is for a small correction, refactor or UX improvement with a known boundary.

```text
rework_brief -> development_report -> delivery_audit
             -> [corrective development_report] -> delivery_validation
```

It retains signed evidence and independent review while minimizing planning documents. It is not appropriate for a new Feature, architecture decision, critical migration or uncertain scope.

```bash
arka-norn fastdev start "Fix keyboard focus" --project product
arka-norn fastdev next <feature> --session <session> --json
```

Essential and FastDev reuse the same delivery audit, validation contracts and guided engine. See the [canonical example](../examples/feature-fastdev/).

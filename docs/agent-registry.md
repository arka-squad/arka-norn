# Agent Registry

Each Project owns `.arka-norn/agents.json`. An Agent identity includes provider, role, active state, Feature/path scope, responsibilities and replacement lineage.

Sessions select Agents independently. The `main` session is reserved for Product control. Specialized audit, development and QA sessions must carry their session ID through every Agent and scaffold command.

Documents remain historically valid when their author later becomes inactive, provided the identity existed and was authorized for that Feature when verified. Replacement preserves both directions of lineage.

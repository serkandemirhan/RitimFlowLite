# Sync design and conflicts — NOT IMPLEMENTED

No two-way transport or replay is enabled. Current transactions/idempotency are local guarantees, not synchronization authority. [ADR B/D/E/G](04_ARCHITECTURE_DECISIONS.md) needs approval before sync writes or schema changes.

| Data category | Proposed boundary pending approval |
|---|---|
| Masters | Versioned changes; explicit conflicts; no name-only merging |
| Customer orders | Versioned intent, protected committed manufacturing state |
| Routes/templates | Versioned definitions; preserve execution references |
| Work orders/planning | Site-owned planning commands, explicit ownership transfer |
| Assignments | Original actor/site and verified current membership |
| Production | Immutable identified events and source provenance |
| Inventory/transfers | Authoritative resource ownership; prevent concurrent spend |
| Quality | Authorized immutable dispositions; block unsafe dependent release |
| Rework | Linked input/output and supported cycle limit |
| Outsourcing | Dependency-complete dispatch/return/inspection/release |
| Shipping | Origin/dispatch identities and durable receipts |
| Returns | Original shipment link, physical quarantine and disposition |
| Drawing metadata/files | Content digest and independent verified file availability |
| Audit/idempotency | Original provenance plus append-only replay mapping |
| Identity/authorization | Approved metadata/leases only; no passwords/sessions/keys |
| Pending commands | Remain actor/environment-bound; never blindly replicate/authorize |

| Conflict scenario | Detection and recommended safe response, pending approval |
|---|---|
| Offline completion vs cloud edit | Base version/prerequisites; preserve event and quarantine incompatible edits |
| Local dispatch vs cloud allocation | Source identity/authority; reject non-authoritative spend |
| Concurrent installation creation | Installation ID + UUID; explicit human-number collision review |
| Order vs route edits | Base version and committed references; no silent route replacement |
| Cloud membership revocation | Membership revision/lease; enforce approved outage policy |
| Partial workflow delivery | Dependency manifest/checkpoint; stage until validated atomically |
| Duplicate command | Durable origin/key/payload digest; replay receipt, reject changed payload |
| Reconnect after days | Schema/protocol versions and resumable checkpoints; show conflicts |
| File/metadata separation | Digest and publication readiness; block invalid acknowledgement |
| Clock disagreement | Causal version/origin sequence; no wall-clock last-write-wins |

Proposed envelope: protocol/schema version, tenant/site, installation/origin, immutable command/event ID, verified actor mapping, entity/base version, dependency IDs, digest and source references. This is not an implemented contract. Approval must settle authority, replay authorization, quarantine/reconciliation UI, ownership transfer, retention and backup resurrection. Logical replication alone does not resolve these conflicts.

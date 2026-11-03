# Open limitations

## Current remaining gates after backend merge 2ffcdc1

- Both branch discrepancies are resolved; no further merge approval is pending. M0 inventory and all sixteen master documents exist. Earlier findings are preserved in Git history.
- Native PostgreSQL 18.6 regression 142/142 and Windows operational backup/restore rehearsal PASS. Persistent development DB on installed service still needs the user's local credential entry; interactive setup has not run there.
- Live local user login, Supabase migration, cloud API hosting and offline authentication are not verified. A-G decisions remain unapproved.
- No sync implementation or dual-writer stock/production replay is enabled.
- Machine queue/priority, complete shift/setup/downtime journal and central customer/product catalogs remain missing. Current orderNumber is required from the caller; no authoritative server number allocator exists. Do not present the browser's timestamp suggestion as server numbering.
- Source browser latest isolated results 109/110; Windows PDF completion fails. Full packaged regression and real premium authenticated Windows factory journey remain unverified.
- Interactive PowerShell initialization was syntax/secret-roundtrip checked; Node operations were exercised against disposable native PostgreSQL, not the user's existing service. Partial initialization is preserved for repair.
- Physical mobile, operational production key recovery/rotation, performance, monitoring, staging and customer pilot remain release blockers. No production GO or deployment.

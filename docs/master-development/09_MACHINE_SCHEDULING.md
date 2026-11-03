# Machine scheduling

Current [assignment](../../backend/src/assignment.js) supports explicit operator, machine and handover commands for waiting/paused work; running reassignment is rejected. Active-machine uniqueness is an existing safety invariant. [Planning](../../backend/src/orders-planning.js) limits quantities, and downstream planning requires approved provenance.

No persisted multi-job queue, priority/reorder command, urgent insertion, shift capacity or reliable duration model exists. A selector/active assignment is not a schedule. Queued jobs must not all become active assignments.

Proposed contract before implementation: separate tenant/site/machine queue; waiting-job references and explicit version; transactional audited idempotent insert/reorder/remove with planning permission. Lock queue, reject stale versions, exclude running jobs and preserve physical assignment/operator ownership. Activation revalidates assignment, input, drawing, route and authorization with existing domain commands. Queue editing never moves/consumes stock.

Define compatibility/work-center catalog, paused-job treatment, multi-queue membership, urgent priority authority and site/cloud ownership first. Implement with a forward migration and restricted-role concurrency tests. Do not remove active-machine uniqueness to permit a visual board. Do not fabricate capacity/estimated dates without calendars and standards.

Status: planning/assignment PARTIAL; persisted scheduling NOT IMPLEMENTED. This is a proposed contract, not an implemented API or approved sync policy.

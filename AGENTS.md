## Focus
This project is feature-complete. Prioritize only:
- performance optimization
- security hardening

Do not change page structure or interaction flow unless explicitly requested.

## Required Workflow
Before editing code:
1. Identify the exact bottleneck/risk and related files.
2. Propose the smallest safe change.
3. Define verification steps and rollback point.

During implementation:
1. Apply small, reversible patches.
2. Keep behavior and UI structure unchanged.
3. Avoid broad refactors unless they directly reduce risk or latency.

After implementation:
1. Report measurable impact (request count, query cost, payload size, render updates, or attack surface reduction).
2. List residual risks and unverified assumptions.

## Performance Guardrails
- Reduce repeated cloud/database requests in the same page lifecycle.
- Prefer batched data fetch over N+1 lookups.
- Limit fields with projection (`field`) where possible.
- Keep `setData` payloads minimal and incremental.
- Cache stable user/profile data with TTL and deduplicate in-flight requests.
- Avoid expensive work in `onShow` unless strictly needed.

## Security Guardrails
- Never trust client input; validate in cloud functions.
- Enforce permission checks server-side for all write/delete/update operations.
- Minimize exposed user data fields; return only required fields.
- Add input length/type checks before write operations.
- Log security-relevant failures without leaking sensitive data.
- Prefer idempotent and least-privilege data operations.

## Output Style
- Findings first, then fixes.
- Use file + line references.
- Keep conclusions concise and actionable.

# Performance & Security Baseline

## Goals
- Keep current product behavior unchanged.
- Improve runtime efficiency and cloud cost.
- Reduce abuse and data leakage risk.

## Performance Checklist
1. Requests
- Eliminate duplicated cloud function calls in one lifecycle.
- Merge per-item lookup into batch query when possible.
- Add short-lived cache for stable user/profile metadata.

2. Database
- Add `.field({...})` to limit payload.
- Ensure common filter/sort paths are indexed.
- Avoid full collection scans in high-frequency pages.

3. Rendering
- Minimize `setData` frequency and payload size.
- Update only changed branches, not entire lists.
- Defer non-critical data load until first paint finishes.

4. Page Lifecycle
- Review `onShow` repeated calls and add guards.
- Close watchers/listeners in `onUnload`.
- Prevent duplicated watchers on re-entry.

## Security Checklist
1. Access Control
- Verify write/delete operations in cloud functions by caller identity.
- Enforce role checks server-side, not only client-side.

2. Input Validation
- Validate type, length, and allowed value range for every write path.
- Sanitize rich text/HTML-like input before storage or rendering.

3. Data Minimization
- Return only needed fields to client.
- Avoid storing or returning sensitive fields unless required.

4. Abuse Protection
- Add rate limiting or cooldown for high-frequency actions.
- Add idempotency checks for repeated submits/likes/follows.

5. Error Handling
- Keep user-facing errors generic.
- Keep internal logs detailed but avoid sensitive content.

## Suggested Priority Order
1. Chat/notify/community repeated requests and payload trimming.
2. All cloud function write endpoints: permission + validation hardening.
3. High-traffic list pages: batch lookup and `setData` slimming.
4. Security regression pass across role-sensitive operations.

## Delivery Format For Each Optimization
1. Problem statement
2. Minimal patch
3. Verification result
4. Residual risk

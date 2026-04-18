# ADR-007: TenantGuard allows cross-tenant access only for super_admin + audit-logs it

- **Status**: Proposed (default pick)
- **Date**: 2026-04-18
- **Deciders**: Tech Lead + Security Lead
- **Context tag**: D7

## Decision

When JWT `org_id = A` but request URL path includes `/orgs/B/...`:

1. If `user.role = 'super_admin'`, allow the request AND write an audit-log row:
   ```
   action = 'cross_tenant_access'
   actor_org_id = A
   target_org_id = B
   url = <full url>
   ```
2. For all other roles, reject with **404 Not Found** (not 403 — avoid information disclosure about which orgs exist).

No silent rewriting. Ever.

## Rationale

- `super_admin` is the Qualtech internal support role; it MUST be able to access any tenant for debugging.
- 404 (not 403) for non-admins prevents `/orgs/<guessed-uuid>/` enumeration attacks.
- Audit log gives Security a query for "who accessed what tenant when" — required for SOC 2 Type II.

## Consequences

**Easier**:
- Clear, consistent rule across all endpoints.
- Support team can operate with a single role.

**Harder**:
- Every endpoint that accepts `orgId` in the URL must explicitly call the guard.
- `super_admin` role must be protected with MFA (per plan §8 authentication).

**Follow-ups**:
- MFA enforcement for super_admin in Sprint 1.
- Monthly audit-log review query in the HR dashboard.

# ADR-009: Self-hosted Keycloak for auth (SAML 2.0 + OIDC + OAuth2)

- **Status**: Proposed (default pick — revisit if Qualtech IdP choice forces otherwise)
- **Date**: 2026-04-18
- **Deciders**: Tech Lead + Security Lead
- **Context tag**: D9

## Context

We need SSO (SAML + OIDC) + RBAC + MFA + multi-tenant identity. Phase 3 will onboard external clients with their own IdPs.

## Decision

**Keycloak (self-hosted, latest stable)** as the auth broker.

- Each tenant (org) maps to a Keycloak `realm`.
- Qualtech realm federates to Qualtech's existing IdP (Azure AD / Okta — TBD during Sprint 0 Day 1 discovery).
- Client apps (`web`, `mobile`) use OIDC code flow + PKCE.
- Service-to-service uses Keycloak service accounts (client credentials).
- MFA enforced via realm-level policy for `hr_admin`, `super_admin`, `ai_champion`.

## Rationale

- **Free + no vendor lock-in** — important for a Phase 3 SaaS where per-user auth pricing (Auth0) could balloon.
- **Realm-per-tenant** maps cleanly to our multi-tenant model and the RLS-based DB tenancy.
- Mature SAML + OIDC support; used by many orgs with similar requirements.

## Consequences

**Easier**:
- Full control over user data (DPDP Act compliance).
- Predictable cost.

**Harder**:
- Ops burden: we run Keycloak ourselves (HA, upgrades, backup).
- Initial setup complexity vs a managed service.

**Follow-ups**:
- Keycloak HA deployment plan in Sprint 7 (hardening).
- Realm export automation for tenant provisioning (Phase 3).
- Revisit decision if Qualtech mandates a managed IdP (Auth0 / Cognito).

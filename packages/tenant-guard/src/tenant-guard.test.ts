import { describe, it, expect } from 'vitest';
import { TenantId } from './index';

describe('TenantId.from', () => {
  it('accepts a valid v4 UUID', () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    expect(TenantId.from(uuid)).toBe(uuid);
  });

  it('rejects a non-UUID string', () => {
    expect(() => TenantId.from('not-a-uuid')).toThrow(/Invalid TenantId/);
  });

  it('rejects an empty string', () => {
    expect(() => TenantId.from('')).toThrow(/Invalid TenantId/);
  });

  it('rejects a user-ID-shaped input that is not a valid UUID', () => {
    // Missing dash
    expect(() => TenantId.from('00000000000040008000000000000001')).toThrow();
  });

  it('rejects a UUID with wrong version byte', () => {
    // Version byte (third group, first char) must be 1..5 per RFC
    expect(() => TenantId.from('00000000-0000-0000-8000-000000000001')).toThrow();
  });
});

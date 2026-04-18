import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderWorker } from './reminder.worker';
import type { MailerService } from './mailer.service';

interface DbMocks {
  cycleFindMany: ReturnType<typeof vi.fn>;
  assessmentFindMany: ReturnType<typeof vi.fn>;
  auditCreate: ReturnType<typeof vi.fn>;
}

const dbMocks: DbMocks = {
  cycleFindMany: vi.fn(),
  assessmentFindMany: vi.fn(),
  auditCreate: vi.fn(),
};

vi.mock('@skillforge/db', () => ({
  prismaAdmin: {
    assessmentCycle: { findMany: (args: unknown) => dbMocks.cycleFindMany(args) },
    assessment: { findMany: (args: unknown) => dbMocks.assessmentFindMany(args) },
    auditLog: { create: (args: unknown) => dbMocks.auditCreate(args) },
  },
}));

function makeMailer(send = vi.fn().mockResolvedValue({ ok: true })) {
  return { send } as unknown as MailerService;
}

function makeRedisStub() {
  const seen = new Set<string>();
  return {
    set: vi.fn(
      async (
        key: string,
        _val: string,
        _ex: string,
        _ttl: number,
        _nx: string,
      ) => {
        if (seen.has(key)) return null;
        seen.add(key);
        return 'OK';
      },
    ),
    del: vi.fn(async (key: string) => {
      seen.delete(key);
      return 1;
    }),
  };
}

function attachRedis(worker: ReminderWorker, redis: ReturnType<typeof makeRedisStub>): void {
  Reflect.set(worker, 'redis', redis);
}

describe('ReminderWorker.runDigest', () => {
  beforeEach(() => {
    dbMocks.cycleFindMany.mockReset();
    dbMocks.assessmentFindMany.mockReset();
    dbMocks.auditCreate.mockReset().mockResolvedValue({});
  });

  it('no cycle within window → 0 sends, 0 audit rows', async () => {
    dbMocks.cycleFindMany.mockResolvedValue([]);
    const mailer = makeMailer();
    const worker = new ReminderWorker(mailer);
    attachRedis(worker, makeRedisStub());

    const summary = await worker.runDigest(new Date('2026-04-18T09:00:00Z'));

    expect(summary).toEqual({ cyclesScanned: 0, sends: 0, skipped: 0, failed: 0 });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(dbMocks.auditCreate).not.toHaveBeenCalled();
  });

  it('one pending employee within 7 days → 1 send + 1 audit row', async () => {
    const now = new Date('2026-04-18T09:00:00Z');
    const endDate = new Date('2026-04-21T00:00:00Z');

    dbMocks.cycleFindMany.mockResolvedValue([
      { id: 'cycle-1', orgId: 'org-1', name: 'Q2 2026', endDate },
    ]);
    dbMocks.assessmentFindMany.mockResolvedValue([
      {
        id: 'assessment-1',
        userId: 'user-1',
        user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
      },
    ]);

    const sendSpy = vi.fn().mockResolvedValue({ ok: true });
    const mailer = makeMailer(sendSpy);
    const worker = new ReminderWorker(mailer);
    attachRedis(worker, makeRedisStub());

    const summary = await worker.runDigest(now);

    expect(summary).toEqual({ cyclesScanned: 1, sends: 1, skipped: 0, failed: 0 });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const mail = sendSpy.mock.calls[0][0] as { to: string; subject: string };
    expect(mail.to).toBe('alice@example.com');
    expect(mail.subject).toContain('3 day');

    expect(dbMocks.auditCreate).toHaveBeenCalledTimes(1);
    const auditArgs = dbMocks.auditCreate.mock.calls[0][0] as {
      data: { action: string; orgId: string; entityId: string };
    };
    expect(auditArgs.data.action).toBe('reminder.sent');
  });

  it('duplicate run same day → second is idempotency-skipped', async () => {
    const now = new Date('2026-04-18T09:00:00Z');
    dbMocks.cycleFindMany.mockResolvedValue([
      { id: 'c', orgId: 'o', name: 'C', endDate: new Date('2026-04-21T00:00:00Z') },
    ]);
    dbMocks.assessmentFindMany.mockResolvedValue([
      { id: 'a', userId: 'u', user: { id: 'u', email: 'a@b.c', name: 'A' } },
    ]);

    const sendSpy = vi.fn().mockResolvedValue({ ok: true });
    const worker = new ReminderWorker(makeMailer(sendSpy));
    attachRedis(worker, makeRedisStub());

    const first = await worker.runDigest(now);
    const second = await worker.runDigest(now);

    expect(first.sends).toBe(1);
    expect(second.sends).toBe(0);
    expect(second.skipped).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('mail transport failure → failed counter + idempotency key released', async () => {
    const now = new Date('2026-04-18T09:00:00Z');
    dbMocks.cycleFindMany.mockResolvedValue([
      { id: 'c', orgId: 'o', name: 'C', endDate: new Date('2026-04-21T00:00:00Z') },
    ]);
    dbMocks.assessmentFindMany.mockResolvedValue([
      { id: 'a', userId: 'u', user: { id: 'u', email: 'a@b.c', name: 'A' } },
    ]);

    const sendSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'SMTP down' })
      .mockResolvedValueOnce({ ok: true });
    const worker = new ReminderWorker(makeMailer(sendSpy));
    const redis = makeRedisStub();
    attachRedis(worker, redis);

    const first = await worker.runDigest(now);
    expect(first.failed).toBe(1);
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(dbMocks.auditCreate.mock.calls[0][0].data.action).toBe('reminder.failed');

    const second = await worker.runDigest(now);
    expect(second.sends).toBe(1);
  });
});

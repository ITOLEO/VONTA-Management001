import test from 'node:test';
import assert from 'node:assert/strict';
import { computeActiveSectionId } from '../utils/scrollSpy';
import {
  PASSWORD_CHALLENGE_RESEND_COOLDOWN_MS,
  PASSWORD_CHALLENGE_TTL_MS,
  checkResendThrottle,
  createPasswordChangeChallenge,
  verifyPasswordChangeChallenge,
} from './passwordChangeChallenge';
import {
  InMemoryVontaRepository,
  ServiceError,
  VontaDomainService,
  type AuthenticatedActor,
} from '../server/vontaService';

test('N03: Scrollspy tracks top, middle, and short bottom section accurately', () => {
  const sections = [
    { id: 'preferences', top: 100, height: 600 },
    { id: 'security', top: 720, height: 550 },
    { id: 'history', top: 1300, height: 500 },
    { id: 'danger', top: 1830, height: 180 }, // short final section
  ];

  assert.equal(
    computeActiveSectionId(sections, {
      scrollTop: 0,
      viewportHeight: 900,
      scrollHeight: 2050,
    }),
    'preferences'
  );

  assert.equal(
    computeActiveSectionId(sections, {
      scrollTop: 650,
      viewportHeight: 900,
      scrollHeight: 2050,
    }),
    'security'
  );

  assert.equal(
    computeActiveSectionId(sections, {
      scrollTop: 1120,
      viewportHeight: 900,
      scrollHeight: 2050,
    }),
    'security'
  );

  // Scrolled to bottom: short Delete account section highlights even though its top is below reading line
  assert.equal(
    computeActiveSectionId(sections, {
      scrollTop: 1150,
      viewportHeight: 900,
      scrollHeight: 2050,
    }),
    'danger'
  );
});

test('N05: Password confirmation challenge enforces single-use, expiry, user binding, and resend throttle', () => {
  const t0 = 1_795_000_000_000;
  const { record, plainCode } = createPasswordChangeChallenge({
    userId: 'user-1',
    registeredEmail: 'Budi@Vonta.Example',
    nowMs: t0,
  });

  // Resend throttled immediately
  const throttled = checkResendThrottle(record, t0 + 10_000);
  assert.equal(throttled.allowed, false);
  if (!throttled.allowed) {
    assert.ok(throttled.retryAfterSeconds >= 30);
  }
  assert.equal(
    checkResendThrottle(record, t0 + PASSWORD_CHALLENGE_RESEND_COOLDOWN_MS + 1).allowed,
    true
  );

  // Wrong user rejected
  const wrongUser = verifyPasswordChangeChallenge(record, {
    userId: 'user-2',
    registeredEmail: 'budi@vonta.example',
    code: plainCode,
    nowMs: t0 + 5_000,
  });
  assert.equal(wrongUser.ok, false);
  if (!wrongUser.ok) assert.equal(wrongUser.code, 'MISMATCHED_USER');

  // Wrong code increments attempts
  const badCode = verifyPasswordChangeChallenge(record, {
    userId: 'user-1',
    registeredEmail: 'budi@vonta.example',
    code: '000000',
    nowMs: t0 + 5_000,
  });
  assert.equal(badCode.ok, false);
  if (!badCode.ok) {
    assert.equal(badCode.code, 'INVALID_CODE');
    assert.equal(badCode.record?.attempts, 1);
  }

  // Expired code rejected
  const expired = verifyPasswordChangeChallenge(record, {
    userId: 'user-1',
    registeredEmail: 'budi@vonta.example',
    code: plainCode,
    nowMs: t0 + PASSWORD_CHALLENGE_TTL_MS + 1,
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, 'EXPIRED');

  // Valid code succeeds once, then replay is rejected
  const ok = verifyPasswordChangeChallenge(record, {
    userId: 'user-1',
    registeredEmail: 'budi@vonta.example',
    code: plainCode,
    nowMs: t0 + 15_000,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    const replay = verifyPasswordChangeChallenge(ok.record, {
      userId: 'user-1',
      registeredEmail: 'budi@vonta.example',
      code: plainCode,
      nowMs: t0 + 16_000,
    });
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.code, 'REPLAYED');
  }
});

test('N05: VontaDomainService password challenge reports failed delivery, verifies single-use code, and never leaks code to audit history', async () => {
  let now = new Date('2026-11-22T09:00:00.000Z');
  const sentCodes: Array<{ toEmail: string; code: string }> = [];
  let shouldDeliver = false;

  const repo = new InMemoryVontaRepository();
  const service = new VontaDomainService(repo, () => now, {
    sendPasswordChallengeEmail: async (input) => {
      if (!shouldDeliver) {
        return { delivered: false, error: 'SMTP provider unreachable' };
      }
      sentCodes.push({ toEmail: input.toEmail, code: input.code });
      return { delivered: true };
    },
  });

  const actor: AuthenticatedActor = {
    userId: 'u-sec-1',
    email: 'budi@vonta.example',
    displayName: 'Budi Santoso',
  };

  // Failed delivery rejects cleanly without completing change
  await assert.rejects(
    () => service.requestAccountPasswordChallenge(actor),
    (err: unknown) => err instanceof ServiceError && err.code === 'EMAIL_DELIVERY_FAILED'
  );

  // Successful delivery issues single-use challenge
  shouldDeliver = true;
  const issued = await service.requestAccountPasswordChallenge(actor);
  assert.equal(issued.registeredEmail, actor.email);
  assert.equal(sentCodes.length, 1);

  // Immediate resend is throttled
  await assert.rejects(
    () => service.requestAccountPasswordChallenge(actor),
    (err: unknown) => err instanceof ServiceError && err.code === 'CHALLENGE_RESEND_THROTTLED'
  );

  // Valid verification succeeds once
  const verified = await service.verifyAccountPasswordChallenge(actor, {
    challengeId: issued.challengeId,
    code: sentCodes[0].code,
  });
  assert.equal(verified.verified, true);

  // Replay fails
  await assert.rejects(
    () =>
      service.verifyAccountPasswordChallenge(actor, {
        challengeId: issued.challengeId,
        code: sentCodes[0].code,
      }),
    (err: unknown) => err instanceof ServiceError && err.code === 'REPLAYED'
  );

  // Audit history contains zero plaintext challenge codes
  const history = await service.getOwnAccountHistory(actor);
  assert.equal(JSON.stringify(history).includes(sentCodes[0].code), false);
});

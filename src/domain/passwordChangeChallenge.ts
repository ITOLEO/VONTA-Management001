import crypto from 'node:crypto';

export type PasswordChallengeOperation = 'account_password_change';

export interface PasswordChangeChallengeRecord {
  id: string;
  userId: string;
  registeredEmail: string;
  operation: PasswordChallengeOperation;
  codeHash: string;
  issuedAtMs: number;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  attempts: number;
  maxAttempts: number;
  consumedAtMs: number | null;
  cancelledAtMs: number | null;
}

export const PASSWORD_CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const PASSWORD_CHALLENGE_RESEND_COOLDOWN_MS = 45 * 1000; // 45 seconds
export const PASSWORD_CHALLENGE_MAX_ATTEMPTS = 5;

function hashChallengeCode(challengeId: string, userId: string, code: string): string {
  return crypto
    .createHash('sha256')
    .update(`${challengeId}:${userId}:${code.trim()}`)
    .digest('hex');
}

export function generateNumericChallengeCode(): string {
  const value = crypto.randomInt(100000, 1000000);
  return String(value);
}

export function createPasswordChangeChallenge(input: {
  userId: string;
  registeredEmail: string;
  nowMs?: number;
  code?: string;
}): {
  record: PasswordChangeChallengeRecord;
  plainCode: string;
} {
  const nowMs = input.nowMs ?? Date.now();
  const id = `pwc_${crypto.randomUUID()}`;
  const plainCode = (input.code ?? generateNumericChallengeCode()).trim();
  const record: PasswordChangeChallengeRecord = {
    id,
    userId: input.userId,
    registeredEmail: input.registeredEmail.trim().toLowerCase(),
    operation: 'account_password_change',
    codeHash: hashChallengeCode(id, input.userId, plainCode),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + PASSWORD_CHALLENGE_TTL_MS,
    resendAvailableAtMs: nowMs + PASSWORD_CHALLENGE_RESEND_COOLDOWN_MS,
    attempts: 0,
    maxAttempts: PASSWORD_CHALLENGE_MAX_ATTEMPTS,
    consumedAtMs: null,
    cancelledAtMs: null,
  };
  return { record, plainCode };
}

export function checkResendThrottle(
  existing: PasswordChangeChallengeRecord | null | undefined,
  nowMs = Date.now()
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  if (!existing || existing.consumedAtMs !== null || existing.cancelledAtMs !== null) {
    return { allowed: true };
  }
  const remainingMs = existing.resendAvailableAtMs - nowMs;
  if (remainingMs > 0) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }
  return { allowed: true };
}

export type VerifyPasswordChallengeResult =
  | { ok: true; record: PasswordChangeChallengeRecord }
  | {
      ok: false;
      code:
        | 'NOT_FOUND'
        | 'MISMATCHED_USER'
        | 'CANCELLED'
        | 'REPLAYED'
        | 'EXPIRED'
        | 'TOO_MANY_ATTEMPTS'
        | 'INVALID_CODE';
      message: string;
      record?: PasswordChangeChallengeRecord;
    };

export function verifyPasswordChangeChallenge(
  record: PasswordChangeChallengeRecord | null | undefined,
  input: {
    userId: string;
    registeredEmail: string;
    code: string;
    nowMs?: number;
  }
): VerifyPasswordChallengeResult {
  const nowMs = input.nowMs ?? Date.now();
  if (!record) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Verification challenge was not found. Request a new code.',
    };
  }
  if (
    record.userId !== input.userId ||
    record.registeredEmail !== input.registeredEmail.trim().toLowerCase() ||
    record.operation !== 'account_password_change'
  ) {
    return {
      ok: false,
      code: 'MISMATCHED_USER',
      message: 'This verification code does not belong to your account.',
    };
  }
  if (record.cancelledAtMs !== null) {
    return {
      ok: false,
      code: 'CANCELLED',
      message: 'This verification request was cancelled. Start a new request to continue.',
    };
  }
  if (record.consumedAtMs !== null) {
    return {
      ok: false,
      code: 'REPLAYED',
      message: 'This verification code has already been used. Request a new code.',
    };
  }
  if (nowMs > record.expiresAtMs) {
    return {
      ok: false,
      code: 'EXPIRED',
      message: 'This verification code has expired. Request a new code.',
    };
  }
  if (record.attempts >= record.maxAttempts) {
    return {
      ok: false,
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many invalid verification attempts. Request a new code.',
    };
  }

  const candidateHash = hashChallengeCode(record.id, input.userId, input.code);
  const a = Buffer.from(record.codeHash, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!matches) {
    const updated: PasswordChangeChallengeRecord = {
      ...record,
      attempts: record.attempts + 1,
    };
    return {
      ok: false,
      code: 'INVALID_CODE',
      message: 'Invalid verification code. Check the code sent to your registered email.',
      record: updated,
    };
  }

  const consumed: PasswordChangeChallengeRecord = {
    ...record,
    attempts: record.attempts + 1,
    consumedAtMs: nowMs,
  };
  return { ok: true, record: consumed };
}

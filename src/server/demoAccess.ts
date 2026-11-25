import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoAccounts, demoForEmail } from '../domain/demoAccounts';

const cookieName = 'vonta_sample';
const lifetime = 8 * 60 * 60;
const localKey = randomBytes(32);
function signature(data: string) {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || localKey;
  return createHmac('sha256', key)
    .update('vonta-sample-session/v1/' + data)
    .digest('hex');
}
function readDemo(req: Request) {
  const raw =
    (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1) || '';
  const [role, expiry, mac] = raw.split('.');
  if (
    !mac ||
    !/^[a-f0-9]{64}$/.test(mac) ||
    !/^\d{10}$/.test(expiry) ||
    Number(expiry) <= Date.now() / 1000
  )
    return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(signature(role + '.' + expiry)))) return null;
  return demoAccounts.find((a) => a.role === role) ?? null;
}
export function sampleAccessRouter(client: SupabaseClient | null) {
  const router = Router();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/demo',
  };
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  router.post('/login', async (req, res) => {
    const account = demoForEmail(String(req.body?.email || ''));
    const actual = createHash('sha256')
      .update(String(req.body?.password || ''))
      .digest('hex');
    if (
      !account ||
      !timingSafeEqual(
        Buffer.from(actual),
        Buffer.from('f40d83de7ca60e0da6e99d0f25494060146040f523e13627ec89613788875f4a'),
      )
    ) {
      res.status(401).json({ message: 'Check your demo email and password.' });
      return;
    }
    const payload = account.role + '.' + (Math.floor(Date.now() / 1000) + lifetime);
    if (client) {
      const { error } = await client
        .from('demo_account_activity')
        .upsert({ role: account.role, last_sign_in_at: new Date().toISOString() });
      if (error) console.warn('Demo sign-in activity could not be recorded.', error.code);
    }
    res.cookie(cookieName, payload + '.' + signature(payload), {
      ...options,
      maxAge: lifetime * 1000,
    });
    res.json({ role: account.role });
  });
  router.get('/session', (req, res) => res.json({ role: readDemo(req)?.role ?? null }));
  router.get('/directory', (req, res) => {
    if (readDemo(req)?.role !== 'admin') {
      res.sendStatus(403);
      return;
    }
    res.json({ accounts: demoAccounts });
  });
  router.post('/logout', (_req, res) => {
    res.clearCookie(cookieName, options);
    res.sendStatus(204);
  });
  return router;
}

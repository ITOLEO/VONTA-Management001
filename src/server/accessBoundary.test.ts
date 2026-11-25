import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createMocks } from 'node-mocks-http';
import { createVontaApp } from '../../server';
import { demoAccounts, isDeveloper } from '../domain/demoAccounts';
import {
  canEditProjectSettings,
  canManageProjectAccess,
  canPublishModel,
} from '../domain/accountTypes';
import { InMemoryVontaRepository, VontaDomainService } from './vontaService';

const service = new VontaDomainService(new InMemoryVontaRepository());
const app = createVontaApp({
  service,
  authVerifier: async (token) =>
    token === 'worker-session'
      ? { userId: 'worker-test', email: 'worker@example.test', displayName: 'Worker' }
      : null,
});
async function call(
  url: string,
  method: 'POST' | 'GET' = 'GET',
  body = {},
  headers: Record<string, string> = {},
) {
  const { req, res } = createMocks({ url, method, body, headers }, { eventEmitter: EventEmitter });
  await new Promise<void>((resolve, reject) => {
    res.on('end', resolve);
    app(req, res, reject);
  });
  return res;
}
test('each isolated demo account signs in and restores the assigned role', async () => {
  for (const a of demoAccounts) {
    const response = await call('/api/demo/login', 'POST', {
      email: a.email,
      password: 'demo123123',
    });
    assert.equal(response.statusCode, 200);
    const cookie = 'vonta_sample=' + response.cookies.vonta_sample.value;
    assert.equal(response.cookies.vonta_sample.options.httpOnly, true);
    assert.equal(
      (await call('/api/demo/session', 'GET', {}, { cookie }))._getJSONData().role,
      a.role,
    );
    const directory = await call('/api/demo/directory', 'GET', {}, { cookie });
    assert.equal(directory.statusCode, a.role === 'admin' ? 200 : 403);
    if (a.role === 'admin') assert.equal(directory._getJSONData().accounts.length, 6);
    assert.equal((await call('/api/admin/directory', 'GET', {}, { cookie })).statusCode, 401);
  }
});
test('sample sign-in rejects the wrong password and the live directory rejects an ordinary session', async () => {
  assert.equal(
    (await call('/api/demo/login', 'POST', { email: demoAccounts[0].email, password: 'incorrect' }))
      .statusCode,
    401,
  );
  assert.equal(
    (await call('/api/admin/directory', 'GET', {}, { authorization: 'Bearer worker-session' }))
      .statusCode,
    403,
  );
});
test('project leads manage project settings, publication, and access independently of the developer role', () => {
  for (const role of ['architect', 'contractor'] as const) {
    assert.ok(
      canEditProjectSettings(role) && canManageProjectAccess(role) && canPublishModel(role),
    );
    assert.equal(isDeveloper({ role }), false);
  }
  assert.equal(isDeveloper({ vonta_platform_role: 'developer' }), true);
  assert.equal(isDeveloper({ vonta_platform_role: 'developer', vonta_demo: true }), false);
});

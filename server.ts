import { randomUUID } from 'node:crypto';
import { isProjectLead } from './src/domain/accountTypes.ts';
import 'dotenv/config';
import { sampleAccessRouter } from './src/server/demoAccess.ts';
import { demoAccounts, isDeveloper } from './src/domain/demoAccounts.ts';
import express, { type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ServiceError,
  SupabasePrivateAssetStorage,
  SupabaseVontaRepository,
  VontaDomainService,
  type AuthenticatedActor,
} from './src/server/vontaService.ts';
import type { AuditObjectType } from './src/domain/accountTypes.ts';
import type { Department } from './src/domain/types.ts';
import { VontaAddendumService } from './src/server/addendumService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function createSupabaseAdmin(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const defaultSupabaseAdmin = createSupabaseAdmin();
const defaultVontaService = defaultSupabaseAdmin
  ? new VontaDomainService(
      new SupabaseVontaRepository(defaultSupabaseAdmin),
      () => new Date(),
      {
        assetStorage: new SupabasePrivateAssetStorage(defaultSupabaseAdmin),
      }
    )
  : null;

const defaultAddendumService = new VontaAddendumService(() => new Date());

function handleRouteError(res: Response, err: unknown) {
  if (err instanceof ServiceError) {
    if (err.retryAfterSeconds) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      fieldErrors: err.fieldErrors,
      retryAfterSeconds: err.retryAfterSeconds,
      details: err.details,
    });
    return;
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  res.status(500).json({ code: 'INTERNAL_ERROR', message });
}

export interface CreateVontaAppOptions {
  service?: VontaDomainService;
  addendumService?: VontaAddendumService;
  authVerifier?: (token: string) => Promise<AuthenticatedActor | null>;
}

export function createVontaApp(options?: CreateVontaAppOptions) {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  const activeService = options?.service ?? defaultVontaService;
  const activeAddendum = options?.addendumService ?? defaultAddendumService;

  async function requireAuthenticatedActor(
    req: Request,
    res: Response
  ): Promise<{ actor: AuthenticatedActor; service: VontaDomainService } | null> {
    if (!activeService) {
      res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        message:
          'Supabase server credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are not configured in this environment.',
      });
      return null;
    }

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Sign in to access private project and account endpoints.',
      });
      return null;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Missing bearer access token.',
      });
      return null;
    }

    if (options?.authVerifier) {
      const actor = await options.authVerifier(token);
      if (!actor) {
        res.status(401).json({
          code: 'INVALID_SESSION',
          message: 'Your session has expired or is invalid. Please sign in again.',
        });
        return null;
      }
      return { actor, service: activeService };
    }

    if (!defaultSupabaseAdmin) {
      res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Supabase authentication verifier is not configured.',
      });
      return null;
    }

    const { data, error } = await defaultSupabaseAdmin.auth.getUser(token);
    if (error || !data.user || !data.user.email) {
      res.status(401).json({
        code: 'INVALID_SESSION',
        message: 'Your session has expired or is invalid. Please sign in again.',
      });
      return null;
    }

    const displayName =
      (typeof data.user.user_metadata?.full_name === 'string' && data.user.user_metadata.full_name) ||
      (typeof data.user.user_metadata?.display_name === 'string' &&
        data.user.user_metadata.display_name) ||
      data.user.email.split('@')[0] ||
      'User';

    return {
      actor: {
        userId: data.user.id,
        isPlatformDeveloper: isDeveloper(data.user.app_metadata),
        email: data.user.email,
        displayName,
      },
      service: activeService,
    };
  }

  async function requireAddendumActor(
    req: Request,
    res: Response
  ): Promise<{ actor: AuthenticatedActor; addendum: VontaAddendumService } | null> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Sign in to access private project endpoints.',
      });
      return null;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Missing bearer access token.',
      });
      return null;
    }
    if (options?.authVerifier) {
      const actor = await options.authVerifier(token);
      if (!actor) {
        res.status(401).json({
          code: 'INVALID_SESSION',
          message: 'Your session has expired or is invalid. Please sign in again.',
        });
        return null;
      }
      return { actor, addendum: activeAddendum };
    }
    if (!defaultSupabaseAdmin) {
      res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        message:
          'Supabase server credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are not configured in this environment.',
      });
      return null;
    }
    const { data, error } = await defaultSupabaseAdmin.auth.getUser(token);
    if (error || !data.user || !data.user.email) {
      res.status(401).json({
        code: 'INVALID_SESSION',
        message: 'Your session has expired or is invalid. Please sign in again.',
      });
      return null;
    }
    const displayName =
      (typeof data.user.user_metadata?.full_name === 'string' && data.user.user_metadata.full_name) ||
      (typeof data.user.user_metadata?.display_name === 'string' &&
        data.user.user_metadata.display_name) ||
      data.user.email.split('@')[0] ||
      'User';

    return {
      actor: {
        userId: data.user.id,
        isPlatformDeveloper: isDeveloper(data.user.app_metadata),
        email: data.user.email,
        displayName,
      },
      addendum: activeAddendum,
    };
  }

  app.use('/api/demo', sampleAccessRouter(defaultSupabaseAdmin));
  app.get('/api/admin/directory', async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const auth = await requireAuthenticatedActor(req, res);
      if (!auth) return;
      if (!auth.actor.isPlatformDeveloper) { res.status(403).json({message:'Developer access required.'}); return; }
      if (!defaultSupabaseAdmin) { res.sendStatus(503); return; }
      const page = Math.max(1, Number(req.query.page || 1));
      if (!Number.isSafeInteger(page)) { res.sendStatus(400); return; }
      const [users, activity] = await Promise.all([
        defaultSupabaseAdmin.auth.admin.listUsers({page, perPage:25}),
        defaultSupabaseAdmin.from('demo_account_activity').select('role,last_sign_in_at'),
      ]);
      if (users.error || activity.error) { res.status(503).json({message:'Account directory unavailable. Check migrations and Auth configuration.'}); return; }
      res.json({
        accounts:users.data.users.map(u => ({id:u.id,email:u.email,createdAt:u.created_at,lastSignIn:u.last_sign_in_at})),
        nextPage:users.data.nextPage ?? null,
        demos:demoAccounts.map(a => ({...a,lastSignIn:activity.data.find(row=>row.role===a.role)?.last_sign_in_at ?? null})),
      });
    } catch (err) { handleRouteError(res, err); }
  });

  // Health & environment configuration status (never leaks secrets)
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      supabaseConfigured: Boolean(activeService),
      aiConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    });
  });

  // Authorized Projects Directory
  app.get('/api/projects', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.listAuthorizedProjects(auth.actor);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Active resumable draft lookup
  app.get('/api/projects/draft', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const draft = await auth.service.getActiveDraft(auth.actor);
      res.json({ draft });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Atomic project draft creation / idempotent resume
  app.post('/api/projects/draft', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.createOrResumeProjectDraft(auth.actor, req.body ?? {});
      res.status(result.resumed ? 200 : 201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Single authorized project detail (by stable UUID)
  app.get('/api/projects/:projectId', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const project = await auth.service.getProjectDetail(auth.actor, req.params.projectId);
      res.json({ project });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Update project General settings (Contractor only, optimistic concurrency)
  app.patch('/api/projects/:projectId', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const project = await auth.service.updateProjectGeneral(
        auth.actor,
        req.params.projectId,
        req.body ?? {}
      );
      res.json({ project });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Register draft blueprint metadata (legacy step helper)
  app.post('/api/projects/:projectId/blueprints', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const project = await auth.service.saveDraftBlueprintStep(
        auth.actor,
        req.params.projectId,
        req.body ?? {}
      );
      res.json({ project });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Add new named project area
  app.post('/api/projects/:projectId/areas', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.addProjectArea(
        auth.actor,
        req.params.projectId,
        req.body ?? {}
      );
      res.status(201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Upload calibrated blueprint file & start durable AI + deterministic job
  app.post('/api/projects/:projectId/blueprints/transfer', async (req,res) => {
    const auth = await requireAuthenticatedActor(req,res);
    if (!auth) return;
    try {
      const project = await auth.service.getProjectDetail(auth.actor, req.params.projectId);
      if (!isProjectLead(project.membership.role)) { res.sendStatus(403); return; }
      if (!defaultSupabaseAdmin) { res.sendStatus(503); return; }
      const transferId = randomUUID();
      const path = ['incoming', project.id, auth.actor.userId, transferId].join('/');
      const {data,error} = await defaultSupabaseAdmin.storage.from('vonta-blueprints').createSignedUploadUrl(path);
      if (error) throw new ServiceError(503,'STORAGE_UNAVAILABLE','Private blueprint storage is unavailable.');
      res.setHeader('Cache-Control','private, no-store');
      res.json({ transferId, path, token:data.token });
    } catch (err) { handleRouteError(res,err); }
  });
  app.post('/api/projects/:projectId/blueprints/upload', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const payload = {...req.body};
      let incoming: string | undefined;
      if (payload.transferId) {
        if (!/^[a-f0-9-]{36}$/.test(payload.transferId) || !defaultSupabaseAdmin) {
          throw new ServiceError(400,'INVALID_TRANSFER','Invalid blueprint transfer.');
        }
        const project = await auth.service.getProjectDetail(auth.actor, req.params.projectId);
        if (!isProjectLead(project.membership.role)) {res.sendStatus(403);return;}
        incoming = ['incoming',project.id,auth.actor.userId,payload.transferId].join('/');
        const {data,error} = await defaultSupabaseAdmin.storage.from('vonta-blueprints').download(incoming);
        if (error || !data) throw new ServiceError(400,'TRANSFER_MISSING','Select the blueprint file and retry.');
        payload.base64Data = Buffer.from(await data.arrayBuffer()).toString('base64');
      }
      const result = await (async () => {
        try { return await auth.service.submitBlueprintJob(auth.actor,req.params.projectId,payload as Parameters<VontaDomainService['submitBlueprintJob']>[2]); }
        finally { if(incoming) await defaultSupabaseAdmin!.storage.from('vonta-blueprints').remove([incoming]); }
      })();
      res.status(result.deduplicated ? 200 : 201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Get durable processing job state
  app.get('/api/projects/:projectId/jobs/:jobId', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const job = await auth.service.getProcessingJob(
        auth.actor,
        req.params.projectId,
        req.params.jobId
      );
      res.json({ job });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Retry AI extraction on same durable job ID
  app.post('/api/projects/:projectId/jobs/:jobId/retry', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.retryProcessingJob(
        auth.actor,
        req.params.projectId,
        req.params.jobId
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Contractor geometry review edits (validates + rebuilds deterministic 3D model)
  app.patch('/api/projects/:projectId/jobs/:jobId/proposal', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.updateJobGeometryProposal(
        auth.actor,
        req.params.projectId,
        req.params.jobId,
        req.body ?? {}
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Contractor explicit verify & publish (with Pin remap/revalidation check for replacements)
  app.post('/api/projects/:projectId/jobs/:jobId/publish', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.verifyAndPublishJob(
        auth.actor,
        req.params.projectId,
        req.params.jobId,
        req.body ?? {}
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Add verified closed-boundary room to an area's active published model
  app.post('/api/projects/:projectId/areas/:areaId/rooms', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.addVerifiedRoom(
        auth.actor,
        req.params.projectId,
        req.params.areaId,
        req.body ?? {}
      );
      res.status(201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Inspect blueprint removal/retirement impact
  app.get('/api/projects/:projectId/blueprints/:blueprintId/impact', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const impact = await auth.service.getBlueprintImpact(
        auth.actor,
        req.params.projectId,
        req.params.blueprintId
      );
      res.json({ impact });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Remove unused draft blueprint or retire published blueprint
  app.post('/api/projects/:projectId/blueprints/:blueprintId/retire', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.removeOrRetireBlueprint(
        auth.actor,
        req.params.projectId,
        req.params.blueprintId,
        {
          mode: req.body?.mode === 'remove' ? 'remove' : 'retire',
          reason: req.body?.reason,
        }
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Create work Pin on a live published area model
  app.post('/api/projects/:projectId/pins', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.createProjectPin(
        auth.actor,
        req.params.projectId,
        req.body ?? {}
      );
      res.status(201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Prompt 3: Authenticated private blueprint source file serving (revoked on deletion!)
  app.get('/api/projects/:projectId/assets/:assetId/file', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const blob = await auth.service.getPrivateAssetFile(
        auth.actor,
        req.params.projectId,
        req.params.assetId
      );
      if (defaultSupabaseAdmin && blob.buffer.length > 3 * 1024 * 1024) {
        const {data:asset,error} = await defaultSupabaseAdmin.from('blueprint_assets').select('storage_path').eq('project_id',req.params.projectId).eq('id',req.params.assetId).single();
        if (error || !asset) throw new ServiceError(404,'SOURCE_MISSING','The drawing source is unavailable.');
        const signed = await defaultSupabaseAdmin.storage.from('vonta-blueprints').createSignedUrl(asset.storage_path,30);
        if (signed.error) throw new ServiceError(503,'STORAGE_UNAVAILABLE','Private blueprint storage is unavailable.');
        res.setHeader('Cache-Control','private, no-store');
        res.redirect(302,signed.data.signedUrl); return;
      }
      res.setHeader('Content-Type', blob.mimeType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `inline; filename="${blob.fileName.replace(/"/g, '')}"`);
      res.send(blob.buffer);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Legacy blueprint danger action
  app.post('/api/projects/:projectId/blueprints/:blueprintId/action', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const blueprint = await auth.service.performBlueprintDangerAction(
        auth.actor,
        req.params.projectId,
        {
          blueprintId: req.params.blueprintId,
          action: req.body?.action,
          reason: req.body?.reason,
        }
      );
      res.json({ blueprint });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Change project password (Contractor only; verifies old scrypt hash + rate limits)
  app.post('/api/projects/:projectId/password', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.changeProjectPassword(
        auth.actor,
        req.params.projectId,
        req.body ?? {}
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Strict DELETE PROJECT <name> logical deletion (Contractor only, optimistic concurrency)
  app.delete('/api/projects/:projectId', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.deleteProject(auth.actor, req.params.projectId, {
        keyword: String(req.body?.keyword ?? ''),
        typedProjectName: String(req.body?.typedProjectName ?? ''),
        expectedVersion: Number(req.body?.expectedVersion),
      });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Scoped append-only Project history
  app.get('/api/projects/:projectId/history', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const objectType =
        typeof req.query.objectType === 'string' && req.query.objectType.trim()
          ? (req.query.objectType.trim() as AuditObjectType)
          : undefined;
      const objectId =
        typeof req.query.objectId === 'string' && req.query.objectId.trim()
          ? req.query.objectId.trim()
          : undefined;
      const events = await auth.service.getProjectHistory(auth.actor, req.params.projectId, {
        objectType,
        objectId,
      });
      res.json({ events });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Own User Profile
  app.get('/api/profile', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const profile = await auth.service.getOwnProfile(auth.actor);
      res.json({ profile });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/profile', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const profile = await auth.service.updateOwnProfile(auth.actor, req.body ?? {});
      res.json({ profile });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/profile/security-events', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.recordAccountSecurityEvent(auth.actor, req.body ?? {});
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/profile/password-challenge', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.requestAccountPasswordChallenge(auth.actor, {
        providerReauthSent: Boolean(req.body?.providerReauthSent),
      });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/profile/password-challenge/verify', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.verifyAccountPasswordChallenge(auth.actor, {
        challengeId: String(req.body?.challengeId ?? ''),
        code: String(req.body?.code ?? ''),
      });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/profile/password-challenge/cancel', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const result = await auth.service.cancelAccountPasswordChallenge(
        auth.actor,
        String(req.body?.challengeId ?? '')
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/profile/history', async (req, res) => {
    const auth = await requireAuthenticatedActor(req, res);
    if (!auth) return;
    try {
      const events = await auth.service.getOwnAccountHistory(auth.actor);
      res.json({ events });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --------------------------------------------------------------------------
  // 20 Nov 2026 Addendum: Members & Independent Workspace Output Grants
  // --------------------------------------------------------------------------

  app.get('/api/projects/:projectId/members', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const members = auth.addendum.listProjectMembers(auth.actor, req.params.projectId);
      res.json({ members });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/projects/:projectId/members/:userId/grants', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const member = auth.addendum.updateMemberGrants(
        auth.actor,
        req.params.projectId,
        req.params.userId,
        req.body ?? {}
      );
      res.json({ member });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --------------------------------------------------------------------------
  // 20 Nov 2026 Addendum: Automatic Alfa Attendance & Photo-Based Izin
  // --------------------------------------------------------------------------

  app.get('/api/projects/:projectId/attendance', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const workDate =
        typeof req.query.workDate === 'string' && req.query.workDate.trim()
          ? req.query.workDate.trim()
          : undefined;
      const result = auth.addendum.getWorkerAttendanceOverview(auth.actor, req.params.projectId, {
        workDate,
      });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/projects/:projectId/attendance/:obligationId/check-in', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const result = auth.addendum.recordWorkerCheckIn(
        auth.actor,
        req.params.projectId,
        req.params.obligationId
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/projects/:projectId/attendance/izin-evidence', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const meta = auth.addendum.uploadIzinEvidencePhoto(auth.actor, req.params.projectId, {
        fileName: String(req.body?.fileName ?? ''),
        mimeType: String(req.body?.mimeType ?? ''),
        base64Data: String(req.body?.base64Data ?? req.body?.dataUrl ?? ''),
      });
      res.status(201).json({ photo: meta });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/projects/:projectId/attendance/izin-evidence/:photoId', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const stored = auth.addendum.getIzinEvidencePhotoBlob(
        auth.actor,
        req.params.projectId,
        req.params.photoId
      );
      res.setHeader('Content-Type', stored.meta.mimeType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${stored.meta.fileName.replace(/"/g, '')}"`
      );
      res.send(stored.buffer);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/projects/:projectId/attendance/izin', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const result = auth.addendum.submitIzinRequest(auth.actor, req.params.projectId, {
        obligationId: String(req.body?.obligationId ?? ''),
        reason: String(req.body?.reason ?? ''),
        evidencePhotoIds: Array.isArray(req.body?.evidencePhotoIds) ? req.body.evidencePhotoIds : [],
      });
      res.status(201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/projects/:projectId/attendance/mandor-queue', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const queue = auth.addendum.listMandorReviewQueue(auth.actor, req.params.projectId);
      const unassigned = auth.addendum.listUnassignedIzinRequests(auth.actor, req.params.projectId);
      res.json({ queue, unassigned });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/projects/:projectId/attendance/izin/:izinId/decide', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const decision = req.body?.decision === 'reject' ? 'reject' : 'approve';
      const result = auth.addendum.decideIzinRequest(
        auth.actor,
        req.params.projectId,
        req.params.izinId,
        {
          decision,
          rejectionReason:
            typeof req.body?.rejectionReason === 'string' ? req.body.rejectionReason : undefined,
          expectedVersion:
            typeof req.body?.expectedVersion === 'number' ? req.body.expectedVersion : undefined,
        }
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/projects/:projectId/attendance/department-metrics', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const timezone =
        typeof req.query.timezone === 'string' && req.query.timezone.trim()
          ? req.query.timezone.trim()
          : 'Asia/Makassar';
      const divisionRaw = typeof req.query.division === 'string' ? req.query.division.trim() : 'All';
      const division =
        divisionRaw === 'Civil' ||
        divisionRaw === 'Electrical' ||
        divisionRaw === 'Plumbing' ||
        divisionRaw === 'Finishing'
          ? (divisionRaw as Department)
          : 'All';
      const result = auth.addendum.getDepartmentAttendanceAnalytics(
        auth.actor,
        req.params.projectId,
        { timezone, division }
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --------------------------------------------------------------------------
  // 20 Nov 2026 Addendum: Authorized Workspace Download & Share View
  // --------------------------------------------------------------------------

  app.post('/api/projects/:projectId/workspace/export-authorize', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const result = auth.addendum.authorizeWorkspaceDownload(auth.actor, req.params.projectId, {
        modelVersionId: String(req.body?.modelVersionId ?? ''),
        areaId: String(req.body?.areaId ?? ''),
      });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/projects/:projectId/workspace/shares', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const result = auth.addendum.createWorkspaceShare(
        auth.actor,
        req.params.projectId,
        (req.body ?? {}) as Record<string, unknown>
      );
      res.status(201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/projects/:projectId/workspace/shares/:shareId', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const accessMode =
        req.body?.accessMode === 'anyone_with_link' ? 'anyone_with_link' : 'restricted';
      const result = auth.addendum.updateWorkspaceShareAccess(
        auth.actor,
        req.params.projectId,
        req.params.shareId,
        accessMode
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.delete('/api/projects/:projectId/workspace/shares/:shareId', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const result = auth.addendum.revokeWorkspaceShare(
        auth.actor,
        req.params.projectId,
        req.params.shareId
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/workspace/shares/:shareId', async (req, res) => {
    const auth = await requireAddendumActor(req, res);
    if (!auth) return;
    try {
      const result = auth.addendum.resolveWorkspaceShare(auth.actor, req.params.shareId);
      res.setHeader('Cache-Control', 'private, no-store');
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/public/workspace/shares/:token', (req, res) => {
    try {
      const result = defaultAddendumService.resolvePublicWorkspaceShare(req.params.token);
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  return app;
}

async function startServer() {
  defaultAddendumService.startCutoffScheduler(30_000);
  const app = createVontaApp();
  const portFlag = process.argv.indexOf('--port');
  const PORT = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VONTA server running on http://localhost:${PORT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void startServer();
}

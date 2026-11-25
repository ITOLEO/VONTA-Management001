import { lazy, Suspense } from 'react';
import { IntegrationsPage } from './pages/IntegrationsPage';
import {
  DemoDashboard,
  DemoAccessPage,
  DeveloperDashboard,
  SampleSession,
} from './pages/AccountDashboards';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrivateProjectsProvider } from './context/PrivateProjectsContext';
import { DemoProvider } from './context/DemoContext';
import { DemoAddendumProvider } from './context/DemoAddendumContext';
import { LayoutShellProvider } from './context/LayoutShellContext';
import { PrivateRouteGuard } from './components/PrivateRouteGuard';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';

const ProjectOverviewPage = lazy(() =>
  import('./pages/ProjectOverviewPage').then((m) => ({ default: m.ProjectOverviewPage })),
);
const SpatialWorkspacePage = lazy(() =>
  import('./pages/SpatialWorkspacePage').then((m) => ({ default: m.SpatialWorkspacePage })),
);
const NewProjectWizardPage = lazy(() =>
  import('./pages/NewProjectWizardPage').then((m) => ({ default: m.NewProjectWizardPage })),
);
const BlueprintDetailPage = lazy(() =>
  import('./pages/BlueprintDetailPage').then((m) => ({ default: m.BlueprintDetailPage })),
);
const BlueprintManagementPage = lazy(() =>
  import('./pages/BlueprintManagementPage').then((m) => ({ default: m.BlueprintManagementPage })),
);
const PrivateProjectOverviewPage = lazy(() =>
  import('./pages/PrivateProjectOverviewPage').then((m) => ({
    default: m.PrivateProjectOverviewPage,
  })),
);
const ProfileSettingsPage = lazy(() =>
  import('./pages/ProfileSettingsPage').then((m) => ({ default: m.ProfileSettingsPage })),
);
const SharedWorkspaceViewPage = lazy(() =>
  import('./pages/SharedWorkspaceViewPage').then((m) => ({ default: m.SharedWorkspaceViewPage })),
);
const WorkListPage = lazy(() =>
  import('./pages/WorkListPage').then((m) => ({ default: m.WorkListPage })),
);
const PinDetailPage = lazy(() =>
  import('./pages/PinDetailPage').then((m) => ({ default: m.PinDetailPage })),
);
const ProjectSettingsPage = lazy(() =>
  import('./pages/ProjectSettingsPage').then((m) => ({ default: m.ProjectSettingsPage })),
);
const PrivateProjectSettingsPage = lazy(() =>
  import('./pages/PrivateProjectSettingsPage').then((m) => ({
    default: m.PrivateProjectSettingsPage,
  })),
);
const MyProjectsPage = lazy(() =>
  import('./pages/MyProjectsPage').then((m) => ({ default: m.MyProjectsPage })),
);
const ModuleUnavailablePage = lazy(() =>
  import('./pages/ModuleUnavailablePage').then((m) => ({ default: m.ModuleUnavailablePage })),
);
const PrivateProjectsPage = lazy(() =>
  import('./pages/PrivateProjectsPage').then((m) => ({ default: m.PrivateProjectsPage })),
);
const PrivateModuleUnavailablePage = lazy(() =>
  import('./pages/PrivateProjectRoutePages').then((m) => ({
    default: m.PrivateModuleUnavailablePage,
  })),
);
const PrivateSpatialWorkspacePage = lazy(() =>
  import('./pages/PrivateProjectRoutePages').then((m) => ({
    default: m.PrivateSpatialWorkspacePage,
  })),
);
const PrivateWorkOrPinPage = lazy(() =>
  import('./pages/PrivateProjectRoutePages').then((m) => ({ default: m.PrivateWorkOrPinPage })),
);
const DemoAttendancePage = lazy(() =>
  import('./pages/AttendancePage').then((m) => ({ default: m.DemoAttendancePage })),
);
const PrivateAttendancePage = lazy(() =>
  import('./pages/AttendancePage').then((m) => ({ default: m.PrivateAttendancePage })),
);
const DemoUsersAccessPage = lazy(() =>
  import('./pages/UsersAccessPage').then((m) => ({ default: m.DemoUsersAccessPage })),
);
const PrivateUsersAccessPage = lazy(() =>
  import('./pages/UsersAccessPage').then((m) => ({ default: m.PrivateUsersAccessPage })),
);

const MODULE_SLUGS = [
  'inventory',
  'store-requests',
  'purchase-requests',
  'market-list',
  'goods-receipts',
  'accounting',
] as const;

/**
 * Isolated wrapper for the synthetic A-03 demo.
 * Private /projects/* and /profile routes never mount DemoProvider.
 */
function DemoRoutesShell() {
  return (
    <SampleSession>
      {(role) => (
        <DemoProvider>
          <DemoAddendumProvider lockedRole={role}>
            <Outlet />
          </DemoAddendumProvider>
        </DemoProvider>
      )}
    </SampleSession>
  );
}

/**
 * Guarded shell for authenticated private routes.
 * Clears or hides private data whenever the user signs out or Supabase is unconfigured.
 */
function PrivateRoutesShell() {
  return (
    <PrivateRouteGuard>
      <Outlet />
    </PrivateRouteGuard>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PrivateProjectsProvider>
        <LayoutShellProvider>
          <BrowserRouter>
            <Suspense
              fallback={
                <div className="vt-screen" role="status">
                  Loading workspace…
                </div>
              }
            >
              <Routes>
                {/* Public Information & Auth Routes */}
                <Route path="/" element={<LandingPage section="overview" />} />
                <Route
                  path="/features/3d-workspace"
                  element={<LandingPage section="3d-workspace" />}
                />
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="/features/accounting" element={<LandingPage section="accounting" />} />
                <Route path="/auth/sign-in" element={<AuthPage defaultMode="sign-in" />} />
                <Route
                  path="/auth/forgot-password"
                  element={<AuthPage defaultMode="forgot-password" />}
                />
                <Route
                  path="/auth/reset-password"
                  element={<AuthPage defaultMode="reset-password" />}
                />
                <Route path="/auth/callback" element={<AuthPage defaultMode="callback" />} />

                {/* Protected Live Shared Workspace View Route */}
                <Route path="/share/:shareId" element={<SharedWorkspaceViewPage />} />

                {/* Explicitly Isolated Synthetic A-03 Demo Routes */}
                <Route path="/demo/access" element={<DemoAccessPage />} />
                <Route path="/demo" element={<DemoRoutesShell />}>
                  <Route index element={<Navigate to="/demo/projects" replace />} />
                  <Route path="profile" element={<ProfileSettingsPage demoMode />} />
                  <Route path="share/:shareId" element={<SharedWorkspaceViewPage demoMode />} />
                  <Route
                    path="projects/:project/integrations"
                    element={<IntegrationsPage mode="sample" />}
                  />
                  <Route path="dashboard" element={<DemoDashboard />} />
                  <Route path="projects" element={<MyProjectsPage />} />
                  <Route path="projects/:project" element={<ProjectOverviewPage />} />
                  <Route
                    path="projects/:project/blueprints"
                    element={<BlueprintManagementPage mode="demo" />}
                  />
                  <Route
                    path="projects/:project/blueprints/:sheetId"
                    element={<BlueprintDetailPage mode="demo" />}
                  />
                  <Route path="projects/:project/spatial" element={<SpatialWorkspacePage />} />
                  <Route path="projects/:project/pin" element={<WorkListPage />} />
                  <Route path="projects/:project/pin/:slug" element={<PinDetailPage />} />
                  <Route path="projects/:project/work" element={<WorkListPage />} />
                  <Route path="projects/:project/work/:slug" element={<PinDetailPage />} />
                  <Route path="projects/:project/settings" element={<ProjectSettingsPage />} />
                  <Route path="projects/:project/attendance" element={<DemoAttendancePage />} />
                  <Route path="projects/:project/team" element={<DemoUsersAccessPage />} />
                  <Route path="projects/:project/users" element={<DemoUsersAccessPage />} />
                  {MODULE_SLUGS.map((mod) => (
                    <Route
                      key={`demo-${mod}`}
                      path={`projects/:project/${mod}`}
                      element={<ModuleUnavailablePage moduleKey={mod} />}
                    />
                  ))}
                </Route>

                {/* Real Authenticated Private Account & Project Routes (No DemoProvider) */}
                <Route element={<PrivateRoutesShell />}>
                  <Route
                    path="/projects/:project/integrations"
                    element={<IntegrationsPage mode="live" />}
                  />
                  <Route path="/admin" element={<DeveloperDashboard />} />
                  <Route path="/profile" element={<ProfileSettingsPage />} />
                  <Route path="/projects" element={<PrivateProjectsPage />} />
                  <Route path="/projects/new" element={<NewProjectWizardPage />} />
                  <Route path="/projects/:project" element={<PrivateProjectOverviewPage />} />
                  <Route
                    path="/projects/:project/blueprints"
                    element={<BlueprintManagementPage mode="live" />}
                  />
                  <Route
                    path="/projects/:project/blueprints/:sheetId"
                    element={<BlueprintDetailPage mode="live" />}
                  />
                  <Route
                    path="/projects/:project/settings"
                    element={<PrivateProjectSettingsPage />}
                  />
                  <Route
                    path="/projects/:project/spatial"
                    element={<PrivateSpatialWorkspacePage />}
                  />
                  <Route path="/projects/:project/pin" element={<PrivateWorkOrPinPage />} />
                  <Route
                    path="/projects/:project/pin/:slug"
                    element={<PrivateWorkOrPinPage isPinDetail />}
                  />
                  <Route path="/projects/:project/work" element={<PrivateWorkOrPinPage />} />
                  <Route
                    path="/projects/:project/work/:slug"
                    element={<PrivateWorkOrPinPage isPinDetail />}
                  />
                  <Route path="/projects/:project/attendance" element={<PrivateAttendancePage />} />
                  <Route path="/projects/:project/team" element={<PrivateUsersAccessPage />} />
                  <Route path="/projects/:project/users" element={<PrivateUsersAccessPage />} />
                  {MODULE_SLUGS.map((mod) => (
                    <Route
                      key={`proj-${mod}`}
                      path={`/projects/:project/${mod}`}
                      element={<PrivateModuleUnavailablePage moduleKey={mod} />}
                    />
                  ))}
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </LayoutShellProvider>
      </PrivateProjectsProvider>
    </AuthProvider>
  );
}

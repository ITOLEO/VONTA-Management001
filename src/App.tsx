import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrivateProjectsProvider } from './context/PrivateProjectsContext';
import { DemoProvider } from './context/DemoContext';
import { DemoAddendumProvider } from './context/DemoAddendumContext';
import { LayoutShellProvider } from './context/LayoutShellContext';
import { PrivateRouteGuard } from './components/PrivateRouteGuard';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { MyProjectsPage } from './pages/MyProjectsPage';
import { ProjectOverviewPage } from './pages/ProjectOverviewPage';
import { SpatialWorkspacePage } from './pages/SpatialWorkspacePage';
import { WorkListPage } from './pages/WorkListPage';
import { PinDetailPage } from './pages/PinDetailPage';
import { ProjectSettingsPage } from './pages/ProjectSettingsPage';
import { ModuleUnavailablePage } from './pages/ModuleUnavailablePage';
import { PrivateProjectsPage } from './pages/PrivateProjectsPage';
import { NewProjectWizardPage } from './pages/NewProjectWizardPage';
import { PrivateProjectOverviewPage } from './pages/PrivateProjectOverviewPage';
import { PrivateProjectSettingsPage } from './pages/PrivateProjectSettingsPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { DemoAttendancePage, PrivateAttendancePage } from './pages/AttendancePage';
import { DemoUsersAccessPage, PrivateUsersAccessPage } from './pages/UsersAccessPage';
import { SharedWorkspaceViewPage } from './pages/SharedWorkspaceViewPage';
import { BlueprintDetailPage } from './pages/BlueprintDetailPage';
import { BlueprintManagementPage } from './pages/BlueprintManagementPage';
import {
  PrivateModuleUnavailablePage,
  PrivateSpatialWorkspacePage,
  PrivateWorkOrPinPage,
} from './pages/PrivateProjectRoutePages';

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
    <DemoProvider>
      <DemoAddendumProvider>
        <Outlet />
      </DemoAddendumProvider>
    </DemoProvider>
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
            <Routes>
              {/* Public Information & Auth Routes */}
              <Route path="/" element={<LandingPage section="overview" />} />
              <Route
                path="/features/3d-workspace"
                element={<LandingPage section="3d-workspace" />}
              />
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
              <Route path="/demo" element={<DemoRoutesShell />}>
                <Route index element={<Navigate to="/demo/projects" replace />} />
                <Route path="profile" element={<ProfileSettingsPage demoMode />} />
                <Route path="share/:shareId" element={<SharedWorkspaceViewPage demoMode />} />
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
                <Route path="/projects/:project/settings" element={<PrivateProjectSettingsPage />} />
                <Route path="/projects/:project/spatial" element={<PrivateSpatialWorkspacePage />} />
                <Route path="/projects/:project/pin" element={<PrivateWorkOrPinPage />} />
                <Route path="/projects/:project/pin/:slug" element={<PrivateWorkOrPinPage isPinDetail />} />
                <Route path="/projects/:project/work" element={<PrivateWorkOrPinPage />} />
                <Route path="/projects/:project/work/:slug" element={<PrivateWorkOrPinPage isPinDetail />} />
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
          </BrowserRouter>
        </LayoutShellProvider>
      </PrivateProjectsProvider>
    </AuthProvider>
  );
}

export interface ProjectRouteHelpers {
  isDemoPrefix: boolean;
  directoryPath: string;
  projectBase: string;
  overviewPath: string;
  workspacePath: string;
  /** Canonical PIN list path (legacy /work remains a working alias) */
  pinListPath: string;
  /** Legacy alias kept for compatibility with existing links and tests */
  workListPath: string;
  teamPath: string;
  attendancePath: string;
  blueprintManagementPath: string;
  blueprintDetailPath: (sheetId: string) => string;
  settingsPath: string;
  pinDetailPath: (slug: string) => string;
  locatePinPath: (pinId: string) => string;
  modulePath: (moduleSlug: string) => string;
}

/**
 * Resolves project-scoped links while keeping isolated `/demo/...` routes
 * strictly within `/demo` and live `/projects/...` routes within `/projects`.
 */
export function getProjectRoutes(
  pathname: string,
  projectSlug: string
): ProjectRouteHelpers {
  const isDemoPrefix = pathname.startsWith('/demo');
  const prefix = isDemoPrefix ? '/demo' : '';
  const projectBase = `${prefix}/projects/${projectSlug}`;

  return {
    isDemoPrefix,
    directoryPath: isDemoPrefix ? '/demo/projects' : '/projects',
    projectBase,
    overviewPath: projectBase,
    workspacePath: `${projectBase}/spatial`,
    pinListPath: `${projectBase}/pin`,
    workListPath: `${projectBase}/work`,
    teamPath: `${projectBase}/team`,
    attendancePath: `${projectBase}/attendance`,
    blueprintManagementPath: `${projectBase}/blueprints`,
    blueprintDetailPath: (sheetId: string) =>
      `${projectBase}/blueprints/${encodeURIComponent(sheetId)}`,
    settingsPath: `${projectBase}/settings`,
    pinDetailPath: (slug: string) => `${projectBase}/pin/${slug}`,
    locatePinPath: (pinId: string) =>
      `${projectBase}/spatial?pin=${encodeURIComponent(pinId)}`,
    modulePath: (moduleSlug: string) => `${projectBase}/${moduleSlug}`,
  };
}

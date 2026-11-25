import type { ProjectRouteHelpers } from './projectRoutes';

export type ProjectSearchGroupId = 'destinations' | 'blueprints' | 'pins';

export interface ProjectSearchDestinationSource {
  id: string;
  label: string;
  subtitle: string;
  to: string;
  keywords?: string[];
}

export interface ProjectSearchBlueprintSource {
  id: string;
  sheetCode: string;
  title: string;
  revision?: string;
  areaName?: string;
  departmentLabel?: string;
  to: string;
}

export interface ProjectSearchPinSource {
  id: string;
  title: string;
  roomName?: string;
  department?: string;
  status?: string;
  to: string;
}

export interface ProjectSearchSources {
  projectScopeKey: string;
  destinations: ProjectSearchDestinationSource[];
  /** Pass null/undefined when blueprint source has not loaded or is unavailable */
  blueprints: ProjectSearchBlueprintSource[] | null | undefined;
  /** Pass null/undefined when pin source has not loaded or is unavailable */
  pins: ProjectSearchPinSource[] | null | undefined;
}

export interface ProjectSearchResultItem {
  id: string;
  groupId: ProjectSearchGroupId;
  title: string;
  subtitle: string;
  badge?: string;
  to: string;
}

export interface ProjectSearchResultGroup {
  id: ProjectSearchGroupId;
  label: string;
  items: ProjectSearchResultItem[];
}

export interface ProjectSearchResponse {
  projectScopeKey: string;
  query: string;
  groups: ProjectSearchResultGroup[];
  flatItems: ProjectSearchResultItem[];
  totalCount: number;
  missingSources: Array<'blueprints' | 'pins'>;
}

const MAX_RESULTS_PER_GROUP = 6;

/**
 * Builds the canonical visible project destinations from projectRoutes.ts.
 */
export function buildProjectSearchDestinations(
  routes: ProjectRouteHelpers
): ProjectSearchDestinationSource[] {
  return [
    {
      id: 'dest-overview',
      label: 'Overview',
      subtitle: 'Project summary, blueprints & budgets',
      to: routes.overviewPath,
      keywords: ['home', 'summary', 'dashboard', 'budget'],
    },
    {
      id: 'dest-workspace',
      label: 'Workspace',
      subtitle: '3D spatial model, areas & surface Pins',
      to: routes.workspacePath,
      keywords: ['3d', 'spatial', 'model', 'areas', 'rooms'],
    },
    {
      id: 'dest-pin',
      label: 'PIN',
      subtitle: 'Spatial work assignments & QC board',
      to: routes.pinListPath,
      keywords: ['pins', 'work', 'tasks', 'qc', 'kanban'],
    },
    {
      id: 'dest-blueprints',
      label: 'Blueprint management',
      subtitle: 'Issued drawings, revisions & uploads',
      to: routes.blueprintManagementPath,
      keywords: ['drawings', 'sheets', 'plans', 'pdf', 'cad'],
    },
    {
      id: 'dest-inventory',
      label: 'Warehouse · Inventory',
      subtitle: 'Stock ledger & site materials',
      to: routes.modulePath('inventory'),
      keywords: ['warehouse', 'materials', 'stock'],
    },
    {
      id: 'dest-store-requests',
      label: 'Warehouse · Store Requests',
      subtitle: 'Material issuance requests',
      to: routes.modulePath('store-requests'),
      keywords: ['warehouse', 'requests', 'materials'],
    },
    {
      id: 'dest-purchase-requests',
      label: 'Warehouse · Purchase Requests',
      subtitle: 'Procurement requests',
      to: routes.modulePath('purchase-requests'),
      keywords: ['warehouse', 'procurement', 'po'],
    },
    {
      id: 'dest-market-list',
      label: 'Warehouse · Market List',
      subtitle: 'Supplier catalog & unit prices',
      to: routes.modulePath('market-list'),
      keywords: ['warehouse', 'catalog', 'vendors'],
    },
    {
      id: 'dest-goods-receipts',
      label: 'Warehouse · Goods Receipts',
      subtitle: 'Delivered site goods',
      to: routes.modulePath('goods-receipts'),
      keywords: ['warehouse', 'receiving', 'delivery'],
    },
    {
      id: 'dest-accounting',
      label: 'Accounting',
      subtitle: 'Department budgets, receiving & internal usage',
      to: routes.modulePath('accounting'),
      keywords: ['budgets', 'finance', 'ledger', 'costs'],
    },
    {
      id: 'dest-team',
      label: 'Team',
      subtitle: 'Project members, roles & invitations',
      to: routes.teamPath,
      keywords: ['users', 'members', 'roles', 'invites'],
    },
    {
      id: 'dest-attendance',
      label: 'Attendance',
      subtitle: 'Daily check-in, leave & roster',
      to: routes.attendancePath,
      keywords: ['shifts', 'check-in', 'roster', 'izin'],
    },
    {
      id: 'dest-settings',
      label: 'Project settings',
      subtitle: 'General settings, timezone & blueprint archive',
      to: routes.settingsPath,
      keywords: ['config', 'timezone', 'security'],
    },
  ];
}

function scoreMatch(queryTokens: string[], primary: string, secondary: string): number {
  const p = primary.toLowerCase();
  const combined = `${p} ${secondary.toLowerCase()}`;

  for (const token of queryTokens) {
    if (!combined.includes(token)) return 0;
  }

  const fullQuery = queryTokens.join(' ');
  if (p === fullQuery) return 100;
  if (p.startsWith(fullQuery)) return 80;
  if (p.includes(fullQuery)) return 60;
  return 40;
}

/**
 * Pure scoped project search across Destinations, Blueprints, and Pins.
 * Strictly reads only the passed authorized sources for `projectScopeKey`.
 */
export function runProjectSearch(
  sources: ProjectSearchSources,
  rawQuery: string
): ProjectSearchResponse {
  const query = rawQuery.trim();
  const missingSources: Array<'blueprints' | 'pins'> = [];
  if (sources.blueprints == null) missingSources.push('blueprints');
  if (sources.pins == null) missingSources.push('pins');

  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const groups: ProjectSearchResultGroup[] = [];

  if (queryTokens.length === 0) {
    // Quick default view: top destinations + preview of available blueprints/pins for this project
    const defaultDestItems: ProjectSearchResultItem[] = sources.destinations
      .slice(0, 5)
      .map((d) => ({
        id: d.id,
        groupId: 'destinations',
        title: d.label,
        subtitle: d.subtitle,
        to: d.to,
      }));
    if (defaultDestItems.length > 0) {
      groups.push({ id: 'destinations', label: 'Destinations', items: defaultDestItems });
    }

    if (sources.blueprints && sources.blueprints.length > 0) {
      groups.push({
        id: 'blueprints',
        label: 'Blueprints',
        items: sources.blueprints.slice(0, 3).map((bp) => ({
          id: `bp-${bp.id}`,
          groupId: 'blueprints',
          title: `${bp.sheetCode} — ${bp.title}`,
          subtitle: [bp.areaName, bp.departmentLabel].filter(Boolean).join(' · ') || 'Blueprint sheet',
          badge: bp.revision,
          to: bp.to,
        })),
      });
    }

    if (sources.pins && sources.pins.length > 0) {
      groups.push({
        id: 'pins',
        label: 'Pins',
        items: sources.pins.slice(0, 3).map((pin) => ({
          id: `pin-${pin.id}`,
          groupId: 'pins',
          title: pin.title,
          subtitle: [pin.roomName, pin.department].filter(Boolean).join(' · ') || 'Spatial Pin',
          badge: pin.id,
          to: pin.to,
        })),
      });
    }
  } else {
    // 1. Destinations
    const matchedDestinations = sources.destinations
      .map((d) => ({
        score: scoreMatch(
          queryTokens,
          d.label,
          `${d.subtitle} ${(d.keywords ?? []).join(' ')}`
        ),
        item: {
          id: d.id,
          groupId: 'destinations' as const,
          title: d.label,
          subtitle: d.subtitle,
          to: d.to,
        },
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((entry) => entry.item);

    if (matchedDestinations.length > 0) {
      groups.push({ id: 'destinations', label: 'Destinations', items: matchedDestinations });
    }

    // 2. Blueprints
    if (sources.blueprints && sources.blueprints.length > 0) {
      const matchedBlueprints = sources.blueprints
        .map((bp) => ({
          score: scoreMatch(
            queryTokens,
            `${bp.sheetCode} ${bp.title}`,
            `${bp.revision ?? ''} ${bp.areaName ?? ''} ${bp.departmentLabel ?? ''}`
          ),
          item: {
            id: `bp-${bp.id}`,
            groupId: 'blueprints' as const,
            title: `${bp.sheetCode} — ${bp.title}`,
            subtitle:
              [bp.areaName, bp.departmentLabel].filter(Boolean).join(' · ') || 'Blueprint sheet',
            badge: bp.revision,
            to: bp.to,
          },
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((entry) => entry.item);

      if (matchedBlueprints.length > 0) {
        groups.push({ id: 'blueprints', label: 'Blueprints', items: matchedBlueprints });
      }
    }

    // 3. Pins
    if (sources.pins && sources.pins.length > 0) {
      const matchedPins = sources.pins
        .map((pin) => ({
          score: scoreMatch(
            queryTokens,
            `${pin.id} ${pin.title}`,
            `${pin.roomName ?? ''} ${pin.department ?? ''} ${pin.status ?? ''}`
          ),
          item: {
            id: `pin-${pin.id}`,
            groupId: 'pins' as const,
            title: pin.title,
            subtitle: [pin.roomName, pin.department].filter(Boolean).join(' · ') || 'Spatial Pin',
            badge: pin.id,
            to: pin.to,
          },
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((entry) => entry.item);

      if (matchedPins.length > 0) {
        groups.push({ id: 'pins', label: 'Pins', items: matchedPins });
      }
    }
  }

  const flatItems = groups.flatMap((g) => g.items);

  return {
    projectScopeKey: sources.projectScopeKey,
    query,
    groups,
    flatItems,
    totalCount: flatItems.length,
    missingSources,
  };
}

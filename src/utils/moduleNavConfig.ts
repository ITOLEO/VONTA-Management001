import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  FileImage,
  FileSpreadsheet,
  FolderKanban,
  Info,
  Layers,
  LayoutDashboard,
  MapPin,
  Package,
  Receipt,
  ShoppingCart,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';
import type { RailNavGroup } from '../components/ContextualRail';
import type { ProjectRouteHelpers } from './projectRoutes';

export type ProjectShellModule =
  | 'projects'
  | 'overview'
  | 'workspace'
  | 'pin'
  | 'work'
  | 'warehouse'
  | 'accounting'
  | 'team'
  | 'attendance';

export type AccountingViewKey = 'department-budgets' | 'receiving-costs' | 'internal-usage';

export const ACCOUNTING_VIEWS: Record<
  AccountingViewKey,
  { key: AccountingViewKey; title: string; subtitle: string }
> = {
  'department-budgets': {
    key: 'department-budgets',
    title: 'Department budgets',
    subtitle: 'Department cost limits and budget decisions for this project.',
  },
  'receiving-costs': {
    key: 'receiving-costs',
    title: 'Receiving costs',
    subtitle: 'Goods receipt valuations and supplier cost entries for this project.',
  },
  'internal-usage': {
    key: 'internal-usage',
    title: 'Internal usage',
    subtitle: 'Material consumption traced from store issues back to work Pins.',
  },
};

export function resolveAccountingView(search: string): AccountingViewKey {
  const params = new URLSearchParams(search);
  const raw = params.get('view');
  if (raw === 'receiving-costs' || raw === 'internal-usage') {
    return raw;
  }
  return 'department-budgets';
}

export function resolveModuleFromSlug(moduleSlug: string): ProjectShellModule {
  if (moduleSlug === 'users' || moduleSlug === 'team') {
    return 'team';
  }
  if (moduleSlug === 'attendance') {
    return 'attendance';
  }
  if (moduleSlug === 'pin' || moduleSlug === 'work') {
    return 'pin';
  }
  if (
    moduleSlug === 'inventory' ||
    moduleSlug === 'store-requests' ||
    moduleSlug === 'purchase-requests' ||
    moduleSlug === 'market-list' ||
    moduleSlug === 'goods-receipts'
  ) {
    return 'warehouse';
  }
  if (moduleSlug === 'accounting') {
    return 'accounting';
  }
  return 'overview';
}

export function buildProjectsDirectoryRailGroups(options: {
  directoryPath: string;
  activeItem: 'projects' | 'users';
  onUserManagementClick: () => void;
}): RailNavGroup[] {
  return [
    {
      id: 'directory',
      items: [
        {
          id: 'projects',
          label: 'Projects',
          icon: FolderKanban,
          to: options.directoryPath,
          active: options.activeItem === 'projects',
          testId: 'rail-item-projects',
        },
        {
          id: 'team',
          label: 'Team',
          icon: Users,
          onClick: options.onUserManagementClick,
          active: options.activeItem === 'users',
          testId: 'rail-item-team',
        },
      ],
    },
  ];
}

/**
 * Overview contextual left rail (Field Operations Revision):
 * - Top item: Overview
 * - Blueprint section: Blueprint management (plus search/filter/sheet list rendered in Overview bottomSlot/blueprint slot)
 * Team and Attendance are top-level bar modules and are NOT placed inside Overview rail.
 */
export function buildOverviewRailGroups(
  routes: ProjectRouteHelpers,
  activeItem: 'overview' | 'blueprints' | 'settings' | 'users' | 'attendance'
): RailNavGroup[] {
  return [
    {
      id: 'overview-primary',
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: LayoutDashboard,
          to: routes.overviewPath,
          active: activeItem === 'overview',
          testId: 'rail-item-overview',
        },
      ],
    },
    {
      id: 'blueprint-section',
      label: 'Blueprint',
      items: [
        {
          id: 'blueprint-management',
          label: 'Blueprint management',
          icon: FileImage,
          to: routes.blueprintManagementPath,
          active: activeItem === 'blueprints',
          testId: 'rail-item-blueprint-management',
        },
      ],
    },
  ];
}

export function buildTeamRailGroups(
  routes: ProjectRouteHelpers,
  activeItem: 'team' | 'attendance' = 'team'
): RailNavGroup[] {
  return [
    {
      id: 'team-primary',
      items: [
        {
          id: 'team-directory',
          label: 'Team roster',
          icon: Users,
          to: routes.teamPath,
          active: activeItem === 'team',
          testId: 'rail-item-team-roster',
        },
        {
          id: 'team-attendance',
          label: 'Attendance',
          icon: Clock,
          to: routes.attendancePath,
          active: activeItem === 'attendance',
          testId: 'rail-item-team-attendance',
        },
      ],
    },
  ];
}

export function buildAttendanceRailGroups(
  activeView: 'manual' | 'roster',
  onSelectView: (view: 'manual' | 'roster') => void
): RailNavGroup[] {
  return [
    {
      id: 'attendance-views',
      items: [
        {
          id: 'attendance-manual',
          label: 'Manual attendance',
          icon: Clock,
          active: activeView === 'manual',
          onClick: () => onSelectView('manual'),
          testId: 'rail-item-attendance-manual',
        },
        {
          id: 'attendance-roster',
          label: 'Attendance roster',
          icon: Users,
          active: activeView === 'roster',
          onClick: () => onSelectView('roster'),
          testId: 'rail-item-attendance-roster',
        },
      ],
    },
  ];
}

export function buildWorkspaceRailGroups(options: {
  pinCount: number;
  pinListOpen: boolean;
  modelInfoOpen: boolean;
  onTogglePinList: () => void;
  onToggleModelInfo: () => void;
}): RailNavGroup[] {
  return [
    {
      id: 'workspace-panels',
      items: [
        {
          id: 'pin-list',
          label: 'Pin list',
          icon: MapPin,
          badge: options.pinCount,
          active: options.pinListOpen,
          onClick: options.onTogglePinList,
          testId: 'rail-item-pin-list',
        },
        {
          id: 'model-info',
          label: 'Model info',
          icon: Info,
          active: options.modelInfoOpen,
          onClick: options.onToggleModelInfo,
          testId: 'rail-item-model-info',
        },
      ],
    },
  ];
}

/**
 * Department-based PIN left rail (Stage E / Doc 05):
 * "All departments" followed by project department catalog entries.
 * Status filters remain inside the PIN page toolbar (no duplicate status filters in left rail).
 */
export function buildPinDepartmentRailGroups(options: {
  departments: ReadonlyArray<{ id: string; name: string; pinCount?: number }>;
  activeDepartmentId: string; // 'all' or department id
  onSelectDepartment: (departmentId: string) => void;
}): RailNavGroup[] {
  return [
    {
      id: 'pin-departments',
      label: 'Departments',
      items: [
        {
          id: 'pin-dept-all',
          label: 'All departments',
          icon: Layers,
          active: options.activeDepartmentId === 'all',
          onClick: () => options.onSelectDepartment('all'),
          testId: 'rail-item-pin-dept-all',
        },
        ...options.departments.map((dept) => ({
          id: `pin-dept-${dept.id}`,
          label: dept.name,
          icon: MapPin,
          badge: dept.pinCount,
          active: options.activeDepartmentId === dept.id,
          onClick: () => options.onSelectDepartment(dept.id),
          testId: `rail-item-pin-dept-${dept.id}`,
        })),
      ],
    },
  ];
}

/**
 * Legacy helper retained for backward compatibility where status-queue rail is referenced.
 */
export function buildWorkRailGroups(
  routes: ProjectRouteHelpers,
  activeFilter: 'all' | 'open' | 'pending-qc' | 'approved' | 'exceptions'
): RailNavGroup[] {
  return [
    {
      id: 'pin-views',
      items: [
        {
          id: 'all-pins',
          label: 'All Pins',
          icon: ClipboardList,
          to: routes.pinListPath,
          active: activeFilter === 'all',
          testId: 'rail-item-all-pins',
        },
        {
          id: 'open-pins',
          label: 'Open',
          icon: Box,
          to: `${routes.pinListPath}?filter=open`,
          active: activeFilter === 'open',
          testId: 'rail-item-open-pins',
        },
        {
          id: 'pending-qc',
          label: 'Pending QC',
          icon: ClipboardCheck,
          to: `${routes.pinListPath}?filter=pending-qc`,
          active: activeFilter === 'pending-qc',
          testId: 'rail-item-pending-qc',
        },
        {
          id: 'approved-pins',
          label: 'Approved',
          icon: CheckCircle2,
          to: `${routes.pinListPath}?filter=approved`,
          active: activeFilter === 'approved',
          testId: 'rail-item-approved-pins',
        },
        {
          id: 'material-exceptions',
          label: 'Material exceptions',
          icon: AlertTriangle,
          to: `${routes.pinListPath}?filter=exceptions`,
          active: activeFilter === 'exceptions',
          testId: 'rail-item-material-exceptions',
        },
      ],
    },
  ];
}

export function buildWarehouseRailGroups(
  routes: ProjectRouteHelpers,
  activeSlug: string
): RailNavGroup[] {
  return [
    {
      id: 'warehouse-ops',
      items: [
        {
          id: 'inventory',
          label: 'Inventory',
          icon: Package,
          to: routes.modulePath('inventory'),
          active: activeSlug === 'inventory',
          testId: 'rail-item-inventory',
        },
        {
          id: 'store-requests',
          label: 'Store Requests',
          icon: ClipboardList,
          to: routes.modulePath('store-requests'),
          active: activeSlug === 'store-requests',
          testId: 'rail-item-store-requests',
        },
        {
          id: 'purchase-requests',
          label: 'Purchase Requests',
          icon: FileSpreadsheet,
          to: routes.modulePath('purchase-requests'),
          active: activeSlug === 'purchase-requests',
          testId: 'rail-item-purchase-requests',
        },
        {
          id: 'market-list',
          label: 'Market List',
          icon: ShoppingCart,
          to: routes.modulePath('market-list'),
          active: activeSlug === 'market-list',
          testId: 'rail-item-market-list',
        },
        {
          id: 'goods-receipts',
          label: 'Goods Receipts',
          icon: Receipt,
          to: routes.modulePath('goods-receipts'),
          active: activeSlug === 'goods-receipts',
          testId: 'rail-item-goods-receipts',
        },
      ],
    },
  ];
}

export function buildAccountingRailGroups(
  routes: ProjectRouteHelpers,
  activeView: AccountingViewKey
): RailNavGroup[] {
  return [
    {
      id: 'accounting-views',
      items: [
        {
          id: 'department-budgets',
          label: 'Department budgets',
          icon: Wallet,
          to: routes.modulePath('accounting'),
          active: activeView === 'department-budgets',
          testId: 'rail-item-department-budgets',
        },
        {
          id: 'receiving-costs',
          label: 'Receiving costs',
          icon: DollarSign,
          to: `${routes.modulePath('accounting')}?view=receiving-costs`,
          active: activeView === 'receiving-costs',
          testId: 'rail-item-receiving-costs',
        },
        {
          id: 'internal-usage',
          label: 'Internal usage',
          icon: TrendingDown,
          to: `${routes.modulePath('accounting')}?view=internal-usage`,
          active: activeView === 'internal-usage',
          testId: 'rail-item-internal-usage',
        },
      ],
    },
  ];
}

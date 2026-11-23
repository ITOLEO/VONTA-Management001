import type { SpatialPin } from './types';

export interface ProjectDepartment {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  defaultPinColor: string;
  isSeeded: boolean;
  sortOrder: number;
  createdAt: string;
}

export const SEEDED_DEPARTMENT_SPECS: ReadonlyArray<{
  key: 'civil' | 'electrical' | 'plumbing' | 'finishing';
  name: 'Civil' | 'Electrical' | 'Plumbing' | 'Finishing';
  defaultPinColor: string;
  sortOrder: number;
}> = [
  { key: 'civil', name: 'Civil', defaultPinColor: '#2563EB', sortOrder: 1 },
  { key: 'electrical', name: 'Electrical', defaultPinColor: '#D4652F', sortOrder: 2 },
  { key: 'plumbing', name: 'Plumbing', defaultPinColor: '#0D9488', sortOrder: 3 },
  { key: 'finishing', name: 'Finishing', defaultPinColor: '#7C3AED', sortOrder: 4 },
];

export const EXTRA_DEPARTMENT_COLOR_PALETTE: readonly string[] = [
  '#B45309',
  '#0284C7',
  '#15803D',
  '#BE185D',
  '#4F46E5',
  '#475569',
];

export function slugifyDepartmentName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split('')
      .map((c) => `${c}${c}`)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

export function seedDefaultDepartments(
  projectId: string,
  createdAt = '2026-11-19T08:00:00.000Z'
): ProjectDepartment[] {
  return SEEDED_DEPARTMENT_SPECS.map((spec) => ({
    id: `dept-${spec.key}`,
    projectId,
    name: spec.name,
    slug: spec.key,
    defaultPinColor: spec.defaultPinColor,
    isSeeded: true,
    sortOrder: spec.sortOrder,
    createdAt,
  }));
}

export function ensureProjectDepartments(
  projectId: string,
  existing?: ProjectDepartment[] | null
): ProjectDepartment[] {
  const seeded = seedDefaultDepartments(projectId);
  if (!existing || existing.length === 0) {
    return seeded;
  }
  const bySlug = new Map<string, ProjectDepartment>();
  for (const d of seeded) {
    bySlug.set(d.slug.toLowerCase(), d);
  }
  for (const d of existing) {
    const key = (d.slug || slugifyDepartmentName(d.name)).toLowerCase();
    bySlug.set(key, {
      ...d,
      projectId: d.projectId || projectId,
      defaultPinColor: normalizeHexColor(d.defaultPinColor) ?? '#D4652F',
    });
  }
  return Array.from(bySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function addProjectDepartment(
  departments: ProjectDepartment[],
  projectId: string,
  input: { name: string; defaultPinColor?: string },
  nowIso = new Date().toISOString()
): { ok: true; departments: ProjectDepartment[]; created: ProjectDepartment } | { ok: false; error: string } {
  const cleanName = input.name.trim().replace(/\s+/g, ' ');
  if (!cleanName) {
    return { ok: false, error: 'Department name is required.' };
  }
  if (cleanName.length < 2 || cleanName.length > 40) {
    return { ok: false, error: 'Department name must be between 2 and 40 characters.' };
  }
  const lower = cleanName.toLowerCase();
  if (lower === 'all' || lower === 'all departments') {
    return { ok: false, error: 'Choose a specific department name.' };
  }
  if (departments.some((d) => d.name.trim().toLowerCase() === lower)) {
    return { ok: false, error: `Department "${cleanName}" already exists in this project.` };
  }

  let colorHex: string | null = null;
  if (input.defaultPinColor && input.defaultPinColor.trim()) {
    colorHex = normalizeHexColor(input.defaultPinColor);
    if (!colorHex) {
      return { ok: false, error: 'Enter a valid 6-digit hex color such as #2563EB.' };
    }
  } else {
    const usedColors = new Set(departments.map((d) => d.defaultPinColor.toUpperCase()));
    colorHex =
      EXTRA_DEPARTMENT_COLOR_PALETTE.find((hex) => !usedColors.has(hex.toUpperCase())) ??
      EXTRA_DEPARTMENT_COLOR_PALETTE[departments.length % EXTRA_DEPARTMENT_COLOR_PALETTE.length];
  }

  const slugBase = slugifyDepartmentName(cleanName) || `dept-${departments.length + 1}`;
  let id = `dept-${slugBase}`;
  let suffix = 2;
  while (departments.some((d) => d.id === id)) {
    id = `dept-${slugBase}-${suffix}`;
    suffix += 1;
  }

  const maxSort = departments.reduce((max, d) => Math.max(max, d.sortOrder), 0);
  const created: ProjectDepartment = {
    id,
    projectId,
    name: cleanName,
    slug: slugBase,
    defaultPinColor: colorHex,
    isSeeded: false,
    sortOrder: maxSort + 1,
    createdAt: nowIso,
  };

  return {
    ok: true,
    created,
    departments: [...departments, created],
  };
}

export function updateDepartmentPinColor(
  departments: ProjectDepartment[],
  deptId: string,
  colorHexInput: string
): { ok: true; departments: ProjectDepartment[]; updated: ProjectDepartment } | { ok: false; error: string } {
  const normalized = normalizeHexColor(colorHexInput);
  if (!normalized) {
    return { ok: false, error: 'Enter a valid 6-digit hex color (for example #D4652F).' };
  }
  const target = departments.find((d) => d.id === deptId);
  if (!target) {
    return { ok: false, error: 'Department not found in this project.' };
  }
  const updated: ProjectDepartment = { ...target, defaultPinColor: normalized };
  return {
    ok: true,
    updated,
    departments: departments.map((d) => (d.id === deptId ? updated : d)),
  };
}

export function findDepartmentByNameOrId(
  departments: ProjectDepartment[],
  nameOrId: string | null | undefined
): ProjectDepartment | undefined {
  if (!nameOrId) return undefined;
  const key = nameOrId.trim().toLowerCase();
  return departments.find(
    (d) =>
      d.id.toLowerCase() === key ||
      d.name.trim().toLowerCase() === key ||
      d.slug.toLowerCase() === key
  );
}

/**
 * Resolves the displayed color for a Pin:
 * - Explicit manual override (`pinColorOverride === true`) keeps its custom hex.
 * - Otherwise inherits the current default Pin color of its department in the project catalog.
 */
export function resolveEffectivePinColor(
  pin: Pick<SpatialPin, 'department' | 'color'> & { pinColorOverride?: boolean },
  departments: ProjectDepartment[]
): string {
  if (pin.pinColorOverride && pin.color) {
    return normalizeHexColor(pin.color) ?? '#D4652F';
  }
  const dept = findDepartmentByNameOrId(departments, pin.department);
  if (dept) {
    return dept.defaultPinColor;
  }
  return (pin.color && normalizeHexColor(pin.color)) || '#D4652F';
}

/**
 * Updates Pins inheriting a department's default color without overwriting Pins
 * that have an explicit manual color override.
 */
export function propagateDepartmentColorToPins<
  T extends Pick<SpatialPin, 'department' | 'color'> & { pinColorOverride?: boolean },
>(pins: T[], departmentName: string, nextColorHex: string): T[] {
  const targetLower = departmentName.trim().toLowerCase();
  const normalized = normalizeHexColor(nextColorHex) ?? nextColorHex;
  return pins.map((pin) => {
    if (pin.department.trim().toLowerCase() !== targetLower) {
      return pin;
    }
    if (pin.pinColorOverride) {
      return pin;
    }
    return { ...pin, color: normalized };
  });
}

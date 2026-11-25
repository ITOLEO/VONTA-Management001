import type { ProjectRole } from './accountTypes';
export type DemoRole = ProjectRole | 'admin';
export const demoProject = '/demo/projects/paviliun-kerja';
interface DemoAccount {
  role: DemoRole;
  name: string;
  email: string;
  title: string;
  tasks: readonly [string, string][];
}
function account(role: DemoRole, title: string, tasks: DemoAccount['tasks']): DemoAccount {
  const name = role + '-demo';
  return { role, name, email: name + '@demo.vonta.example', title, tasks };
}
const leadTasks: DemoAccount['tasks'] = [
  ['Drawing register', 'blueprints'],
  ['Spatial workspace', 'spatial'],
  ['Field Pins', 'pin'],
  ['Team access', 'team'],
  ['Department budgets', 'accounting'],
  ['Daily attendance', 'attendance'],
  ['Project settings', 'settings'],
];
export const demoAccounts = [
  account('worker', 'Worker', [
    ['Field Pins', 'pin'],
    ['Daily attendance', 'attendance'],
    ['Locate work', 'spatial'],
  ]),
  account('accounting', 'Accounting', [
    ['Department budgets', 'accounting'],
    ['Pin material requirements', 'pin'],
    ['Project overview', ''],
  ]),
  account('contractor', 'Contractor', leadTasks),
  account('architect', 'Architect', leadTasks),
  account('owner', 'Owner', [
    ['Project overview', ''],
    ['Inspect the model', 'spatial'],
    ['Department budgets', 'accounting'],
    ['Team and attendance', 'attendance'],
  ]),
  account('admin', 'Developer demo', []),
];
export function demoForEmail(email: string) {
  return demoAccounts.find((a) => a.email === email.trim().toLowerCase());
}
export function isDeveloper(metadata: Record<string, unknown> | undefined) {
  return metadata?.vonta_platform_role === 'developer' && !metadata.vonta_demo;
}

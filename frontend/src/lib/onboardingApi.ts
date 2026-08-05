import { adminHeaders, adminRequest as request } from './adminApi';

export interface ReleaseNoteHighlight {
  title: string;
  body: string;
}
export interface ReleaseNoteEntry {
  version: string;
  date: string;
  title: string;
  highlights: ReleaseNoteHighlight[];
}

export type SeedChangeStatus = 'new' | 'changed' | 'unchanged' | 'tombstoned';

export interface SeedChangeEntry {
  dialogId: string;
  title: string;
  status: SeedChangeStatus;
  userModified: boolean;
  summary?: string;
}

export interface LastAutoSync {
  at: string;
  inserted: number;
  updated: number;
  skipped: number;
  insertedIds: string[];
  updatedIds: string[];
}

export interface OnboardingStatus {
  currentVersion: string;
  seenVersion: string;
  hasNewVersion: boolean;
  releaseNotes: ReleaseNoteEntry[];
  seedChanges: SeedChangeEntry[];
  lastAutoSync: LastAutoSync | null;
}

export function getOnboardingStatus() {
  return request<OnboardingStatus>('/api/admin/onboarding/status', { headers: adminHeaders() });
}

export function importSeedDialog(dialogId: string) {
  return request<SeedChangeEntry>('/api/admin/onboarding/import-seed', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ dialogId }),
  });
}

export function acknowledgeOnboarding() {
  return request<{ seenVersion: string }>('/api/admin/onboarding/acknowledge', {
    method: 'POST',
    headers: adminHeaders(),
  });
}

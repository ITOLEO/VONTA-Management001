import { createInitialDemoState, DEMO_SCHEMA_VERSION } from '../domain/demoStore';
import type { DemoState } from '../domain/types';

/**
 * Isolated Demo Data Repository.
 * Keeps all demo persistence strictly outside UI components so Supabase
 * Auth/PostgreSQL/Storage can replace this adapter during the integration phase.
 */

const DEMO_STORAGE_KEY = 'vonta_demo_contractor_state_v1';
const DEMO_MEDIA_DB_NAME = 'vonta_demo_media_v1';
const DEMO_MEDIA_STORE = 'blobs';

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DEMO_MEDIA_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DEMO_MEDIA_STORE)) {
          db.createObjectStore(DEMO_MEDIA_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putMediaItem(key: string, dataUrl: string): Promise<void> {
  const db = await openMediaDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DEMO_MEDIA_STORE, 'readwrite');
      tx.objectStore(DEMO_MEDIA_STORE).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getMediaItem(key: string): Promise<string | null> {
  const db = await openMediaDb();
  if (!db) return null;
  return new Promise<string | null>((resolve) => {
    try {
      const tx = db.transaction(DEMO_MEDIA_STORE, 'readonly');
      const req = tx.objectStore(DEMO_MEDIA_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function clearMediaDb(): Promise<void> {
  const db = await openMediaDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DEMO_MEDIA_STORE, 'readwrite');
      tx.objectStore(DEMO_MEDIA_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

const IDB_REF_PREFIX = 'idb://';

export interface DemoRepository {
  loadState(): Promise<DemoState>;
  saveState(state: DemoState): Promise<{ persisted: boolean; warning?: string }>;
  resetState(): Promise<DemoState>;
}

export const localDemoRepository: DemoRepository = {
  async loadState(): Promise<DemoState> {
    if (typeof window === 'undefined') {
      return createInitialDemoState();
    }
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
      if (!raw) {
        return createInitialDemoState();
      }
      const parsed = JSON.parse(raw) as DemoState;
      if (!parsed || parsed.schemaVersion !== DEMO_SCHEMA_VERSION || !Array.isArray(parsed.pins)) {
        return createInitialDemoState();
      }

      // Hydrate any IndexedDB-offloaded images (custom blueprint or large evidence photos)
      let customBlueprintDataUrl = parsed.customBlueprintDataUrl;
      if (customBlueprintDataUrl && customBlueprintDataUrl.startsWith(IDB_REF_PREFIX)) {
        customBlueprintDataUrl = await getMediaItem(customBlueprintDataUrl.slice(IDB_REF_PREFIX.length));
      }

      const hydratedPins = await Promise.all(
        parsed.pins.map(async (pin) => {
          let before = pin.evidence.before;
          let after = pin.evidence.after;

          if (before && before.dataUrl.startsWith(IDB_REF_PREFIX)) {
            const loaded = await getMediaItem(before.dataUrl.slice(IDB_REF_PREFIX.length));
            before = loaded ? { ...before, dataUrl: loaded } : null;
          }
          if (after && after.dataUrl.startsWith(IDB_REF_PREFIX)) {
            const loaded = await getMediaItem(after.dataUrl.slice(IDB_REF_PREFIX.length));
            after = loaded ? { ...after, dataUrl: loaded } : null;
          }

          return {
            ...pin,
            areaId: pin.areaId ?? 'area-a03-ground',
            evidence: { before, after },
          };
        })
      );

      const initial = createInitialDemoState();
      return {
        ...parsed,
        areas: Array.isArray(parsed.areas) && parsed.areas.length > 0 ? parsed.areas : initial.areas,
        customBlueprintDataUrl,
        pins: hydratedPins,
      };
    } catch {
      return createInitialDemoState();
    }
  },

  async saveState(state: DemoState): Promise<{ persisted: boolean; warning?: string }> {
    if (typeof window === 'undefined') {
      return { persisted: false };
    }

    try {
      // Offload larger data URLs (> 120 KB) to IndexedDB so localStorage never hits quota
      const offloadThreshold = 120_000;
      let serializedBlueprint = state.customBlueprintDataUrl;

      if (serializedBlueprint && serializedBlueprint.length > offloadThreshold) {
        const key = 'custom-blueprint';
        await putMediaItem(key, serializedBlueprint);
        serializedBlueprint = `${IDB_REF_PREFIX}${key}`;
      }

      const serializedPins = await Promise.all(
        state.pins.map(async (pin) => {
          let before = pin.evidence.before;
          let after = pin.evidence.after;

          if (before && before.dataUrl.length > offloadThreshold) {
            await putMediaItem(before.id, before.dataUrl);
            before = { ...before, dataUrl: `${IDB_REF_PREFIX}${before.id}` };
          }
          if (after && after.dataUrl.length > offloadThreshold) {
            await putMediaItem(after.id, after.dataUrl);
            after = { ...after, dataUrl: `${IDB_REF_PREFIX}${after.id}` };
          }

          return {
            ...pin,
            evidence: { before, after },
          };
        })
      );

      const toStore: DemoState = {
        ...state,
        customBlueprintDataUrl: serializedBlueprint,
        pins: serializedPins,
      };

      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(toStore));
      return { persisted: true };
    } catch {
      return {
        persisted: false,
        warning: 'Local browser storage quota reached. Changes stay active for this session.',
      };
    }
  },

  async resetState(): Promise<DemoState> {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
      await clearMediaDb();
    }
    const fresh = createInitialDemoState();
    await this.saveState(fresh);
    return fresh;
  },
};

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read file as data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

import { migrateAnimationProject } from './animation-migrations';
import { type AnimationParameterDescriptor, type AnimationProject } from './animation-project';
import { validateAnimationProject } from './animation-validation';
import { type ContourSettings } from './contour-engine';

const DATABASE_NAME = 'slicewise-animations';
const DATABASE_VERSION = 1;
const STORE_NAME = 'animationProjects';
const LOCAL_PROJECT_ID_KEY = 'slicewise.animationProjectId';

export interface StoredAnimationProject {
  storageVersion: 1;
  id: string;
  updatedAt: string;
  project: AnimationProject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('IndexedDB request failed')),
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('Animation storage transaction was aborted')),
    );
    transaction.addEventListener('error', () =>
      reject(transaction.error ?? new Error('Animation storage transaction failed')),
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('Could not open animation storage')),
    );
  });
}

function generatedProjectId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `animation-${randomId}`;
  return `animation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Returns the stable browser-local workspace id used to associate one animation project. */
export function localAnimationProjectId(storage?: Pick<Storage, 'getItem' | 'setItem'>): string {
  try {
    const target = storage ?? globalThis.localStorage;
    const existing = target.getItem(LOCAL_PROJECT_ID_KEY)?.trim();
    if (existing) return existing;
    const id = generatedProjectId();
    target.setItem(LOCAL_PROJECT_ID_KEY, id);
    return id;
  } catch {
    return generatedProjectId();
  }
}

/** Repairs either the current storage envelope or a legacy raw project record. */
export function restoreStoredAnimationProject(
  value: unknown,
  fallbackBaseSettings: ContourSettings,
  descriptors: readonly AnimationParameterDescriptor[],
): AnimationProject {
  const candidate =
    isRecord(value) && value.storageVersion === 1 && 'project' in value ? value.project : value;
  return migrateAnimationProject(candidate, fallbackBaseSettings, descriptors);
}

export async function loadAnimationProject(
  id: string,
  fallbackBaseSettings: ContourSettings,
  descriptors: readonly AnimationParameterDescriptor[],
): Promise<AnimationProject | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completed = transactionComplete(transaction);
    const stored = await requestResult(
      transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredAnimationProject | undefined>,
    );
    await completed;
    return stored ? restoreStoredAnimationProject(stored, fallbackBaseSettings, descriptors) : null;
  } finally {
    database.close();
  }
}

export async function saveAnimationProject(
  id: string,
  project: AnimationProject,
  descriptors: readonly AnimationParameterDescriptor[],
): Promise<void> {
  if (!id.trim()) throw new Error('Animation project id is required');
  const validation = validateAnimationProject(project, descriptors);
  if (!validation.valid)
    throw new Error(`Cannot save invalid animation project: ${validation.errors.join(' ')}`);

  const stored: StoredAnimationProject = {
    storageVersion: 1,
    id,
    updatedAt: new Date().toISOString(),
    project: structuredClone(project),
  };
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).put(stored);
    await completed;
  } finally {
    database.close();
  }
}

import type { ContourSettings } from './contour-engine';

const DATABASE_NAME = 'slicewise';
const DATABASE_VERSION = 1;
const STORE_NAME = 'parameterSnapshots';

export type ParameterSnapshot = {
  id: string;
  name: string;
  createdAt: string;
  parameters: ContourSettings;
  randomLocks: string[];
};

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
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted')),
    );
    transaction.addEventListener('error', () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed')),
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('Could not open snapshot storage')),
    );
  });
}

export async function listParameterSnapshots(): Promise<ParameterSnapshot[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completed = transactionComplete(transaction);
    const snapshots = await requestResult(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<ParameterSnapshot[]>,
    );
    await completed;
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    database.close();
  }
}

export async function saveParameterSnapshot(snapshot: ParameterSnapshot): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).put(snapshot);
    await completed;
  } finally {
    database.close();
  }
}

export async function deleteParameterSnapshot(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await completed;
  } finally {
    database.close();
  }
}

import type { SurfaceCompensation } from './gcode-3d-toolpaths';

const STORAGE_PREFIX = 'slicewise:uuna-surface-plane:v1:';

type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export type SurfacePlane = Extract<SurfaceCompensation, { mode: 'plane' }>;

function storageKey(profileId: string): string {
  return STORAGE_PREFIX + profileId;
}

export function defaultSurfacePlane(width: number, height: number): SurfacePlane {
  return { mode: 'plane', originOffset: 0, xOffset: 0, yOffset: 0, width, height };
}

export function loadSurfacePlanePreset(
  profileId: string,
  storage: StorageLike = globalThis.localStorage,
): SurfacePlane | null {
  try {
    const parsed = JSON.parse(
      storage.getItem(storageKey(profileId)) || 'null',
    ) as Partial<SurfacePlane>;
    if (
      parsed?.mode !== 'plane' ||
      !Number.isFinite(parsed.originOffset) ||
      !Number.isFinite(parsed.xOffset) ||
      !Number.isFinite(parsed.yOffset) ||
      !Number.isFinite(parsed.width) ||
      !Number.isFinite(parsed.height) ||
      Number(parsed.width) <= 0 ||
      Number(parsed.height) <= 0
    )
      return null;
    return {
      mode: 'plane',
      originOffset: Number(parsed.originOffset),
      xOffset: Number(parsed.xOffset),
      yOffset: Number(parsed.yOffset),
      width: Number(parsed.width),
      height: Number(parsed.height),
    };
  } catch {
    return null;
  }
}

export function saveSurfacePlanePreset(
  profileId: string,
  plane: SurfacePlane,
  storage: StorageLike = globalThis.localStorage,
): void {
  storage.setItem(storageKey(profileId), JSON.stringify(plane));
}

export function clearSurfacePlanePreset(
  profileId: string,
  storage: StorageLike = globalThis.localStorage,
): void {
  storage.removeItem(storageKey(profileId));
}

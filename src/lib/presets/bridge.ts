import type { PresetDocument } from './types';
export interface PresetRequest {
  command: 'capture' | 'apply' | 'undo' | 'validate';
  document?: PresetDocument;
  includeSource?: boolean;
  signal?: AbortSignal;
  result?: Promise<PresetDocument>;
}
export function requestPreset(request: Omit<PresetRequest, 'result'>): Promise<PresetDocument> {
  const detail: PresetRequest = { ...request };
  document.dispatchEvent(new CustomEvent('presetrequest', { detail }));
  return (
    detail.result ?? Promise.reject(new Error('The workspace is still starting. Please try again.'))
  );
}

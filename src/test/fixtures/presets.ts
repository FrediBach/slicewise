import { PRESET_SECTIONS, type PresetDocument } from '../../lib/presets/types';

/** Envelope fixture only; section payloads deliberately use a tiny test codec. */
export function presetEnvelope(): PresetDocument {
  return {
    format: 'slicewise-preset',
    formatVersion: 1,
    id: '3a65ba79-842c-4a15-823d-c794794ef1a0',
    metadata: {
      name: 'Contour study',
      description: '',
      tags: ['study'],
      createdAt: '2026-09-09T12:00:00.000Z',
      updatedAt: '2026-09-09T12:00:00.000Z',
    },
    createdWith: { appVersion: '1.0.0' },
    entryMode: 'config',
    sections: Object.fromEntries(
      PRESET_SECTIONS.map((name) => [
        name,
        {
          version: 1,
          requiredFeatures: [],
          data: { amount: 1 },
        },
      ]),
    ),
    assets: {},
  };
}

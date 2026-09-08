import type { Triple } from './three-d-project';

// Nominal manufacturer build volumes, verified 2026-09-08. Sources: docs/PARAMETERS.md.
// These rectangular envelopes do not model printer-specific exclusion zones.
export const PRINTER_PRESETS: ReadonlyArray<{
  id: string;
  brand: string;
  name: string;
  size: Triple;
}> = [
  { id: 'bambu-a1-mini', brand: 'Bambu Lab', name: 'A1 mini', size: [180, 180, 180] },
  { id: 'bambu-a1', brand: 'Bambu Lab', name: 'A1', size: [256, 256, 256] },
  { id: 'bambu-p1s', brand: 'Bambu Lab', name: 'P1S', size: [256, 256, 256] },
  { id: 'bambu-x1-carbon', brand: 'Bambu Lab', name: 'X1 Carbon', size: [256, 256, 256] },
  { id: 'prusa-mini', brand: 'Prusa', name: 'MINI+', size: [180, 180, 180] },
  { id: 'prusa-mk4s', brand: 'Prusa', name: 'MK4S', size: [250, 210, 220] },
  { id: 'prusa-core-one', brand: 'Prusa', name: 'CORE One', size: [250, 220, 270] },
  { id: 'prusa-xl', brand: 'Prusa', name: 'XL', size: [360, 360, 360] },
  { id: 'creality-k1c', brand: 'Creality', name: 'K1C', size: [220, 220, 250] },
];
export const printerPreset = (id: string | undefined) => PRINTER_PRESETS.find((p) => p.id === id);

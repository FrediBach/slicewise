/** All scalar RGB controls use the same morph and animation interpolation. */
export function isMorphColor(key: string): boolean {
  return key === 'color' || key.endsWith('Color') || /^misregistrationColor[123]$/.test(key);
}

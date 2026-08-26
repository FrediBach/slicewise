export type DisableableControl = Pick<HTMLInputElement, 'disabled'>;

export function setDisabledPair(
  slider: DisableableControl,
  number: DisableableControl,
  disabled: boolean,
): void {
  slider.disabled = disabled;
  number.disabled = disabled;
}

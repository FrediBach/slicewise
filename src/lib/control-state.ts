export type DisableableControl = Pick<HTMLInputElement, 'disabled' | 'title'>;

export function setDisabled(control: DisableableControl, disabled: boolean, reason?: string): void {
  control.disabled = disabled;
  if (!disabled) control.title = '';
  else if (reason !== undefined) control.title = reason;
}

export function setDisabledPair(
  slider: DisableableControl,
  number: DisableableControl,
  disabled: boolean,
  reason?: string,
): void {
  setDisabled(slider, disabled, reason);
  setDisabled(number, disabled, reason);
}

import { useEffect, useRef, type InputHTMLAttributes } from 'react';

// Keep incomplete numeric text editable; only valid values reach the project.
export function PhysicalNumberInput({
  value,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value: number }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.value = String(value);
  }, [value]);
  return (
    <input
      {...props}
      ref={input}
      defaultValue={value}
      onBlur={() => {
        if (
          input.current &&
          (!input.current.validity.valid || !Number.isFinite(input.current.valueAsNumber))
        )
          input.current.value = String(value);
      }}
    />
  );
}

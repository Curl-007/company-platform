import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T;
  defaultProp: T;
  onChange?: (value: T) => void;
}) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultProp);
  const value = prop === undefined ? uncontrolledValue : prop;

  const setValue = React.useCallback(
    (nextValue: React.SetStateAction<T>) => {
      const resolvedValue = typeof nextValue === 'function'
        ? (nextValue as (previousValue: T) => T)(value)
        : nextValue;

      if (prop === undefined) setUncontrolledValue(resolvedValue);
      if (!Object.is(resolvedValue, value)) onChange?.(resolvedValue);
    },
    [onChange, prop, value],
  );

  return [value, setValue] as const;
}

export function onlyElement(children: React.ReactNode) {
  const child = React.Children.only(children);
  if (!React.isValidElement(child)) throw new Error('asChild expects a single React element');
  return child as React.ReactElement<Record<string, unknown>>;
}

export function composeEventHandlers<E extends React.SyntheticEvent>(
  original: unknown,
  handler: (event: E) => void,
) {
  return (event: E) => {
    if (typeof original === 'function') (original as (event: E) => void)(event);
    if (!event.defaultPrevented) handler(event);
  };
}

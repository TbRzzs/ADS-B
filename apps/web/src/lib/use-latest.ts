import { useLayoutEffect, useRef } from 'react';

/** Ref que siempre apunta al último valor: callbacks estables sin re-suscribirse. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

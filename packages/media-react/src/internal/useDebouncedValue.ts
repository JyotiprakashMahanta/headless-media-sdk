import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce.
 *
 * Lives in the wrapper rather than the core because "wait for the user to stop
 * typing" is a React-timing concern, not media knowledge — core would have to
 * reach for `setTimeout` and stop being environment-agnostic to provide it.
 * Lives here rather than in the app because every consumer of `useMediaSearch`
 * needs it and re-writing it per app is how rate limits get hit.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

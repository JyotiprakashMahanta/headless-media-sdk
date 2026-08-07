/**
 * Prop merging for React Native.
 *
 * Same contract as the web version, two differences that matter:
 *
 *   - RN handler names are `onPress` / `onLayout` / `onViewableItemsChanged`,
 *     not just `on*` DOM events, but the `on` + capital-letter test covers all
 *     of them.
 *   - RN's synthetic events have no `defaultPrevented`, so the web escape hatch
 *     ("call preventDefault to skip the built-in behaviour") does not exist.
 *     Instead a consumer handler may return `false` to stop ours running. That
 *     difference is documented rather than papered over — pretending the two
 *     platforms are identical is how leaky abstractions start.
 *   - `style` in RN may be an array; arrays compose in order, so we build one
 *     rather than object-spreading.
 */

type AnyProps = Record<string, unknown>;

const isHandler = (key: string, value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === 'function' && key.length > 2 && key.startsWith('on') && key[2] === key[2]?.toUpperCase();

export function mergeProps<Base extends AnyProps, Override extends AnyProps>(
  base: Base,
  overrides?: Override,
): Base & Override {
  if (!overrides) return base as Base & Override;

  const result: AnyProps = { ...base };

  for (const [key, overrideValue] of Object.entries(overrides)) {
    const baseValue = base[key];

    if (isHandler(key, overrideValue) && isHandler(key, baseValue)) {
      result[key] = (...args: unknown[]) => {
        const outcome = overrideValue(...args);
        if (outcome === false) return; // consumer opted out
        baseValue(...args);
      };
      continue;
    }

    if (key === 'style') {
      // RN style props accept arrays; later entries win, which matches the
      // "consumer overrides the hook" expectation.
      const combined = [baseValue, overrideValue].filter(Boolean);
      result[key] = combined.length === 1 ? combined[0] : combined;
      continue;
    }

    result[key] = overrideValue;
  }

  return result as Base & Override;
}

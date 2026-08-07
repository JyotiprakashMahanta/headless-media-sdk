import type { CSSProperties, Ref } from 'react';

/**
 * The utility that makes prop-getters real rather than decorative.
 *
 * A prop-getter is only useful if the consumer can pass their own props into it
 * and have both sets survive:
 *
 *     <div {...getItemProps(item, i, { className: 'card', onClick: track })} />
 *
 * Naive spreading loses one side. This merges the three prop kinds that
 * actually collide:
 *
 *   - event handlers -> both run, CONSUMER FIRST. If the consumer calls
 *     `preventDefault()` ours is skipped, which is the documented way to opt
 *     out of a built-in behaviour without forking the hook.
 *   - className / style -> concatenated and shallow-merged, consumer wins on
 *     conflicting style keys.
 *   - ref -> both are attached via a composed callback ref, so the consumer can
 *     keep their own ref on an element the hook also needs to measure.
 */

type AnyProps = Record<string, unknown>;

const isEventHandler = (key: string, value: unknown): value is (...args: unknown[]) => void =>
  typeof value === 'function' && key.length > 2 && key.startsWith('on') && key[2] === key[2]?.toUpperCase();

function composeRefs<T>(...refs: (Ref<T> | undefined)[]): (instance: T | null) => void {
  return (instance: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(instance);
      else (ref as { current: T | null }).current = instance;
    }
  };
}

/**
 * Merge hook-owned props (`base`) with consumer overrides (`overrides`).
 * Later arguments win for plain values.
 */
export function mergeProps<Base extends AnyProps, Override extends AnyProps>(
  base: Base,
  overrides?: Override,
): Base & Override {
  if (!overrides) return base as Base & Override;

  const result: AnyProps = { ...base };

  for (const [key, overrideValue] of Object.entries(overrides)) {
    const baseValue = base[key];

    if (isEventHandler(key, overrideValue) && isEventHandler(key, baseValue)) {
      result[key] = (...args: unknown[]) => {
        overrideValue(...args);
        const event = args[0] as { defaultPrevented?: boolean } | undefined;
        // Consumer opted out of the built-in behaviour.
        if (event && event.defaultPrevented) return;
        baseValue(...args);
      };
      continue;
    }

    if (key === 'className') {
      result[key] = [baseValue, overrideValue].filter(Boolean).join(' ');
      continue;
    }

    if (key === 'style') {
      result[key] = { ...(baseValue as CSSProperties), ...(overrideValue as CSSProperties) };
      continue;
    }

    if (key === 'ref') {
      result[key] = composeRefs(baseValue as Ref<unknown>, overrideValue as Ref<unknown>);
      continue;
    }

    result[key] = overrideValue;
  }

  return result as Base & Override;
}

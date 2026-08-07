/**
 * The complete ambient surface `media-core` assumes from its host.
 *
 * This package compiles with `"lib": ["ES2022"], "types": []` — no DOM, no
 * Node. That means `console` is not defined for us, so we declare the three
 * methods we use and nothing else.
 *
 * The payoff is that this file IS the portability contract: anything a host
 * environment must provide is listed here, and it is four lines long. `fetch`
 * is not in this list because it is injected through `configureMedia({ fetch })`
 * rather than reached for globally.
 */
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

/// <reference path="../../../types/react-native.d.ts" />

/**
 * Pulls in the repo-level `react-native` typecheck shim, and declares the two
 * platform globals this package uses.
 *
 * `react-native` is a peerDependency here and is deliberately not installed —
 * see `types/react-native.d.ts` and the README for why. When this package is
 * consumed inside a real RN app, RN's own types win and the shim is inert.
 *
 * `AbortController` is declared rather than pulled from `lib.dom`, because this
 * package compiles without DOM on purpose (so a stray `document.` fails the
 * build). Hermes and JSC both ship it; React Native 0.60+ has had it since
 * whatwg-fetch landed.
 */
declare class AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

declare class AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}


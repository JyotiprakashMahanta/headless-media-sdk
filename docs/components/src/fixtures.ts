/**
 * Fixture data for the live demos.
 *
 * This file is the proof of the whole headless claim: these are plain objects
 * with a shape this docs site invented. There is no `media-core` import here,
 * no `MediaItem` type, no Pexels, and no API key anywhere in this deployment —
 * and the components below render them perfectly.
 *
 * If `media-ui-react` had any SDK knowledge in it, this page could not exist.
 */

export interface DemoItem {
  id: string;
  label: string;
  color: string;
  ratio: number;
}

const PALETTE = [
  '#4c8dff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8',
  '#20c997', '#ff922b', '#748ffc', '#f06595', '#22b8cf',
];

const RATIOS = [1, 1.5, 0.75, 1.33, 1];

export function makeItems(count: number, offset = 0): DemoItem[] {
  return Array.from({ length: count }, (_, index) => {
    const n = offset + index;
    return {
      id: `demo-${n}`,
      label: `Item ${n + 1}`,
      color: PALETTE[n % PALETTE.length]!,
      ratio: RATIOS[n % RATIOS.length]!,
    };
  });
}

/** Fake paginated source, so the infinite-scroll demo is a real one. */
export function fetchDemoPage(page: number, perPage = 12): Promise<DemoItem[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(makeItems(perPage, (page - 1) * perPage)), 400);
  });
}

export const MAX_DEMO_PAGES = 4;

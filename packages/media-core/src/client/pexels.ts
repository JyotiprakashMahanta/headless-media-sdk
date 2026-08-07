import type { MediaItem, MediaPage, MediaRendition } from '../types.js';

/**
 * Provider adapter.
 *
 * This is the ONLY file that knows what Pexels JSON looks like. Everything
 * above it consumes `MediaItem` / `MediaPage`. Swapping to Unsplash means
 * writing a sibling of this file and changing one line in `mediaClient.ts` —
 * no hook, no component and no app code changes.
 *
 * The raw types below are hand-written from the Pexels docs rather than pulled
 * from a package, so the surface we depend on is visible and reviewable.
 */

/* -------------------------------------------------------------------------- */
/* Raw provider shapes                                                        */
/* -------------------------------------------------------------------------- */

export interface RawPexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string | null;
  alt: string | null;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

export interface RawPexelsVideoFile {
  id: number;
  quality: string | null;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
}

export interface RawPexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: { id: number; name: string; url: string };
  video_files: RawPexelsVideoFile[];
  video_pictures: { id: number; picture: string; nr: number }[];
}

export interface RawPexelsPhotoPage {
  page: number;
  per_page: number;
  total_results?: number;
  next_page?: string;
  photos: RawPexelsPhoto[];
}

export interface RawPexelsVideoPage {
  page: number;
  per_page: number;
  total_results?: number;
  next_page?: string;
  videos: RawPexelsVideo[];
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pexels returns named `src` variants without dimensions. These are the widths
 * documented for each variant; they are approximate for non-standard aspect
 * ratios but only ever used for ordering and `srcset`-style selection, so
 * "approximately right and consistently ordered" is the requirement.
 */
const PHOTO_VARIANT_WIDTHS = [
  ['tiny', 280],
  ['small', 400],
  ['medium', 640],
  ['large', 940],
  ['large2x', 1880],
] as const;

const safeRatio = (width: number, height: number): number =>
  height > 0 && width > 0 ? width / height : 1;

export function mapPhoto(raw: RawPexelsPhoto): MediaItem {
  const renditions: MediaRendition[] = PHOTO_VARIANT_WIDTHS.map(([variant, width]) => ({
    url: raw.src[variant],
    width,
    height: Math.round(width / safeRatio(raw.width, raw.height)),
  }));
  renditions.push({ url: raw.src.original, width: raw.width, height: raw.height });

  return {
    id: `photo:${raw.id}`,
    kind: 'photo',
    sourceUrl: raw.url,
    width: raw.width,
    height: raw.height,
    aspectRatio: safeRatio(raw.width, raw.height),
    placeholderColor: raw.avg_color,
    // Pexels' `alt` is frequently empty. Falling back to the photographer's
    // name is a poor description, so we describe the subject we do know about
    // and let the app override via its own labelling if it has better context.
    alt: raw.alt?.trim() ? raw.alt.trim() : `Photo by ${raw.photographer}`,
    author: {
      id: String(raw.photographer_id),
      name: raw.photographer,
      profileUrl: raw.photographer_url,
    },
    thumbnailUrl: raw.src.medium,
    previewUrl: raw.src.large,
    downloadUrl: raw.src.original,
    durationSeconds: null,
    renditions,
  };
}

export function mapVideo(raw: RawPexelsVideo): MediaItem {
  const files = [...raw.video_files]
    .filter((file) => file.link)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));

  const renditions: MediaRendition[] = files.map((file) => ({
    url: file.link,
    width: file.width ?? raw.width,
    height: file.height ?? raw.height,
    mimeType: file.file_type,
  }));

  // Prefer an mp4 around 720p for playback: HLS is not universally supported by
  // a bare <video> tag, and the 4K originals stall on mobile connections.
  const mp4s = files.filter((file) => file.file_type === 'video/mp4');
  const playable =
    mp4s.find((file) => (file.width ?? 0) >= 640 && (file.width ?? 0) <= 1280) ??
    mp4s[mp4s.length - 1] ??
    files[files.length - 1];

  const largest = files[files.length - 1];

  return {
    id: `video:${raw.id}`,
    kind: 'video',
    sourceUrl: raw.url,
    width: raw.width,
    height: raw.height,
    aspectRatio: safeRatio(raw.width, raw.height),
    placeholderColor: null,
    alt: `Video by ${raw.user.name}`,
    author: {
      id: String(raw.user.id),
      name: raw.user.name,
      profileUrl: raw.user.url,
    },
    thumbnailUrl: raw.image,
    previewUrl: playable?.link ?? raw.image,
    downloadUrl: largest?.link ?? playable?.link ?? raw.image,
    durationSeconds: raw.duration,
    renditions,
  };
}

/** Pexels signals "more pages" with a `next_page` URL; we expose a number. */
function toPage(
  items: MediaItem[],
  raw: { page: number; per_page: number; total_results?: number; next_page?: string },
): MediaPage {
  const hasMore = Boolean(raw.next_page) && items.length > 0;
  return {
    items,
    page: raw.page,
    perPage: raw.per_page,
    totalResults: typeof raw.total_results === 'number' ? raw.total_results : null,
    hasMore,
    nextPage: hasMore ? raw.page + 1 : null,
  };
}

export const mapPhotoPage = (raw: RawPexelsPhotoPage): MediaPage =>
  toPage((raw.photos ?? []).map(mapPhoto), raw);

export const mapVideoPage = (raw: RawPexelsVideoPage): MediaPage =>
  toPage((raw.videos ?? []).map(mapVideo), raw);

/** `"photo:123"` -> `{ kind, providerId }`. Ids are namespaced because the
 *  photo and video endpoints have overlapping numeric id spaces. */
export function parseMediaId(id: string): { kind: 'photo' | 'video'; providerId: string } {
  const [prefix, ...rest] = id.split(':');
  const providerId = rest.join(':');
  if ((prefix === 'photo' || prefix === 'video') && providerId) {
    return { kind: prefix, providerId };
  }
  // Bare numeric ids are assumed to be photos, matching Pexels' default.
  return { kind: 'photo', providerId: id };
}

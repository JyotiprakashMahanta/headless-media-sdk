import { useEffect, useRef, useState } from 'react';
import type { MediaEvent, MediaEventListener, MediaEventMap, MediaEventName } from 'media-core';
import { useMediaClient } from './MediaProvider.js';

/**
 * Event subscription, adapted to React's lifecycle.
 *
 * The whole value of these hooks is the ref indirection: a caller writing
 *
 *     useMediaEvent('download', (e) => setCount(c => c + 1))
 *
 * passes a new function every render. Subscribing to that directly would
 * unsubscribe and resubscribe on every render. Storing the handler in a ref
 * means one subscription for the component's whole life, and the latest
 * handler always runs. This is exactly the "adapt core to platform idioms"
 * job the wrapper exists for.
 */

/** Subscribe to one event type. */
export function useMediaEvent<K extends MediaEventName>(
  type: K,
  handler: (event: MediaEventMap[K]) => void,
  options: { enabled?: boolean } = {},
): void {
  const client = useMediaClient();
  const { enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const listener: MediaEventListener<K> = (event) => handlerRef.current(event);
    return client.on(type, listener);
  }, [client, type, enabled]);
}

/** Subscribe to every event. */
export function useMediaEvents(
  handler: (event: MediaEvent) => void,
  options: { enabled?: boolean } = {},
): void {
  const client = useMediaClient();
  const { enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    return client.onAny((event) => handlerRef.current(event));
  }, [client, enabled]);
}

/**
 * Rolling in-memory activity log.
 *
 * The brief asks that the app be able to track activity independently of the
 * SDK's own console listener; this is the ready-made version of that. Newest
 * first, capped, so an all-day session cannot grow without bound.
 */
export function useMediaActivity(options: { limit?: number; types?: MediaEventName[] } = {}): MediaEvent[] {
  const { limit = 50, types } = options;
  const [events, setEvents] = useState<MediaEvent[]>([]);

  const typesKey = types ? types.join(',') : '';
  const typesRef = useRef(types);
  typesRef.current = types;

  useMediaEvents((event) => {
    const allowed = typesRef.current;
    if (allowed && !allowed.includes(event.type)) return;
    setEvents((previous) => [event, ...previous].slice(0, limit));
  });

  useEffect(() => {
    setEvents([]);
  }, [typesKey, limit]);

  return events;
}

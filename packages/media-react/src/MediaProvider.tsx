import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createMediaClient, type MediaClient, type MediaClientConfig } from 'media-core';

/**
 * The one place a React tree gets a client.
 *
 * Deliberately NOT using `media-core`'s module singleton (`configureMedia`):
 * a singleton is invisible to tests, leaks between SSR requests, and makes two
 * differently-configured trees impossible. A context-scoped client costs one
 * component and removes all three problems.
 */

const MediaClientContext = createContext<MediaClient | null>(null);

export interface MediaProviderProps extends MediaClientConfig {
  children: ReactNode;
  /**
   * Bring your own client — an already-configured instance, or a fake in tests.
   * When supplied, the provider will not create or dispose one.
   */
  client?: MediaClient;
}

export function MediaProvider({ children, client: injected, ...config }: MediaProviderProps): JSX.Element {
  // The config object is a fresh literal on every render (`apiKey={...}`), so
  // memoising on the object identity would rebuild the client every render and
  // throw away the cache with it. Memoise on the values that actually change
  // the client's behaviour instead.
  const client = useMemo(() => {
    if (injected) return injected;
    return createMediaClient(config as MediaClientConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    injected,
    config.apiKey,
    config.baseUrl,
    config.logEvents,
    config.defaultPerPage,
    config.fetch,
  ]);

  const ownsClient = !injected;
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    if (!ownsClient) return;
    return () => {
      clientRef.current.dispose();
    };
  }, [client, ownsClient]);

  return <MediaClientContext.Provider value={client}>{children}</MediaClientContext.Provider>;
}

/**
 * Access the raw client. Escape hatch for anything the hooks do not cover
 * (one-off fetches, imperative calls in event handlers).
 */
export function useMediaClient(): MediaClient {
  const client = useContext(MediaClientContext);
  if (!client) {
    throw new Error(
      '[media-react] No MediaProvider found. Wrap your tree: <MediaProvider apiKey={KEY}>…</MediaProvider>',
    );
  }
  return client;
}

/** Non-throwing variant, for components that render both inside and outside. */
export function useOptionalMediaClient(): MediaClient | null {
  return useContext(MediaClientContext);
}

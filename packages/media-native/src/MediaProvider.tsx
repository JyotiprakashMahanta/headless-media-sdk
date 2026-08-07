import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createMediaClient, type MediaClient, type MediaClientConfig } from 'media-core';

/**
 * Identical contract to `media-react`'s provider, on purpose: a team moving
 * between the web app and the RN app should not have to relearn the API.
 *
 * The provider is genuinely platform-neutral React, so this file is a near
 * duplicate of its web sibling. That duplication is deliberate and called out
 * in the README: the alternative is a shared `media-hooks` package sitting
 * between core and both wrappers, which the brief's package list does not
 * include. Two ~60-line files is the cheaper trade at this size.
 */

const MediaClientContext = createContext<MediaClient | null>(null);

export interface MediaProviderProps extends MediaClientConfig {
  children: ReactNode;
  client?: MediaClient;
}

export function MediaProvider({ children, client: injected, ...config }: MediaProviderProps): JSX.Element {
  const client = useMemo(() => {
    if (injected) return injected;
    return createMediaClient(config as MediaClientConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected, config.apiKey, config.baseUrl, config.logEvents, config.defaultPerPage, config.fetch]);

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

export function useMediaClient(): MediaClient {
  const client = useContext(MediaClientContext);
  if (!client) {
    throw new Error('[media-native] No MediaProvider found. Wrap your app in <MediaProvider apiKey={KEY}>.');
  }
  return client;
}

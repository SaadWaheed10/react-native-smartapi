import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiError, SmartApiRequestConfig } from '../core/types';

export interface UseInfiniteApiOptions<TItem = any>
  extends Omit<SmartApiRequestConfig, 'url' | 'params'> {
  client?: SmartApiClient;
  /** Name of the page-number query param. Default: 'page'. */
  pageParamName?: string;
  /** First page number. Default: 1. */
  initialPage?: number;
  /** Base query params merged with the page param on every request. */
  params?: Record<string, any>;
  /** Extracts the array of items from a page response. Defaults to the response `data` itself. */
  getItems?: (pageData: any) => TItem[];
  /** Determines whether there are more pages to load. Defaults to: page returned a non-empty array. */
  getHasMore?: (pageData: any, itemsSoFar: TItem[]) => boolean;
  onError?: (error: SmartApiError) => void;
}

export interface UseInfiniteApiState<TItem> {
  items: TItem[];
  loading: boolean;
  loadingMore: boolean;
  error: SmartApiError | undefined;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Infinite-scroll / paginated data hook:
 *
 *   const { items, loadMore, hasMore, loading } = useInfiniteApi('/posts');
 *   <FlatList data={items} onEndReached={loadMore} />
 */
export function useInfiniteApi<TItem = any>(
  url: string | null,
  options: UseInfiniteApiOptions<TItem> = {}
): UseInfiniteApiState<TItem> {
  const {
    client,
    pageParamName = 'page',
    initialPage = 1,
    params,
    getItems = (pageData: any) => (Array.isArray(pageData) ? pageData : pageData?.items ?? []),
    getHasMore,
    onError,
    ...requestConfig
  } = options;

  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState(!!url);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(initialPage);
  const isMountedRef = useRef(true);

  const fetchPage = useCallback(
    async (page: number, mode: 'initial' | 'append' | 'refresh') => {
      if (!url) return;
      const apiClient = client ?? getDefaultApi();

      if (mode === 'append') setLoadingMore(true);
      else setLoading(true);
      setError(undefined);

      try {
        const response = await apiClient.request({
          ...requestConfig,
          url,
          method: 'GET',
          params: { ...params, [pageParamName]: page },
        });

        if (!isMountedRef.current) return;

        const pageItems = getItems(response.data);
        setItems((prev: TItem[]) => (mode === 'append' ? [...prev, ...pageItems] : pageItems));

        const more = getHasMore
          ? getHasMore(response.data, mode === 'append' ? [...items, ...pageItems] : pageItems)
          : pageItems.length > 0;
        setHasMore(more);
        pageRef.current = page;
      } catch (err) {
        if (!isMountedRef.current) return;
        const smartError = err as SmartApiError;
        setError(smartError);
        onError?.(smartError);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, client, pageParamName, JSON.stringify(params)]
  );

  useEffect(() => {
    isMountedRef.current = true;
    pageRef.current = initialPage;
    if (url) void fetchPage(initialPage, 'initial');
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    await fetchPage(pageRef.current + 1, 'append');
  }, [loading, loadingMore, hasMore, fetchPage]);

  const refresh = useCallback(async () => {
    await fetchPage(initialPage, 'refresh');
  }, [fetchPage, initialPage]);

  return { items, loading, loadingMore, error, hasMore, loadMore, refresh };
}

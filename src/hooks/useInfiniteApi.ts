import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiError, SmartApiRequestConfig } from '../core/types';

export type PageParam = string | number | null | undefined;

export interface UseInfiniteApiOptions<TItem = any, TPage = any>
  extends Omit<SmartApiRequestConfig, 'url' | 'params'> {
  client?: SmartApiClient;
  /** Name of the page-number query param. Default: 'page'. Ignored when using `getNextPageParam` with cursor mode. */
  pageParamName?: string;
  /** First page number (page mode). Default: 1. */
  initialPage?: number;
  /** Page size hint used for default `hasMore` when responses are arrays. */
  pageSize?: number;
  /** Base query params merged on every request. */
  params?: Record<string, any>;
  /** Extracts the array of items from a page response. Defaults to `data` / `data.items`. */
  getItems?: (pageData: TPage) => TItem[];
  /**
   * Return the next page param (number, cursor string, or null when done).
   * When provided, this takes precedence over page-number incrementing.
   *
   *   getNextPageParam: (lastPage, allItems) => lastPage.nextCursor ?? null
   */
  getNextPageParam?: (lastPage: TPage, allItems: TItem[], lastPageParam: PageParam) => PageParam;
  /**
   * Determines whether there are more pages. Defaults to:
   * - `getNextPageParam(...) != null` when that option is set
   * - otherwise `pageItems.length >= pageSize` (if pageSize set) or `pageItems.length > 0`
   */
  getHasMore?: (pageData: TPage, itemsSoFar: TItem[], pageParam: PageParam) => boolean;
  /**
   * How to apply the next page param to the request.
   * - `page` (default): merge `{ [pageParamName]: pageParam }` into query params
   * - `cursor`: merge `{ [cursorParamName]: pageParam }` (skipped on first page when null/undefined)
   * - `path`: treat pageParam as a full next URL (absolute or relative) for subsequent pages
   */
  paginationMode?: 'page' | 'cursor' | 'path';
  /** Query param name for cursor mode. Default: 'cursor'. */
  cursorParamName?: string;
  /** Initial cursor / path value. Default: undefined (first page has no cursor). */
  initialPageParam?: PageParam;
  onError?: (error: SmartApiError) => void;
}

export interface UseInfiniteApiState<TItem> {
  items: TItem[];
  loading: boolean;
  loadingMore: boolean;
  error: SmartApiError | undefined;
  hasMore: boolean;
  /** The page param that will be used for the next `loadMore` call. */
  nextPageParam: PageParam;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Infinite-scroll / paginated data hook supporting page numbers, cursors, and next-URL pagination:
 *
 *   const { items, loadMore, hasMore } = useInfiniteApi('/posts');
 *   const { items } = useInfiniteApi('/feed', {
 *     paginationMode: 'cursor',
 *     getNextPageParam: (page) => page.nextCursor ?? null,
 *   });
 */
export function useInfiniteApi<TItem = any, TPage = any>(
  url: string | null,
  options: UseInfiniteApiOptions<TItem, TPage> = {}
): UseInfiniteApiState<TItem> {
  const {
    client,
    pageParamName = 'page',
    initialPage = 1,
    pageSize,
    params,
    getItems = (pageData: any) =>
      (Array.isArray(pageData) ? pageData : pageData?.items ?? pageData?.data ?? []) as TItem[],
    getNextPageParam,
    getHasMore,
    paginationMode = 'page',
    cursorParamName = 'cursor',
    initialPageParam,
    onError,
    ...requestConfig
  } = options;

  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState(!!url);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [nextPageParam, setNextPageParam] = useState<PageParam>(
    initialPageParam !== undefined
      ? initialPageParam
      : paginationMode === 'page'
        ? initialPage
        : undefined
  );

  const pageParamRef = useRef<PageParam>(
    initialPageParam !== undefined
      ? initialPageParam
      : paginationMode === 'page'
        ? initialPage
        : undefined
  );
  const itemsRef = useRef<TItem[]>([]);
  const isMountedRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const requestConfigRef = useRef(requestConfig);
  requestConfigRef.current = requestConfig;

  const paramsKey = JSON.stringify(params ?? {});

  const fetchPage = useCallback(
    async (pageParam: PageParam, mode: 'initial' | 'append' | 'refresh') => {
      if (!url) return;
      const apiClient = client ?? getDefaultApi();

      if (mode === 'append') {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(undefined);

      try {
        let requestUrl = url;
        let requestParams: Record<string, any> | undefined = { ...params };

        if (paginationMode === 'path' && mode === 'append' && typeof pageParam === 'string') {
          requestUrl = pageParam;
          requestParams = undefined;
        } else if (paginationMode === 'cursor') {
          if (pageParam !== undefined && pageParam !== null && pageParam !== '') {
            requestParams = { ...requestParams, [cursorParamName]: pageParam };
          }
        } else {
          // page mode
          requestParams = { ...requestParams, [pageParamName]: pageParam };
        }

        const response = await apiClient.request<TPage>({
          ...requestConfigRef.current,
          url: requestUrl,
          method: 'GET',
          params: requestParams,
        });

        if (!isMountedRef.current) return;

        const pageItems = getItems(response.data);
        const nextItems =
          mode === 'append' ? [...itemsRef.current, ...pageItems] : pageItems;
        itemsRef.current = nextItems;
        setItems(nextItems);

        let nextParam: PageParam;
        if (getNextPageParam) {
          nextParam = getNextPageParam(response.data, nextItems, pageParam);
        } else if (paginationMode === 'page') {
          nextParam = (typeof pageParam === 'number' ? pageParam : Number(pageParam) || initialPage) + 1;
        } else {
          nextParam = null;
        }

        const more = getHasMore
          ? getHasMore(response.data, nextItems, pageParam)
          : getNextPageParam
            ? nextParam !== null && nextParam !== undefined
            : pageSize
              ? pageItems.length >= pageSize
              : pageItems.length > 0;

        setHasMore(more);
        pageParamRef.current = nextParam;
        setNextPageParam(nextParam);
      } catch (err) {
        if (!isMountedRef.current) return;
        const smartError = err as SmartApiError;
        setError(smartError);
        onError?.(smartError);
      } finally {
        loadingMoreRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, client, pageParamName, cursorParamName, paginationMode, pageSize, paramsKey, initialPage]
  );

  useEffect(() => {
    isMountedRef.current = true;
    const startParam =
      initialPageParam !== undefined
        ? initialPageParam
        : paginationMode === 'page'
          ? initialPage
          : undefined;
    pageParamRef.current = startParam;
    itemsRef.current = [];
    if (url) void fetchPage(startParam, 'initial');
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fetchPage, paginationMode, initialPage, initialPageParam]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const param = pageParamRef.current;
    if (param === null || param === undefined) return;
    await fetchPage(param, 'append');
  }, [loading, loadingMore, hasMore, fetchPage]);

  const refresh = useCallback(async () => {
    const startParam =
      initialPageParam !== undefined
        ? initialPageParam
        : paginationMode === 'page'
          ? initialPage
          : undefined;
    pageParamRef.current = startParam;
    await fetchPage(startParam, 'refresh');
  }, [fetchPage, initialPage, initialPageParam, paginationMode]);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    nextPageParam,
    loadMore,
    refresh,
  };
}

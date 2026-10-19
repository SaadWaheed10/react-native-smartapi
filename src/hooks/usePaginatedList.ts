import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  Text,
  View,
  type FlatListProps,
  type ListRenderItem,
} from 'react-native';
import type { PathParams } from '../core/defineApi';
import type { SmartApiError } from '../core/types';
import {
  useInfiniteApi,
  type UseInfiniteApiOptions,
  type UseInfiniteApiState,
} from './useInfiniteApi';
import type { UrlInput } from './resolveEndpoint';
import { resolveEndpoint } from './resolveEndpoint';

export interface UsePaginatedListOptions<TItem = any, TPage = any>
  extends UseInfiniteApiOptions<TItem, TPage> {
  pathParams?: PathParams;
  /** FlatList `onEndReachedThreshold`. Default: 0.4. */
  onEndReachedThreshold?: number;
  /** Custom empty-state message. Default: "Nothing here yet". */
  emptyMessage?: string;
  /** Hide the built-in footer spinner. */
  hideFooterLoader?: boolean;
}

export type PaginatedFlatListProps<TItem> = Pick<
  FlatListProps<TItem>,
  | 'data'
  | 'onEndReached'
  | 'onEndReachedThreshold'
  | 'refreshing'
  | 'onRefresh'
  | 'ListEmptyComponent'
  | 'ListFooterComponent'
  | 'refreshControl'
> & {
  /** Helper so consumers can still pass their own `renderItem`. */
  keyExtractor: (item: TItem, index: number) => string;
};

export interface UsePaginatedListState<TItem> extends UseInfiniteApiState<TItem> {
  /**
   * Spread onto a FlatList for zero-boilerplate infinite lists:
   *
   *   <FlatList {...list.flatListProps} renderItem={...} />
   */
  flatListProps: PaginatedFlatListProps<TItem>;
}

/**
 * FlatList-ready pagination hook. Wraps `useInfiniteApi` and exposes
 * `flatListProps` you can spread directly:
 *
 *   const list = usePaginatedList('/posts', { pageSize: 20 });
 *   <FlatList {...list.flatListProps} renderItem={({ item }) => <Row {...item} />} />
 */
export function usePaginatedList<TItem = any, TPage = any>(
  urlOrEndpoint: UrlInput,
  options: UsePaginatedListOptions<TItem, TPage> = {}
): UsePaginatedListState<TItem> {
  const {
    pathParams,
    onEndReachedThreshold = 0.4,
    emptyMessage = 'Nothing here yet',
    hideFooterLoader = false,
    pageSize = 20,
    ...infiniteOptions
  } = options;

  const { url } = resolveEndpoint(urlOrEndpoint, { pathParams });

  const infinite = useInfiniteApi<TItem, TPage>(url, {
    pageSize,
    ...infiniteOptions,
  });

  const flatListProps = useMemo<PaginatedFlatListProps<TItem>>(() => {
    const showInitialEmpty = !infinite.loading && infinite.items.length === 0 && !infinite.error;

    return {
      data: infinite.items,
      onEndReached: () => {
        if (infinite.hasMore && !infinite.loadingMore && !infinite.loading) {
          void infinite.loadMore();
        }
      },
      onEndReachedThreshold,
      refreshing: infinite.loading && infinite.items.length > 0,
      onRefresh: () => {
        void infinite.refresh();
      },
      refreshControl: React.createElement(RefreshControl, {
        refreshing: infinite.loading && infinite.items.length > 0,
        onRefresh: () => {
          void infinite.refresh();
        },
      }),
      keyExtractor: (item: TItem, index: number) => {
        const id = (item as any)?.id;
        return id != null ? String(id) : String(index);
      },
      ListEmptyComponent: showInitialEmpty
        ? React.createElement(
            View,
            { style: { padding: 24, alignItems: 'center' } },
            React.createElement(Text, { style: { color: '#6b7280' } }, emptyMessage)
          )
        : infinite.loading
          ? React.createElement(ActivityIndicator, { style: { marginTop: 40 } })
          : infinite.error
            ? React.createElement(
                View,
                { style: { padding: 24 } },
                React.createElement(
                  Text,
                  { style: { color: '#991b1b' } },
                  (infinite.error as SmartApiError).message
                )
              )
            : null,
      ListFooterComponent:
        !hideFooterLoader && infinite.loadingMore
          ? React.createElement(ActivityIndicator, { style: { margin: 16 } })
          : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional granular deps
  }, [
    infinite.items,
    infinite.hasMore,
    infinite.loadingMore,
    infinite.loading,
    infinite.error,
    infinite.loadMore,
    infinite.refresh,
    onEndReachedThreshold,
    emptyMessage,
    hideFooterLoader,
  ]);

  return {
    ...infinite,
    flatListProps,
  };
}

export type { ListRenderItem };

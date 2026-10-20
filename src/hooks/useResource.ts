import { useCallback } from 'react';
import type { ResourceApi } from '../core/defineResource';
import { useGet } from './useGet';
import type { UseApiOptions, UseApiState } from './useApi';
import { useMutation, type UseMutationOptions, type UseMutationState } from './useMutation';

export interface UseResourceOptions {
  listOptions?: UseApiOptions;
  createOptions?: UseMutationOptions;
  /** Skip auto-fetching the list. */
  skipList?: boolean;
}

export interface UseResourceState<TItem> {
  list: UseApiState<TItem[]>;
  create: UseMutationState<TItem>;
  update: UseMutationState<TItem>;
  remove: UseMutationState<any>;
  /** Convenience: create then refetch list. */
  createAndRefresh: (data?: any) => Promise<TItem | undefined>;
}

/**
 * Hook companion for `defineResource` — wires list + create/update/remove + invalidation:
 *
 *   const posts = defineResource<Post>('/posts');
 *   const { list, create, createAndRefresh } = useResource(posts);
 */
export function useResource<TItem = any>(
  resource: ResourceApi<TItem>,
  options: UseResourceOptions = {}
): UseResourceState<TItem> {
  const list = useGet<TItem[]>(options.skipList ? null : resource.$base, {
    ...options.listOptions,
  });

  const create = useMutation<TItem>(resource.$base, {
    method: 'POST',
    invalidateKeys: [resource.$base],
    ...options.createOptions,
  });

  const update = useMutation<TItem>(resource.$base, {
    method: 'PUT',
    invalidateKeys: [resource.$base],
  });

  const remove = useMutation(resource.$base, {
    method: 'DELETE',
    invalidateKeys: [resource.$base],
  });

  const createAndRefresh = useCallback(
    async (data?: any) => {
      const created = await create.mutate(data);
      await list.refetch();
      return created;
    },
    [create, list]
  );

  return { list, create, update, remove, createAndRefresh };
}

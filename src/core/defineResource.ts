import { getDefaultApi } from './config';
import type { SmartApiClient } from './SmartApiClient';
import type { SmartApiRequestConfig, SmartApiResponse } from './types';

export interface DefineResourceOptions {
  client?: SmartApiClient;
  /** Optional id path segment name. Default: append `/:id`. */
  idParam?: string;
}

export interface ResourceApi<TItem = any> {
  readonly $base: string;
  list: (config?: Omit<SmartApiRequestConfig, 'url' | 'method'>) => Promise<SmartApiResponse<TItem[]>>;
  get: (
    id: string | number,
    config?: Omit<SmartApiRequestConfig, 'url' | 'method'>
  ) => Promise<SmartApiResponse<TItem>>;
  create: (
    data?: any,
    config?: Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<SmartApiResponse<TItem>>;
  update: (
    id: string | number,
    data?: any,
    config?: Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<SmartApiResponse<TItem>>;
  patch: (
    id: string | number,
    data?: any,
    config?: Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'>
  ) => Promise<SmartApiResponse<TItem>>;
  remove: (
    id: string | number,
    config?: Omit<SmartApiRequestConfig, 'url' | 'method'>
  ) => Promise<SmartApiResponse<any>>;
}

/**
 * Declare a full REST resource in one line:
 *
 *   const posts = defineResource<Post>('/posts');
 *   await posts.list();
 *   await posts.get(1);
 *   await posts.create({ title: 'Hi' });
 *   await posts.update(1, { title: 'Hey' });
 *   await posts.remove(1);
 */
export function defineResource<TItem = any>(
  basePath: string,
  options: DefineResourceOptions = {}
): ResourceApi<TItem> {
  const base = basePath.replace(/\/+$/, '');
  const clientOf = () => options.client ?? getDefaultApi();
  const itemUrl = (id: string | number) => `${base}/${encodeURIComponent(String(id))}`;

  return {
    $base: base,
    list: (config) => clientOf().get<TItem[]>(base, config),
    get: (id, config) => clientOf().get<TItem>(itemUrl(id), config),
    create: (data, config) => clientOf().post<TItem>(base, data, config),
    update: (id, data, config) => clientOf().put<TItem>(itemUrl(id), data, config),
    patch: (id, data, config) => clientOf().patch<TItem>(itemUrl(id), data, config),
    remove: (id, config) => clientOf().delete(itemUrl(id), config),
  };
}

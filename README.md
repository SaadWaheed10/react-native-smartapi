# react-native-smartapi

**The one-stop API layer for React Native and Expo.** Zero-config networking, interceptors, error handling, caching, retries, auth, offline support, and React hooks — no Axios required. Written 100% in TypeScript.

```ts
const users = await api.get('/users');
```
```tsx
const { data, loading, error, refetch } = useGet('/users', {
  staleTime: 30_000,
  refetchOnFocus: true,
});
```

---

## Features

- 🚀 **Built-in HTTP client** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, uploads, downloads, parallel & batch. Built on native `fetch` (XHR when you need progress).
- 🧠 **Smart interceptor system** — request & response interceptors, with built-ins for auth injection, device headers, and logging.
- 🛡 **Universal error engine** — every failure normalized to `{ code, status, message, type, details }`.
- 🔁 **Retry & recovery** — exponential backoff + jitter, configurable per request.
- 🔐 **Auth management** — token injection, single-flight auto-refresh on 401, logout hooks.
- 📦 **Built-in caching** — memory or persistent (AsyncStorage), TTL, cache-first / network-first / stale-while-revalidate.
- 📡 **Offline-first** — queues mutations while offline, **persists across app restarts**, flushes on reconnect; `useOfflineQueue()` for UI.
- 🎯 **Query DX** — request dedupe, `staleTime`, `refetchOnFocus`, `api.invalidate()`, `isFetching`.
- 🗺 **`defineApi`** — declare typed endpoints once (`/users/:id`) and reuse in client + hooks.
- ✨ **Optimistic updates** — instant UI via `useMutation({ optimisticUpdate })` + `api.setQueryData`.
- 🔔 **Global UI bridges** — `onError` / `onQueued` / `onSuccess` for toasts & analytics.
- 📋 **`usePaginatedList`** — FlatList-ready infinite lists (`flatListProps`).
- 🎛 **Presets** — one-line packs: `json`, `retrySafe`, `offlineQueue`, `devLog`, `cacheShort`.
- 🎭 **Mock mode** — build UI without a backend (`mock.handlers`).
- ⏱ **Smart polling** — `pollWhen` / `pollWhile` (pause in background or when done).
- 🪄 **Suspense** — `useSuspenseGet` for React 18 Suspense + Error Boundaries.
- 📡 **Streaming / SSE** — `api.stream()` with `onMessage` / `parseJson`.
- ✅ **Schema validation** — optional Zod (or any `parse`/`safeParse`) via `schema`.
- 🌍 **Env configs** — `createEnvConfig({ development, staging, production })`.
- 📺 **`useScreenApi`** — declare every screen query/mutation in one object.
- 📚 **`defineResource` / `useResource`** — REST CRUD in a few lines.
- 📶 **Adaptive networking** — auto timeout/retry from wifi / cellular quality.
- ⚡ **Circuit breaker** — stop hammering a dying API; optional fallback.
- 🏷 **ETag revalidation** — `If-None-Match` + HTTP 304 cache hits.
- 🥊 **Offline conflicts** — `server-wins` / `client-wins` / custom merge.
- 🔄 **`useSyncMutation`** — optimistic + offline + conflict in one hook.
- 🧭 **Nav prefetch** — `prefetchOnFocus` for React Navigation / Expo Router.
- 🎬 **Replay export** — shareable JSON/HAR timelines for QA (`api.exportReplay()`).
- 🌐 **Localized errors** — `locale` + `locales` message maps.
- 🛡 **Privacy redact** — mask phones, emails, tokens in logs/replays.
- ⏰ **Background sync** — Expo BackgroundFetch flush helper.
- 🪄 **Transform / select** — pull nested fields and reshape responses.
- ⚛️ **React hooks** — `useApi`, `useGet`, `usePost`, `useMutation`, `useSyncMutation`, `useScreenApi`, `useResource`, `useInfiniteApi`, `usePaginatedList`, `useSuspenseGet`, `useUpload`, `useDownload`, `useOfflineQueue`, `useRequestLog`.
- 📈 **Real upload/download progress** — automatic XHR transport when progress callbacks are set.
- 🧪 **Testing helpers** — `createTestClient` via `react-native-smartapi/testing`.
- 🧵 **Cancellation** — `AbortController` under the hood.
- 🧩 **Fully typed** — strict TypeScript, IntelliSense everywhere.
- 📱 **Expo + bare RN** — pure JS/TS, no native module of its own.

---

## Installation

Works with **Expo** and **React Native CLI**.

```bash
npm install react-native-smartapi
# or
yarn add react-native-smartapi
# or
npx expo install react-native-smartapi
```

### Optional peer dependencies

These unlock extra features but are **not required** — the package degrades gracefully without them.

```bash
# Persistent cache + offline queue survival across app restarts
npm install @react-native-async-storage/async-storage
# Expo:
npx expo install @react-native-async-storage/async-storage

# Offline detection / network state monitoring
npm install @react-native-community/netinfo
# Expo:
npx expo install @react-native-community/netinfo
```

---

## Quick Start

**1. Configure once** (e.g. `apiConfig.ts` or your root layout):

```ts
import { configureApi } from 'react-native-smartapi';

configureApi({
  baseURL: 'https://api.example.com',
  timeout: 15000,
  presets: ['json', 'retrySafe', 'offlineQueue', 'cacheShort', 'devLog'],
  auth: {
    getToken: () => SecureStore.getAccessToken(),
    onRefreshToken: async () => SecureStore.refreshAccessToken(),
    onUnauthorized: async () => {
      await SecureStore.clearTokens();
      // navigate to login
    },
  },
  onError: (err) => {
    if (err.type !== 'CANCELLED') Toast.show(err.message);
  },
  onQueued: () => Toast.show('Saved offline — will sync later'),
  mock: __DEV__
    ? {
        enabled: false, // flip to true while designing screens
        delay: 400,
        handlers: {
          'GET /users': [{ id: 1, name: 'Ada' }],
        },
      }
    : undefined,
  errorMap: {
    USER_NOT_FOUND: 'User does not exist',
    INVALID_OTP: 'The code you entered is incorrect',
  },
});
```

**2. Use it anywhere:**

```ts
import { api } from 'react-native-smartapi';

const users = await api.get('/users');
const created = await api.post('/users', { name: 'Ada Lovelace' });
```

**3. Or use React hooks:**

```tsx
import { useGet, useMutation } from 'react-native-smartapi';

function UsersScreen() {
  const { data, loading, error, refetch, isFetching } = useGet('/users', {
    staleTime: 30_000,
    refetchOnFocus: true,
  });

  const { mutate, queued } = useMutation('/users', {
    method: 'POST',
    invalidateKeys: ['/users'],
  });

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorView message={error.message} onRetry={refetch} />;
  return <UserList users={data} refreshing={isFetching} onCreate={() => mutate({ name: 'Ada' })} />;
}
```

---

## API Reference

### HTTP methods

```ts
api.get(url, config?)
api.post(url, data?, config?)
api.put(url, data?, config?)
api.patch(url, data?, config?)
api.delete(url, config?)
api.head(url, config?)
api.options(url, config?)
api.parallel([{ url: '/a' }, { url: '/b' }])
api.batch([{ url: '/a' }, { url: '/b' }])
api.upload(url, { file }, extraFields?, config?)
api.download(url, config?)
```

### `defineApi` — typed endpoints

```ts
import { defineApi, useGet, useMutation } from 'react-native-smartapi';

const usersApi = defineApi({
  list: { method: 'GET', url: '/users' },
  get: { method: 'GET', url: '/users/:id' },
  create: { method: 'POST', url: '/users' },
});

await usersApi.list();
await usersApi.get({ pathParams: { id: 1 } });
await usersApi.create({ data: { name: 'Ada' } });

useGet(usersApi.list);
useGet(usersApi.get, { pathParams: { id: 1 } });
useMutation(usersApi.create, { invalidateKeys: ['/users'] });
```

### Invalidation & optimistic cache

```ts
api.invalidate('/users');        // cache + refetch matching hooks
api.invalidate('GET:/users');
api.invalidate();                // clear everything

api.setQueryData('/todos', (old) => [...(old ?? []), { id: 'temp', title: 'New' }]);
```

```tsx
const { mutate } = useMutation('/todos', {
  method: 'POST',
  invalidateKeys: ['/todos'],
  optimisticUpdate: {
    key: '/todos',
    update: (old, vars) => [...(old ?? []), { id: 'temp', ...vars }],
    rollbackOnError: true,
  },
});
```

### Presets

```ts
configureApi({
  baseURL: 'https://api.example.com',
  presets: ['json', 'retrySafe', 'offlineQueue', 'devLog', 'cacheShort'],
});

// Or compose manually:
import { withAuth, withCache, withOffline } from 'react-native-smartapi';
configureApi({
  baseURL: 'https://api.example.com',
  ...withAuth({ getToken }),
  ...withCache({ ttl: 60_000 }),
  ...withOffline(),
});
```

### Mock mode (UI without a backend)

```ts
configureApi({
  baseURL: 'https://api.example.com',
  mock: {
    enabled: __DEV__,
    delay: 300,
    handlers: {
      'GET /users': [{ id: 1, name: 'Ada' }],
      'GET /users/:id': (cfg) => ({ id: 1, name: 'Ada', url: cfg.url }),
      'POST /users': { status: 201, data: { id: 2 } },
    },
  },
});
```

### `select` / `transform`

```ts
await api.get('/users', { select: 'data.profile.name' });
await api.get('/users', {
  transform: (users) => users.map((u) => ({ id: u.user_id, name: u.full_name })),
});
```

### Unified errors

```ts
{
  code: string;
  status: number;
  message: string;   // UI-ready
  type: 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'CANCELLED'
      | 'PARSE_ERROR' | 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'UNKNOWN_ERROR';
  details?: any;
}
```

### Caching

```ts
await api.get('/users', { cache: true });
await api.get('/users', { cache: { ttl: 60000, storage: 'persistent' } });
await api.cache.clearAll();
```

### Upload / download progress

Progress uses **XHR** automatically when you pass callbacks (or `transport: 'xhr'`):

```ts
await api.upload('/avatar', { file: { uri, name: 'a.jpg', type: 'image/jpeg' } }, undefined, {
  onUploadProgress: (percent) => console.log(percent),
});

const { upload, progress } = useUpload('/avatar');
await upload({ file: { uri, name: 'a.jpg', type: 'image/jpeg' } });
```

```ts
import { createFormData } from 'react-native-smartapi';

await api.post('/upload', undefined, {
  formData: createFormData({
    photos: [
      { uri: uri1, name: '1.jpg', type: 'image/jpeg' },
      { uri: uri2, name: '2.jpg', type: 'image/jpeg' },
    ],
    caption: 'hello',
  }),
  transport: 'xhr',
  onUploadProgress: (p) => setProgress(p),
});
```

### Offline queue

```ts
import { useOfflineQueue } from 'react-native-smartapi';

const { size, queue, isOnline, flush, clear } = useOfflineQueue();
// size > 0 → show “pending sync” UI
```

Queued mutations throw `REQUEST_QUEUED_OFFLINE` by default (hooks set `queued: true`). Set `offline.throwOnQueue: false` to resolve with `{ queued: true }` instead.

### Infinite scroll / FlatList preset

```tsx
// Page numbers
const { items, loadMore, hasMore } = useInfiniteApi('/posts', {
  pageParamName: 'page',
  pageSize: 20,
});

// Cursor
const feed = useInfiniteApi('/feed', {
  paginationMode: 'cursor',
  getNextPageParam: (page) => page.nextCursor ?? null,
  getItems: (page) => page.items,
});

// FlatList-ready (recommended for lists)
const list = usePaginatedList('/posts', { pageSize: 20 });
<FlatList
  {...list.flatListProps}
  renderItem={({ item }) => <PostRow post={item} />}
/>
```

### Smart polling

```tsx
useGet('/orders/123', {
  pollInterval: 5000,
  pollWhen: 'foreground', // pause in background
  pollWhile: (order) => order?.status === 'pending',
});
```

### Suspense

```tsx
import { Suspense } from 'react';
import { useSuspenseGet } from 'react-native-smartapi';

function Users() {
  const { data } = useSuspenseGet<User[]>('/users'); // data always defined
  return <UserList users={data} />;
}

<Suspense fallback={<Spinner />}>
  <ErrorBoundary>
    <Users />
  </ErrorBoundary>
</Suspense>
```

### Streaming / SSE

```ts
const stream = api.stream('/events', {
  parseJson: true,
  onMessage: (data) => console.log('event', data),
  onEvent: ({ event, data }) => {},
});

// later
stream.abort();
await stream.done;
```

### Schema validation (Zod optional)

```ts
import { z } from 'zod';

const UserSchema = z.object({ id: z.number(), name: z.string() });

await api.get('/me', { schema: UserSchema });
useGet('/me', { schema: UserSchema });
```

### Multi-environment config

```ts
import { configureApi, createEnvConfig } from 'react-native-smartapi';

configureApi(createEnvConfig({
  shared: { timeout: 15000 },
  development: {
    baseURL: 'http://localhost:3000',
    presets: ['devLog'],
    mock: { enabled: true, handlers: { 'GET /users': [] } },
  },
  staging: { baseURL: 'https://staging.api.example.com' },
  production: {
    baseURL: 'https://api.example.com',
    logger: { enabled: false },
  },
}));
```

### `useScreenApi` — one screen, all APIs

```tsx
const screen = useScreenApi({
  user: ['GET', '/me'],
  posts: ['GET', '/posts', { staleTime: 30_000 }],
  create: ['POST', '/posts', { invalidateKeys: ['/posts'] }],
});

screen.user.data;
await screen.create.mutate({ title: 'Hello' });
```

### `defineResource` / `useResource`

```ts
const posts = defineResource<Post>('/posts');
await posts.list();
await posts.get(1);
await posts.create({ title: 'Hi' });

const { list, createAndRefresh } = useResource(posts);
```

### Adaptive networking + circuit breaker

```ts
configureApi({
  networkAware: true,
  circuitBreaker: { threshold: 5, cooldownMs: 30_000, fallback: [] },
});
```

### ETag cache revalidation

```ts
configureApi({ cache: { enabled: true, etag: true } });
// Sends If-None-Match; HTTP 304 → instant cache hit
```

### Offline conflicts + `useSyncMutation`

```ts
configureApi({
  offline: { enabled: true, onConflict: 'client-wins' },
});

const { mutate, queued, conflict, sync } = useSyncMutation('/todos', {
  method: 'POST',
  optimisticUpdate: {
    key: '/todos',
    update: (old, vars) => [...(old ?? []), vars],
  },
  onConflict: 'client-wins',
});
```

### Navigation prefetch

```ts
prefetchOnFocus(navigation, {
  PostDetail: ({ params }) => ({ url: `/posts/${params.id}`, method: 'GET' }),
  Feed: () => [{ url: '/feed' }, { url: '/stories' }],
});
```

### Replay export + privacy redact

```ts
configureApi({
  devtools: { enabled: true },
  logger: { redact: ['phone', 'cnic', /\b\d{16}\b/] },
});

const json = api.exportReplay();
const har = api.exportReplay({ format: 'har' });
```

### Localized errors

```ts
configureApi({
  locale: 'ur',
  locales: {
    ur: { NO_INTERNET: 'انٹرنیٹ دستیاب نہیں', TIMEOUT: 'درخواست کا وقت ختم' },
  },
});
```

### Background sync

```ts
import { registerBackgroundSync } from 'react-native-smartapi';

await registerBackgroundSync({ intervalMinutes: 15 });
```

### Timeout UX

```ts
const { error, isTimeout, refetch } = useGet('/heavy', {
  timeout: 8000,
  timeoutMessage: 'Still working… try again',
});

if (isTimeout) return <RetryBanner onRetry={refetch} />;
```

### Multiple API instances

```ts
import { createApi } from 'react-native-smartapi';

const paymentsApi = createApi({ baseURL: 'https://payments.example.com' });
const { data } = useGet('/invoices', { client: paymentsApi });
```

### Devtools

```ts
configureApi({ devtools: { enabled: __DEV__ } });

import { useRequestLog } from 'react-native-smartapi';
const entries = useRequestLog(); // in-memory request inspector
```

### Testing

```ts
import { createTestClient } from 'react-native-smartapi/testing';

const api = createTestClient({
  baseURL: 'https://api.test',
  handlers: [
    { method: 'GET', url: '/users', body: [{ id: 1 }] },
    { method: 'POST', url: '/users', status: 201, body: { id: 2 } },
  ],
});

const res = await api.get('/users');
api.restoreFetch();
```

---

## React Hooks

| Hook | Purpose |
|---|---|
| `useApi` / `useGet` / `usePost` | Fetch with loading/error/`staleTime`/`refetchOnFocus`/dedupe |
| `useMutation` | Imperative mutate + `invalidateKeys` + `optimisticUpdate` + `queued` |
| `useInfiniteApi` | Page / cursor / next-URL pagination |
| `usePaginatedList` | FlatList-ready infinite list (`flatListProps`) |
| `useSuspenseGet` | Suspense GET — `data` is always defined |
| `useUpload` / `useDownload` | File transfer with real progress |
| `useOfflineQueue` | Observe & control the offline mutation queue |
| `useRequestLog` | Subscribe to the dev request inspector |

---

## Example app

See [`examples/`](./examples) for a tabbed Expo/RN demo covering cache invalidation, infinite scroll, offline queue, and the request log.

---

## Project Structure

```
react-native-smartapi/
├── src/
│   ├── core/            # SmartApiClient, QueryManager, transports, types
│   ├── interceptors/
│   ├── errors/
│   ├── cache/
│   ├── retry/
│   ├── auth/
│   ├── offline/
│   ├── transform/
│   ├── hooks/
│   ├── testing/         # createTestClient (subpath export)
│   ├── devtools/
│   ├── utils/
│   └── index.ts
├── __tests__/
├── examples/
├── CHANGELOG.md
└── README.md
```

---

## Scripts

```bash
npm test
npm run test:coverage
npm run typecheck
npm run lint
npm run build
```

## License

MIT

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
- 🪄 **Transform / select** — pull nested fields and reshape responses.
- ⚛️ **React hooks** — `useApi`, `useGet`, `usePost`, `useMutation`, `useInfiniteApi`, `useUpload`, `useDownload`, `useOfflineQueue`, `useRequestLog`.
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
  staleTime: 15_000,
  auth: {
    getToken: () => SecureStore.getAccessToken(),
    onRefreshToken: async () => SecureStore.refreshAccessToken(),
    onUnauthorized: async () => {
      await SecureStore.clearTokens();
      // navigate to login
    },
  },
  cache: { enabled: true, ttl: 5 * 60 * 1000 },
  retry: { enabled: true, attempts: 3 },
  offline: { enabled: true, queueMutations: true, fallbackToCache: true, persist: true },
  logger: { enabled: __DEV__, level: 'debug' },
  devtools: { enabled: __DEV__ },
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

### Invalidation

```ts
api.invalidate('/users');        // cache + refetch matching hooks
api.invalidate('GET:/users');
api.invalidate();                // clear everything
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

### Infinite scroll

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

// Next URL
const path = useInfiniteApi('/items', {
  paginationMode: 'path',
  getNextPageParam: (page) => page.next ?? null,
});
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
| `useMutation` | Imperative mutate + `invalidateKeys` + `queued` |
| `useInfiniteApi` | Page / cursor / next-URL pagination |
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

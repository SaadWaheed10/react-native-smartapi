# react-native-smartapi

**The one-stop API layer for React Native (Bare Workflow).** Zero-config networking, interceptors, error handling, caching, retries, auth, offline support, and React hooks — no Axios required. Written 100% in TypeScript.

```ts
const users = await api.get('/users');
```
```tsx
const { data, loading, error } = useGet('/users');
```

---

## Features

- 🚀 **Built-in HTTP client** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, uploads, downloads, parallel & batch requests. Built on native `fetch`, so you never install Axios.
- 🧠 **Smart interceptor system** — request & response interceptors, with built-ins for auth injection, device headers, and logging.
- 🛡 **Universal error engine** — every failure (HTTP, network, timeout, parse, cancellation) is normalized into one predictable shape: `{ code, status, message, type, details }`.
- 🔁 **Retry & recovery** — automatic retries with exponential backoff + jitter, configurable per request.
- 🔐 **Auth management** — token injection, single-flight auto-refresh on 401, logout hooks.
- 📦 **Built-in caching** — memory or persistent (via optional AsyncStorage), TTL, cache-first / network-first / stale-while-revalidate.
- 📡 **Offline-first** — queues mutations while offline (via optional NetInfo) and flushes them on reconnect; can serve cached GETs when offline.
- 🎯 **Query & selection engine** — pull exactly the nested field you need with `select`.
- 🪄 **Transform engine** — reshape, rename, filter, sort responses with a plain function.
- ⚛️ **React hooks** — `useApi`, `useGet`, `usePost`, `useMutation`, `useInfiniteApi`, `useUpload`, `useDownload`.
- 🧵 **Cancellation** — every request supports `AbortController` under the hood.
- 🧩 **Fully typed** — strict TypeScript, IntelliSense everywhere.

---

## Installation

```bash
npm install react-native-smartapi
# or
yarn add react-native-smartapi
```

### Optional peer dependencies

These unlock extra features but are **not required** — the package degrades gracefully without them.

```bash
# Persistent cache + offline queue survival across app restarts
npm install @react-native-async-storage/async-storage

# Offline detection / network state monitoring
npm install @react-native-community/netinfo
```

No native linking is required beyond the standard autolinking for the optional modules above — `react-native-smartapi` itself is pure JS/TS.

---

## Quick Start

**1. Configure once, near your app's entry point:**

```ts
// apiConfig.ts
import { configureApi } from 'react-native-smartapi';
import * as SecureStore from './secureStore'; // your token storage of choice

configureApi({
  baseURL: 'https://api.example.com',
  timeout: 15000,
  auth: {
    getToken: () => SecureStore.getAccessToken(),
    onRefreshToken: async () => {
      const newToken = await SecureStore.refreshAccessToken();
      return newToken;
    },
    onUnauthorized: async () => {
      await SecureStore.clearTokens();
      // navigate to login screen, etc.
    },
  },
  cache: { enabled: true, ttl: 5 * 60 * 1000 },
  retry: { enabled: true, attempts: 3 },
  offline: { enabled: true, queueMutations: true, fallbackToCache: true },
  logger: { enabled: __DEV__, level: 'debug' },
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

**3. Or use the React hooks:**

```tsx
import { useGet } from 'react-native-smartapi';

function UsersScreen() {
  const { data, loading, error, refetch } = useGet('/users');

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorView message={error.message} onRetry={refetch} />;
  return <UserList users={data} />;
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
api.parallel([{ url: '/a' }, { url: '/b' }])           // Promise.all semantics
api.batch([{ url: '/a' }, { url: '/b' }])                // never throws; per-item results
api.upload(url, { file }, extraFields?, config?)
api.download(url, config?)
```

### `select` — pull exactly what you need

```ts
await api.get('/users');                                  // full response
await api.get('/users', { select: 'profile' });           // top-level object
await api.get('/users', { select: 'data.profile.name' }); // nested property
await api.get('/users', { select: 'data.users' });        // array extraction
```

### `transform` — reshape data

```ts
await api.get('/users', {
  transform: (users) => users.map((u) => ({ id: u.user_id, name: u.full_name })),
});
```

### Unified errors

Every error thrown by SmartAPI has this shape:

```ts
{
  code: string;      // e.g. "HTTP_404" or a custom backend code like "USER_NOT_FOUND"
  status: number;
  message: string;   // human-readable, ready to show in the UI
  type: 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'CANCELLED'
      | 'PARSE_ERROR' | 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'UNKNOWN_ERROR';
  details?: any;
}
```

```ts
try {
  await api.get('/users/999');
} catch (err) {
  const error = err as SmartApiError; // err.message, err.status, err.code, err.type
}
```

### Interceptors

```ts
import { api } from 'react-native-smartapi';

const removeInterceptor = api.useRequestInterceptor((config) => {
  return { ...config, headers: { ...config.headers, 'X-Trace-Id': generateTraceId() } };
});

api.useResponseInterceptor((response) => {
  // e.g. unwrap a custom envelope
  return response;
});

api.useErrorInterceptor((error) => {
  Analytics.logApiError(error);
  return error; // return a SmartApiResponse instead to "recover" from the error
});
```

### Caching

```ts
await api.get('/users', { cache: true });                          // use global cache defaults
await api.get('/users', { cache: { ttl: 60000, storage: 'persistent' } });
await api.get('/users', { cache: false });                          // force network

api.cache.invalidatePrefix('GET:/users');                           // manual invalidation
await api.cache.clearAll();
```

### Retry

```ts
await api.get('/flaky-endpoint', {
  retry: { enabled: true, attempts: 5, baseDelayMs: 500 },
});
```

### Multiple API instances

```ts
import { createApi } from 'react-native-smartapi';

const paymentsApi = createApi({ baseURL: 'https://payments.example.com' });
const contentApi = createApi({ baseURL: 'https://cdn.example.com' });
```

---

## React Hooks

| Hook | Purpose |
|---|---|
| `useApi(url, options)` | Generic fetch hook — loading/error/success/refetch/polling |
| `useGet(url, options)` | GET shorthand for `useApi` |
| `usePost(url, data, options)` | POST shorthand, fetch-on-mount disabled by default |
| `useMutation(url, options)` | Imperative create/update/delete via `mutate()` |
| `useInfiniteApi(url, options)` | Pagination / infinite scroll |
| `useUpload(url, options)` | File upload with progress |
| `useDownload(url, options)` | File download with progress |

```tsx
const { mutate, loading, error } = useMutation('/users', { method: 'POST' });
await mutate({ name: 'Ada' });

const { items, loadMore, hasMore } = useInfiniteApi('/posts');
<FlatList data={items} onEndReached={loadMore} />
```

> **Note on upload/download progress:** progress callbacks (`onUploadProgress` / `onDownloadProgress`) are part of the public API and wired through the hooks; because this package is built on `fetch` (not `XMLHttpRequest`) for platform-agnostic compatibility, real-time byte-level progress requires either enabling RN's `XMLHttpRequest`-based polyfill in your app or swapping in your own progress-capable transport via `fetchOptions`. See `CONTRIBUTING.md` for extending the transport layer.

---

## Project Structure

```
react-native-smartapi/
├── src/
│   ├── core/            # SmartApiClient, types, config/factory
│   ├── interceptors/     # Built-in request/response interceptors
│   ├── errors/            # ErrorEngine + default error message maps
│   ├── cache/             # MemoryCache, PersistentCache, CacheManager
│   ├── retry/             # RetryManager (exponential backoff)
│   ├── auth/               # TokenManager (injection + refresh)
│   ├── offline/            # NetworkMonitor, OfflineQueue
│   ├── transform/          # DataSelector, DataTransformer
│   ├── hooks/               # useApi, useGet, usePost, useMutation, ...
│   ├── utils/                # logger, deviceInfo, helpers
│   └── index.ts               # Public exports
├── __tests__/                  # Jest unit + integration tests
├── examples/                    # Example App.tsx
├── package.json
├── tsconfig.json
└── README.md
```

---

## Testing

```bash
npm test
npm run test:coverage
```

## Building

```bash
npm run build      # compiles CJS + ESM + type declarations via react-native-builder-bob
npm run typecheck
```

## License

MIT

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-10

### Added
- Query DX for hooks: request dedupe, `staleTime`, `refetchOnFocus`, `enabled`, `isFetching`, and `queryKey`
- `api.invalidate(keyOrPrefix?)` + `QueryManager` pub/sub so mutations can refresh active hooks
- Real upload/download progress via XHR transport (`transport: 'fetch' | 'xhr' | 'auto'`)
- Persistent offline queue (AsyncStorage) with `useOfflineQueue()` and `throwOnQueue` option
- Improved `useInfiniteApi`: cursor / next-URL modes, `getNextPageParam`, `pageSize`, safer `hasMore`
- `createFormData()` helper for multi-file / RN file uploads
- Testing helpers via `react-native-smartapi/testing` (`createTestClient`)
- Dev request inspector: `devtools: { enabled: true }`, `api.devtools`, `useRequestLog()`
- Modern `package.json` `exports` map + `"sideEffects": false`
- GitHub Actions CI workflow
- Expanded example app covering auth-style config, cache, infinite scroll, offline queue, and mutations

### Changed
- Package positioning: Expo + React Native (no longer “Bare Workflow only”)
- Mutation cache invalidation now targets `GET:<url>` (and query subscribers) instead of wiping by HTTP method
- Upload defaults to XHR transport so progress callbacks fire

### Fixed
- Offline queue claimed to survive app restarts but was in-memory only — now persists when AsyncStorage is installed
- Packaging listed non-existent `android` / `ios` / podspec paths

## [1.0.0] - 2025-08-01

### Added
- Initial release: HTTP client, interceptors, errors, cache, retry, auth, offline queue, React hooks

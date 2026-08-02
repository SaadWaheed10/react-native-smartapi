# Contributing to react-native-smartapi

Thanks for considering a contribution! This document covers the project layout and a few extension points that are useful to know before diving in.

## Getting started

```bash
git clone https://github.com/your-org/react-native-smartapi.git
cd react-native-smartapi
yarn install
yarn test
yarn typecheck
```

## Project layout

See the "Project Structure" section in `README.md`. Each subsystem under `src/` is independent and unit-testable in isolation:

- `core/SmartApiClient.ts` orchestrates every other subsystem through a single request pipeline (`request()` → interceptors → cache check → retry-wrapped execution → error handling → cache write).
- `errors/ErrorEngine.ts` is the single source of truth for turning any failure into the unified `SmartApiError` shape. New error categories should be added here, not scattered across call sites.
- `cache/`, `retry/`, `auth/`, `offline/` are self-contained managers instantiated once per `SmartApiClient`.
- `hooks/` are thin React wrappers around a `SmartApiClient` instance (default: the shared singleton from `core/config.ts`, or an injected `client` for multi-backend apps).

## Extending the transport layer (advanced)

The default transport is the platform `fetch` global, chosen because it works identically across iOS, Android, and Hermes without extra native linking. This keeps peer-dependency conflicts to zero, per the package's compatibility goals.

The trade-off: `fetch` doesn't expose byte-level upload/download progress events the way `XMLHttpRequest` does. If your app needs true progress bars:

1. Implement an alternate transport in `src/core/transports/xhrTransport.ts` that mirrors `SmartApiClient`'s private `executeOnce` contract (accepts a resolved `SmartApiRequestConfig`, returns a raw response with `status`, `headers`, and a body).
2. Wire progress events (`xhr.upload.onprogress` / `xhr.onprogress`) into the existing `onUploadProgress` / `onDownloadProgress` config callbacks — the public hook API (`useUpload`, `useDownload`) already plumbs these through and won't need to change.
3. Make the transport selectable via `SmartApiConfig.transport: 'fetch' | 'xhr'` so it stays opt-in and the default zero-dependency behavior is preserved.

PRs implementing this are very welcome.

## Tests

- Unit tests live in `__tests__/` and use Jest with the `react-native` preset.
- `client.test.ts` mocks `global.fetch` — please keep new client-level tests consistent with that pattern rather than hitting real network endpoints.
- Run `yarn test:coverage` before submitting a PR that touches `core/`, `errors/`, or `cache/`.
- **Testing hooks:** the package doesn't ship a hook-testing dependency by default (`@testing-library/react-hooks` is deprecated and doesn't support React 18). If you add tests for `src/hooks/`, install `@testing-library/react-native` (`yarn add -D @testing-library/react-native`) instead — its `renderHook` works with React 18/RN 0.74+.

## Commit / PR conventions

- Keep PRs focused on one subsystem where possible.
- Update `README.md` when adding/changing public API surface.
- Add or update tests alongside any behavioral change.

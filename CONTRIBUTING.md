# Contributing to react-native-smartapi

Thanks for considering a contribution! This document covers the project layout and a few extension points that are useful to know before diving in.

## Getting started

```bash
git clone https://github.com/saadwaheed10/react-native-smartapi.git
cd react-native-smartapi
npm install
npm test
npm run typecheck
```

## Project layout

See the "Project Structure" section in `README.md`. Each subsystem under `src/` is independent and unit-testable in isolation:

- `core/SmartApiClient.ts` orchestrates the request pipeline (`request()` → interceptors → offline → cache → retry-wrapped execution → error handling → cache write / invalidation).
- `core/QueryManager.ts` handles in-flight dedupe and invalidation pub/sub for hooks.
- `core/transports/xhrTransport.ts` provides real upload/download progress via `XMLHttpRequest`.
- `errors/ErrorEngine.ts` is the single source of truth for turning any failure into `SmartApiError`.
- `cache/`, `retry/`, `auth/`, `offline/` are self-contained managers instantiated once per `SmartApiClient`.
- `hooks/` are thin React wrappers around a `SmartApiClient` instance.
- `testing/createTestClient.ts` is exported via the `react-native-smartapi/testing` subpath for Jest consumers.

## Transport layer

Default transport is `fetch`. When `onUploadProgress` / `onDownloadProgress` are set (or `transport: 'xhr'` / uploads), the client switches to `XMLHttpRequest` so progress events fire. Prefer extending `src/core/transports/` rather than forking `executeOnce`.

## Tests

- Unit tests live in `__tests__/` and use Jest with the `react-native` preset.
- Mock `global.fetch` (or use `createTestClient`) — do not hit real network endpoints.
- Run `npm run test:coverage` before submitting a PR that touches `core/`, `errors/`, `cache/`, or `offline/`.
- Update `CHANGELOG.md` under `[Unreleased]` or the next version section when changing public API.

## Commit / PR conventions

- Keep PRs focused on one subsystem where possible.
- Update `README.md` when adding/changing public API surface.
- Add or update tests alongside any behavioral change.
- CI (GitHub Actions) runs typecheck, lint, tests, and build on every PR.

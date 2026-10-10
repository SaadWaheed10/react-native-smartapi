# SmartAPI example

`App.tsx` is a drop-in demo for **Expo** or bare React Native.

## Quick start (Expo)

```bash
npx create-expo-app smartapi-demo
cd smartapi-demo
npx expo install react-native-smartapi @react-native-async-storage/async-storage @react-native-community/netinfo
```

Replace the generated `App.tsx` with the one in this folder, then:

```bash
npx expo start
```

## What it demonstrates

| Tab | Features |
|---|---|
| **Posts** | `useGet` + `staleTime` + `refetchOnFocus`, `useMutation` + `invalidateKeys` |
| **Infinite** | `useInfiniteApi` with `_page` / `_limit` and safer `hasMore` |
| **Offline** | `useOfflineQueue` — queue size, flush, clear |
| **Devtools** | `useRequestLog` in-memory inspector |

Toggle airplane mode, create a post, then open the Offline tab to see the persisted queue.

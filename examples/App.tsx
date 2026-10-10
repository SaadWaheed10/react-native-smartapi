import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  configureApi,
  useGet,
  useMutation,
  useInfiniteApi,
  useOfflineQueue,
  useRequestLog,
  type SmartApiError,
} from 'react-native-smartapi';

/**
 * Drop this file into an Expo or React Native app entry point.
 *
 *   npx create-expo-app smartapi-demo
 *   cd smartapi-demo
 *   npx expo install react-native-smartapi @react-native-async-storage/async-storage @react-native-community/netinfo
 *   # replace App.tsx with this file
 */

configureApi({
  baseURL: 'https://jsonplaceholder.typicode.com',
  timeout: 15000,
  cache: { enabled: true, ttl: 60_000, policy: 'stale-while-revalidate' },
  retry: { enabled: true, attempts: 2 },
  offline: { enabled: true, queueMutations: true, fallbackToCache: true, persist: true },
  staleTime: 15_000,
  logger: { enabled: true, level: 'debug' },
  devtools: { enabled: true },
  errorMap: {
    USER_NOT_FOUND: 'That user could not be found.',
  },
});

interface Post {
  id: number;
  title: string;
  body: string;
}

type Tab = 'posts' | 'infinite' | 'offline' | 'devtools';

function ErrorBanner({ error, onRetry }: { error: SmartApiError; onRetry: () => void }) {
  return (
    <View style={{ padding: 16, backgroundColor: '#fee2e2', borderRadius: 8, margin: 12 }}>
      <Text style={{ color: '#991b1b' }}>{error.message}</Text>
      <TouchableOpacity onPress={onRetry}>
        <Text style={{ color: '#1d4ed8', marginTop: 8 }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: active ? '#2563eb' : '#e5e7eb',
        marginRight: 8,
      }}
    >
      <Text style={{ color: active ? '#fff' : '#111', fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function PostsTab() {
  const { data: posts, loading, error, refetch, isFetching, fromCache } = useGet<Post[]>('/posts', {
    transform: (data: Post[]) => data.slice(0, 8),
    staleTime: 30_000,
    refetchOnFocus: true,
  });

  const { mutate: createPost, loading: creating, queued } = useMutation<Post>('/posts', {
    method: 'POST',
    invalidateKeys: ['/posts'],
    onSuccess: () => refetch(),
  });

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (error) return <ErrorBanner error={error} onRetry={refetch} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ color: '#6b7280' }}>
          {fromCache ? 'Served from cache' : 'Fresh network data'}
          {isFetching ? ' · refreshing…' : ''}
        </Text>
        {queued && (
          <Text style={{ color: '#b45309', marginTop: 4 }}>
            Last create was queued offline and will sync later.
          </Text>
        )}
      </View>

      <TouchableOpacity
        disabled={creating}
        onPress={() => createPost({ title: 'New Post', body: 'Hello from SmartAPI' })}
        style={{
          padding: 12,
          backgroundColor: '#2563eb',
          margin: 16,
          borderRadius: 8,
          opacity: creating ? 0.6 : 1,
        }}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
          {creating ? 'Creating…' : 'Create Post (invalidates /posts)'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>{item.title}</Text>
            <Text style={{ color: '#555', marginTop: 4 }}>{item.body}</Text>
          </View>
        )}
      />
    </View>
  );
}

function InfiniteTab() {
  // jsonplaceholder supports _page + _limit
  const { items, loadMore, hasMore, loading, loadingMore, error, refresh } = useInfiniteApi<{
    id: number;
    name: string;
    body: string;
  }>('/comments', {
    params: { postId: 1, _limit: 10 },
    pageParamName: '_page',
    pageSize: 10,
    getItems: (page) => (Array.isArray(page) ? page : []),
  });

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (error) return <ErrorBanner error={error} onRetry={refresh} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      onEndReached={() => {
        if (hasMore && !loadingMore) void loadMore();
      }}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => (
        <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
          <Text style={{ fontWeight: '600' }}>{item.name}</Text>
          <Text style={{ color: '#555' }}>{item.body}</Text>
        </View>
      )}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : null}
    />
  );
}

function OfflineTab() {
  const { size, queue, isOnline, flush, clear } = useOfflineQueue();

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Offline queue</Text>
      <Text style={{ color: '#374151', marginBottom: 12 }}>
        Status: {isOnline ? 'Online' : 'Offline'} · {size} queued mutation{size === 1 ? '' : 's'}
      </Text>

      <View style={{ flexDirection: 'row', marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => void flush()}
          style={{ backgroundColor: '#2563eb', padding: 10, borderRadius: 8, marginRight: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Flush</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={clear}
          style={{ backgroundColor: '#6b7280', padding: 10, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Clear</Text>
        </TouchableOpacity>
      </View>

      {queue.map((item) => (
        <View
          key={item.id}
          style={{ padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginBottom: 8 }}
        >
          <Text style={{ fontWeight: '600' }}>
            {item.config.method} {item.config.url}
          </Text>
          <Text style={{ color: '#6b7280', marginTop: 4 }}>
            Queued {new Date(item.enqueuedAt).toLocaleTimeString()}
          </Text>
        </View>
      ))}

      {size === 0 && (
        <Text style={{ color: '#6b7280' }}>
          Toggle airplane mode, create a post on the Posts tab, then come back here.
        </Text>
      )}
    </ScrollView>
  );
}

function DevtoolsTab() {
  const entries = useRequestLog();

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Request log</Text>
      }
      ListEmptyComponent={<Text style={{ color: '#6b7280' }}>No requests captured yet.</Text>}
      renderItem={({ item }) => (
        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontWeight: '700' }}>
            {item.method} {item.url}{' '}
            <Text style={{ fontWeight: '400', color: '#6b7280' }}>
              {item.status ?? '…'}
              {item.fromCache ? ' · cache' : ''}
              {item.durationMs != null ? ` · ${item.durationMs}ms` : ''}
            </Text>
          </Text>
          {item.error && (
            <Text style={{ color: '#991b1b', marginTop: 4 }}>
              {item.error.code}: {item.error.message}
            </Text>
          )}
        </View>
      )}
    />
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('posts');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: '800' }}>SmartAPI Demo</Text>
        <Text style={{ color: '#6b7280', marginTop: 4 }}>
          Cache · invalidate · infinite · offline · devtools
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 48, paddingHorizontal: 16 }}>
        <TabButton label="Posts" active={tab === 'posts'} onPress={() => setTab('posts')} />
        <TabButton label="Infinite" active={tab === 'infinite'} onPress={() => setTab('infinite')} />
        <TabButton label="Offline" active={tab === 'offline'} onPress={() => setTab('offline')} />
        <TabButton label="Devtools" active={tab === 'devtools'} onPress={() => setTab('devtools')} />
      </ScrollView>

      <View style={{ flex: 1 }}>
        {tab === 'posts' && <PostsTab />}
        {tab === 'infinite' && <InfiniteTab />}
        {tab === 'offline' && <OfflineTab />}
        {tab === 'devtools' && <DevtoolsTab />}
      </View>
    </SafeAreaView>
  );
}

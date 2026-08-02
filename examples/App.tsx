import React, { useEffect } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import {
  configureApi,
  useGet,
  useMutation,
  useInfiniteApi,
  type SmartApiError,
} from 'react-native-smartapi';

// 1. Configure once, at app startup.
configureApi({
  baseURL: 'https://jsonplaceholder.typicode.com',
  timeout: 15000,
  cache: { enabled: true, ttl: 60000 },
  retry: { enabled: true, attempts: 2 },
  logger: { enabled: true, level: 'debug' },
  errorMap: {
    USER_NOT_FOUND: 'That user could not be found.',
  },
});

interface Post {
  id: number;
  title: string;
  body: string;
}

function ErrorBanner({ error, onRetry }: { error: SmartApiError; onRetry: () => void }) {
  return (
    <View style={{ padding: 16, backgroundColor: '#fee2e2' }}>
      <Text style={{ color: '#991b1b' }}>{error.message}</Text>
      <TouchableOpacity onPress={onRetry}>
        <Text style={{ color: '#1d4ed8', marginTop: 8 }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

function PostsScreen() {
  // Simple fetch-on-mount with loading/error/refetch handled for you.
  const { data: posts, loading, error, refetch } = useGet<Post[]>('/posts', {
    select: undefined,
    transform: (data: Post[]) => data.slice(0, 10),
  });

  // Imperative mutation for creating a new post.
  const { mutate: createPost, loading: creating } = useMutation<Post>('/posts', {
    method: 'POST',
    onSuccess: () => refetch(),
  });

  // Infinite-scroll comments list.
  const { items: comments, loadMore, hasMore, loadingMore } = useInfiniteApi(
    '/comments',
    { params: { postId: 1 }, pageParamName: '_page' }
  );

  useEffect(() => {
    // Example: fire an imperative request outside of a hook.
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (error) return <ErrorBanner error={error} onRetry={refetch} />;

  return (
    <View style={{ flex: 1, paddingTop: 40 }}>
      <TouchableOpacity
        disabled={creating}
        onPress={() => createPost({ title: 'New Post', body: 'Hello from SmartAPI' })}
        style={{ padding: 12, backgroundColor: '#2563eb', margin: 16, borderRadius: 8 }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>
          {creating ? 'Creating…' : 'Create Post'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>{item.title}</Text>
            <Text style={{ color: '#555' }}>{item.body}</Text>
          </View>
        )}
        ListFooterComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ fontWeight: '600' }}>Comments ({comments.length})</Text>
            {hasMore && (
              <TouchableOpacity onPress={loadMore} disabled={loadingMore}>
                <Text style={{ color: '#1d4ed8', marginTop: 8 }}>
                  {loadingMore ? 'Loading…' : 'Load more comments'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}

export default function App() {
  return <PostsScreen />;
}

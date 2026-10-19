import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../components/ui';
import { StoreProvider } from '../lib/store';

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Snap & Sell' }} />
        <Stack.Screen name="listing/[id]/photos" options={{ title: 'Photos' }} />
        <Stack.Screen name="listing/[id]/questions" options={{ title: 'About the item' }} />
        <Stack.Screen name="listing/[id]/review" options={{ title: 'Review listing' }} />
        <Stack.Screen name="listing/[id]/publish" options={{ title: 'Post it' }} />
      </Stack>
    </StoreProvider>
  );
}

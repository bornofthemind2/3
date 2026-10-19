import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Heading, Muted, Screen } from '../components/ui';
import { aiEnabled } from '../lib/api';
import { useStore } from '../lib/store';
import type { Listing } from '../lib/types';

function status(l: Listing): string {
  if (l.sold) return 'Sold';
  const posted = Object.values(l.posts).filter((p) => p?.postedAt).length;
  if (posted) return `Posted on ${posted} marketplace${posted > 1 ? 's' : ''}`;
  if (l.draft) return 'Ready to post';
  if (l.photos.length) return 'Needs details';
  return 'No photos yet';
}

function nextStep(l: Listing): string {
  if (l.draft) return `/listing/${l.id}/publish`;
  if (l.answers || l.identification) return `/listing/${l.id}/questions`;
  return `/listing/${l.id}/photos`;
}

export default function Home() {
  const { listings, create, ready } = useStore();

  const start = () => {
    const l = create();
    router.push(`/listing/${l.id}/photos`);
  };

  return (
    <Screen footer={<Button title="Photograph an item" onPress={start} disabled={!ready} />}>
      <View style={{ gap: 6 }}>
        <Heading>Sell what you don’t use</Heading>
        <Muted>
          Take a few photos, answer a handful of questions, and get a listing ready for Facebook Marketplace, eBay,
          OfferUp, Mercari and more.
        </Muted>
        {!aiEnabled ? (
          <Muted>The AI listing assistant isn’t configured, so you’ll fill in the details yourself.</Muted>
        ) : null}
      </View>

      {listings.length === 0 && ready ? (
        <Card>
          <Text style={styles.title}>No items yet</Text>
          <Muted>Start with something you can photograph right now: a lamp, a bike, an old phone.</Muted>
        </Card>
      ) : null}

      {listings.map((l) => (
        <Pressable key={l.id} onPress={() => router.push(nextStep(l))} accessibilityRole="button">
          <View style={styles.row}>
            {l.photos[0] ? <Image source={{ uri: l.photos[0] }} style={styles.thumb} /> : <View style={[styles.thumb, styles.empty]} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} numberOfLines={2}>
                {l.draft?.title || l.answers?.itemName || l.identification?.itemName || 'Untitled item'}
              </Text>
              <Text style={styles.meta}>
                {l.draft ? `$${l.draft.price} · ` : ''}
                {status(l)}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  empty: { backgroundColor: colors.chip },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
});

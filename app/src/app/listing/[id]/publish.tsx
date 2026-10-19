import * as Clipboard from 'expo-clipboard';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Input, Muted, Screen } from '../../../components/ui';
import { formatFor, MARKETPLACES } from '../../../lib/marketplaces';
import { useStore } from '../../../lib/store';
import type { MarketplaceId } from '../../../lib/types';

export default function Publish() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { get, update, remove } = useStore();
  const listing = get(id);
  const [saving, setSaving] = useState(false);
  const [photosSaved, setPhotosSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!listing?.draft || !listing.answers) return null;
  const { draft, answers } = listing;

  const copy = async (key: string, text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
  };

  const savePhotos = async () => {
    setSaving(true);
    try {
      const perm = await requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'Allow Snap & Sell to add photos in Settings so marketplace apps can attach them.');
        return;
      }
      for (const uri of listing.photos) await Asset.create(uri);
      setPhotosSaved(true);
    } catch (e) {
      Alert.alert("Couldn't save photos", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const open = async (m: MarketplaceId) => {
    const { title, body } = formatFor(m, draft, answers);
    // Most marketplace forms take the description in one big field, so that is what's on the clipboard.
    await Clipboard.setStringAsync(body);
    setCopied(`${m}-body`);
    await Linking.openURL(MARKETPLACES[m].createUrl).catch(() =>
      Alert.alert("Couldn't open", `Go to ${MARKETPLACES[m].createUrl} and paste the title "${title}".`),
    );
  };

  const markPosted = (m: MarketplaceId, url?: string) => {
    const prev = listing.posts[m];
    update(listing.id, {
      posts: { ...listing.posts, [m]: { postedAt: prev?.postedAt ?? new Date().toISOString(), url: url ?? prev?.url } },
    });
  };

  const unmark = (m: MarketplaceId) => {
    const posts = { ...listing.posts };
    delete posts[m];
    update(listing.id, { posts });
  };

  const markSold = () => {
    Alert.alert('Mark as sold?', 'Remember to remove or close the listing on every marketplace you posted it to.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Keep for records', onPress: () => { update(listing.id, { sold: true }); router.dismissAll(); } },
      { text: 'Delete item', style: 'destructive', onPress: () => { router.dismissAll(); remove(listing.id); } },
    ]);
  };

  return (
    <Screen footer={<Button title={listing.sold ? 'Sold' : 'Mark as sold'} onPress={markSold} variant="secondary" disabled={listing.sold} />}>
      <Card>
        <Text style={styles.step}>1. Put the photos where marketplace apps can find them</Text>
        <Muted>Saves {listing.photos.length} photo{listing.photos.length === 1 ? '' : 's'} to your photo library.</Muted>
        <Button title={photosSaved ? 'Photos saved ✓' : 'Save photos to library'} onPress={savePhotos} loading={saving} variant={photosSaved ? 'secondary' : 'primary'} />
      </Card>

      <Text style={styles.step}>2. Post on each marketplace</Text>
      <Muted>
        “Open” copies the description and opens the marketplace’s new-listing page. Add the photos, paste, copy the title
        here and paste it in, set the price, then come back and mark it posted.
      </Muted>

      {listing.marketplaces.map((m) => {
        const mk = MARKETPLACES[m];
        const { title, body } = formatFor(m, draft, answers);
        const post = listing.posts[m];
        return (
          <Card key={m}>
            <View style={styles.header}>
              <View style={[styles.dot, { backgroundColor: mk.color }]} />
              <Text style={styles.name}>{mk.name}</Text>
              {post?.postedAt ? <Text style={styles.posted}>Posted</Text> : null}
            </View>
            <Text style={styles.previewTitle}>{title}</Text>
            <Text style={styles.price}>${draft.price}</Text>
            <Text style={styles.preview} numberOfLines={4}>
              {body}
            </Text>
            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button title={copied === `${m}-title` ? 'Title copied' : 'Copy title'} onPress={() => copy(`${m}-title`, title)} variant="secondary" />
              </View>
              <View style={styles.flex}>
                <Button title={copied === `${m}-body` ? 'Text copied' : 'Copy text'} onPress={() => copy(`${m}-body`, body)} variant="secondary" />
              </View>
            </View>
            <Button title={`Open ${mk.name}`} onPress={() => open(m)} />
            {post?.postedAt ? (
              <>
                <Input
                  value={post.url ?? ''}
                  onChangeText={(url) => markPosted(m, url)}
                  placeholder="Paste the listing link (optional)"
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Button title="Not posted yet" onPress={() => unmark(m)} variant="secondary" />
              </>
            ) : (
              <Button title="Mark as posted" onPress={() => markPosted(m)} variant="secondary" />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { fontSize: 16, fontWeight: '700', color: colors.text },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  posted: { fontSize: 13, fontWeight: '600', color: colors.primary },
  previewTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  price: { fontSize: 15, color: colors.text },
  preview: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});

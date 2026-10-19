import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Muted, Screen } from '../../../components/ui';
import { aiEnabled, identifyItem } from '../../../lib/api';
import { deletePhoto, keepPhoto, useStore } from '../../../lib/store';

const MAX_PHOTOS = 10;

export default function Photos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { get, update } = useStore();
  const listing = get(id);
  const [busy, setBusy] = useState(false);

  if (!listing) return null;
  const photos = listing.photos;
  const room = MAX_PHOTOS - photos.length;

  const add = (uris: string[]) => {
    const kept = uris.slice(0, room).map((u) => keepPhoto(listing.id, u));
    update(listing.id, { photos: [...photos, ...kept] });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph your items.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.85 });
    if (!res.canceled) add(res.assets.map((a) => a.uri));
  };

  const pickPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.85,
    });
    if (!res.canceled) add(res.assets.map((a) => a.uri));
  };

  const removePhoto = (uri: string) => {
    deletePhoto(uri);
    update(listing.id, { photos: photos.filter((p) => p !== uri) });
  };

  const makeCover = (uri: string) => {
    update(listing.id, { photos: [uri, ...photos.filter((p) => p !== uri)] });
  };

  const next = async () => {
    if (aiEnabled && !listing.identification) {
      setBusy(true);
      try {
        const identification = await identifyItem(photos);
        update(listing.id, { identification });
      } catch (e) {
        Alert.alert(
          "Couldn't identify the item",
          `${e instanceof Error ? e.message : String(e)}\n\nYou can still describe it yourself.`,
        );
      } finally {
        setBusy(false);
      }
    }
    router.push(`/listing/${listing.id}/questions`);
  };

  return (
    <Screen
      footer={
        <Button
          title={aiEnabled && !listing.identification ? 'Identify item' : 'Next: a few questions'}
          onPress={next}
          disabled={photos.length === 0}
          loading={busy}
        />
      }
    >
      <Card>
        <Text style={styles.title}>Photo tips</Text>
        <Muted>
          Use daylight and a plain background. Get the whole item, then close-ups of the brand label or model
          number, and any scratches or wear. Buyers trust listings that show flaws.
        </Muted>
      </Card>

      <View style={styles.grid}>
        {photos.map((uri, i) => (
          <Pressable
            key={uri}
            onPress={() => makeCover(uri)}
            onLongPress={() =>
              Alert.alert('Remove photo?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removePhoto(uri) },
              ])
            }
            accessibilityLabel={i === 0 ? 'Cover photo' : 'Photo, tap to make cover, long press to remove'}
          >
            <Image source={{ uri }} style={styles.photo} />
            {i === 0 ? <Text style={styles.cover}>Cover</Text> : null}
          </Pressable>
        ))}
      </View>
      {photos.length > 1 ? <Muted>Tap a photo to make it the cover. Long-press to remove it.</Muted> : null}

      <View style={{ gap: 8 }}>
        <Button title="Take photo" onPress={takePhoto} variant="secondary" disabled={room <= 0} />
        <Button title="Choose from library" onPress={pickPhotos} variant="secondary" disabled={room <= 0} />
        <Muted>
          {photos.length}/{MAX_PHOTOS} photos
        </Muted>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 104, height: 104, borderRadius: 10, backgroundColor: colors.chip },
  cover: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});

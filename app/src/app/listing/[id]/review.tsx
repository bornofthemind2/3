import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, colors, Input, Muted, Question, Screen } from '../../../components/ui';
import { parsePrice } from '../../../lib/compose';
import { isAvailable, MARKETPLACE_ORDER, MARKETPLACES } from '../../../lib/marketplaces';
import { useStore } from '../../../lib/store';
import type { Draft, MarketplaceId } from '../../../lib/types';

function PriceInput({ price, onChange }: { price: number; onChange: (n: number) => void }) {
  // Keep the raw text so partial input like "12." isn't reformatted while typing.
  const [text, setText] = useState(Number.isFinite(price) ? String(price) : '');
  return (
    <Input
      value={text}
      onChangeText={(v) => {
        setText(v);
        const n = parsePrice(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      keyboardType="decimal-pad"
    />
  );
}

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { get, update } = useStore();
  const listing = get(id);
  if (!listing?.draft || !listing.answers) return null;

  const { draft, answers } = listing;
  const bulky = listing.identification?.bulky ?? false;
  const setDraft = (patch: Partial<Draft>) => update(listing.id, { draft: { ...draft, ...patch } });

  const toggle = (m: MarketplaceId) => {
    const selected = listing.marketplaces.includes(m);
    update(listing.id, {
      marketplaces: selected ? listing.marketplaces.filter((x) => x !== m) : [...listing.marketplaces, m],
    });
  };

  const next = () => {
    if (!draft.title.trim() || !draft.description.trim()) {
      Alert.alert('Almost there', 'Add a title and a description.');
      return;
    }
    if (listing.marketplaces.length === 0) {
      Alert.alert('Pick a marketplace', 'Choose at least one place to post.');
      return;
    }
    router.push(`/listing/${listing.id}/publish`);
  };

  return (
    <Screen footer={<Button title={`Post to ${listing.marketplaces.length} marketplace${listing.marketplaces.length === 1 ? '' : 's'}`} onPress={next} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {listing.photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.photo} />
        ))}
      </ScrollView>

      <Question label="Title">
        <Input value={draft.title} onChangeText={(title) => setDraft({ title })} maxLength={120} />
        <Muted>{draft.title.length} characters. eBay and Mercari show up to 80.</Muted>
      </Question>

      <Question label="Price ($)">
        <PriceInput price={draft.price} onChange={(price) => setDraft({ price })} />
      </Question>

      <Question label="Description">
        <Input value={draft.description} onChangeText={(description) => setDraft({ description })} multiline style={{ minHeight: 200 }} />
      </Question>

      <Question label="Where to post" hint="We picked the best fits for this item. Tap to change.">
        <View style={{ gap: 8 }}>
          {MARKETPLACE_ORDER.filter((m) => isAvailable(MARKETPLACES[m], answers, bulky)).map((m) => {
            const mk = MARKETPLACES[m];
            const selected = listing.marketplaces.includes(m);
            return (
              <Pressable
                key={m}
                onPress={() => toggle(m)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                style={[styles.market, selected && { borderColor: colors.primary, backgroundColor: '#F0FAF6' }]}
              >
                <View style={[styles.dot, { backgroundColor: mk.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.marketName}>{mk.name}</Text>
                  <Text style={styles.marketMeta}>{mk.bestFor}</Text>
                </View>
                <Text style={[styles.check, selected && { color: colors.primary }]}>{selected ? '✓' : '+'}</Text>
              </Pressable>
            );
          })}
        </View>
      </Question>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 88, height: 88, borderRadius: 10 },
  market: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  marketName: { fontSize: 15, fontWeight: '600', color: colors.text },
  marketMeta: { fontSize: 13, color: colors.muted },
  check: { fontSize: 20, color: colors.muted, width: 24, textAlign: 'center' },
});

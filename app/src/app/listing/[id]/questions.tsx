import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Chips, colors, Input, Muted, Question, Screen } from '../../../components/ui';
import { aiEnabled, composeListing } from '../../../lib/api';
import { composeLocally, parsePrice } from '../../../lib/compose';
import { recommend } from '../../../lib/marketplaces';
import { AGE_OPTIONS, CATEGORY_LABELS, CONDITION_LABELS, FULFILLMENT_LABELS } from '../../../lib/options';
import { useStore } from '../../../lib/store';
import type { Answers, Category, Condition, Fulfillment, Identification, Listing } from '../../../lib/types';

function initialAnswers(identification?: Identification, previous?: Answers): Answers {
  if (previous) return previous;
  const bulky = identification?.bulky ?? false;
  return {
    itemName: identification?.itemName ?? '',
    category: identification?.category ?? 'other',
    brand: identification?.brand ?? '',
    model: identification?.model ?? '',
    condition: identification?.conditionGuess ?? 'good',
    age: '',
    defects: '',
    includes: '',
    dimensions: '',
    price: identification ? String(Math.round((identification.priceLow + identification.priceHigh) / 2)) : '',
    negotiable: true,
    fulfillment: bulky ? 'local' : 'both',
    location: '',
    followUps: {},
  };
}

function toOptions<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

export default function Questions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = useStore().get(id);
  if (!listing) return null;
  // Remount when the identification arrives so the form starts from its prefilled answers.
  return <QuestionsForm key={listing.identification ? 'identified' : 'manual'} listing={listing} />;
}

function QuestionsForm({ listing }: { listing: Listing }) {
  const { update } = useStore();
  const ident = listing.identification;
  const [a, setA] = useState<Answers>(() => initialAnswers(ident, listing.answers));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setA((prev) => ({ ...prev, [key]: value }));

  const next = async () => {
    if (!a.itemName.trim()) {
      Alert.alert('What is it?', 'Give the item a short name so buyers can find it.');
      return;
    }
    if (!Number.isFinite(parsePrice(a.price))) {
      Alert.alert('Asking price', 'Enter the price you want, in dollars.');
      return;
    }
    setBusy(true);
    let draft = composeLocally(a, ident);
    if (aiEnabled) {
      try {
        draft = await composeListing(a, ident);
      } catch (e) {
        Alert.alert(
          'Used a basic template',
          `The listing assistant didn't respond (${e instanceof Error ? e.message : String(e)}). You can edit the text on the next screen.`,
        );
      }
    }
    setBusy(false);
    const marketplaces = listing.marketplaces.length ? listing.marketplaces : recommend(a, ident?.bulky ?? false);
    update(listing.id, { answers: a, draft, marketplaces });
    router.push(`/listing/${listing.id}/review`);
  };

  return (
    <Screen footer={<Button title="Write my listing" onPress={next} loading={busy} />}>
      {ident ? (
        <Card>
          <Text style={styles.title}>Looks like: {ident.itemName}</Text>
          <Muted>
            Similar items often sell for ${ident.priceLow}–${ident.priceHigh}. Check the answers below and fix anything
            the photos got wrong.
          </Muted>
          {ident.notes ? <Muted>{ident.notes}</Muted> : null}
        </Card>
      ) : null}

      <Question label="What is it?">
        <Input value={a.itemName} onChangeText={(v) => set('itemName', v)} placeholder="e.g. Mid-century oak dresser" />
      </Question>

      <Question label="Brand and model" hint="Check labels, the underside, or the back. Leave blank if unbranded.">
        <View style={styles.row}>
          <Input style={styles.flex} value={a.brand} onChangeText={(v) => set('brand', v)} placeholder="Brand" />
          <Input style={styles.flex} value={a.model} onChangeText={(v) => set('model', v)} placeholder="Model" />
        </View>
      </Question>

      <Question label="Category">
        <Chips<Category> options={toOptions(CATEGORY_LABELS)} value={a.category} onChange={(v) => set('category', v)} />
      </Question>

      <Question label="Condition">
        <Chips<Condition> options={toOptions(CONDITION_LABELS)} value={a.condition} onChange={(v) => set('condition', v)} />
      </Question>

      <Question label="How old is it?">
        <Chips<string> options={AGE_OPTIONS.map((o) => ({ value: o, label: o }))} value={a.age} onChange={(v) => set('age', v)} />
      </Question>

      <Question label="Any flaws or damage?" hint="Scratches, stains, missing parts, anything that doesn't work.">
        <Input value={a.defects} onChangeText={(v) => set('defects', v)} placeholder="None" multiline />
      </Question>

      <Question label="What's included?" hint="Original box, manuals, chargers, remotes, accessories.">
        <Input value={a.includes} onChangeText={(v) => set('includes', v)} placeholder="e.g. Charger and original box" />
      </Question>

      <Question label="Size or dimensions (optional)">
        <Input value={a.dimensions} onChangeText={(v) => set('dimensions', v)} placeholder='e.g. 48" W x 18" D x 30" H, or size M' />
      </Question>

      {ident?.followUps.map((q) => (
        <Question key={q.id} label={q.question}>
          {q.options.length ? (
            <Chips<string>
              options={q.options.map((o) => ({ value: o, label: o }))}
              value={a.followUps[q.id]}
              onChange={(v) => set('followUps', { ...a.followUps, [q.id]: v })}
            />
          ) : null}
          <Input
            value={a.followUps[q.id] ?? ''}
            onChangeText={(v) => set('followUps', { ...a.followUps, [q.id]: v })}
            placeholder="Your answer"
          />
        </Question>
      ))}

      <Question label="Asking price ($)">
        <Input value={a.price} onChangeText={(v) => set('price', v)} keyboardType="decimal-pad" placeholder="0" />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Open to offers</Text>
          <Switch value={a.negotiable} onValueChange={(v) => set('negotiable', v)} />
        </View>
      </Question>

      <Question label="How will the buyer get it?">
        <Chips<Fulfillment> options={toOptions(FULFILLMENT_LABELS)} value={a.fulfillment} onChange={(v) => set('fulfillment', v)} />
      </Question>

      {a.fulfillment !== 'ship' ? (
        <Question label="Pickup area" hint="Neighborhood or ZIP code. Don't enter your street address.">
          <Input value={a.location} onChangeText={(v) => set('location', v)} placeholder="e.g. Midtown, 30308" />
        </Question>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 15, color: colors.text },
});

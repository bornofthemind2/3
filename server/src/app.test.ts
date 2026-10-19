import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { createApp } from './app.ts';
import type { Draft, Identification } from './schemas.ts';

const fakeIdentification: Identification = {
  itemName: 'Desk lamp',
  category: 'home_decor',
  brand: 'IKEA',
  model: 'Forså',
  conditionGuess: 'good',
  bulky: false,
  priceLow: 10,
  priceHigh: 20,
  notes: '',
  followUps: [],
};

let seenImages: string[] = [];
const server = createApp({
  token: 'secret',
  identify: async (images) => {
    seenImages = images;
    return fakeIdentification;
  },
  compose: async (): Promise<Draft> => ({ title: 'IKEA Forså desk lamp', description: 'Works.', price: 15, tags: ['lamp'] }),
});
let base = '';

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const post = (path: string, body: unknown, token = 'secret') =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

test('rejects a wrong token', async () => {
  const res = await post('/identify', { images: ['aGk='] }, 'nope');
  assert.equal(res.status, 401);
});

test('identifies from base64 images', async () => {
  const res = await post('/identify', { images: ['aGk=', 'aGVsbG8='] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), fakeIdentification);
  assert.deepEqual(seenImages, ['aGk=', 'aGVsbG8=']);
});

test('validates images', async () => {
  assert.equal((await post('/identify', { images: [] })).status, 400);
  assert.equal((await post('/identify', { images: ['not base64!'] })).status, 400);
  assert.equal((await post('/identify', { images: ['a', 'b', 'c', 'd', 'e'] })).status, 400);
});

test('composes a draft', async () => {
  const res = await post('/compose', { answers: { itemName: 'lamp' } });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as Draft).price, 15);
  assert.equal((await post('/compose', {})).status, 400);
});

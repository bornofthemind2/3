import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';
import { SimulatedProvider } from '../src/providers/simulated.js';

async function boot() {
  const store = new Store(null);
  const app = createApp({ store, provider: new SimulatedProvider({ seed: 3 }) });
  await app.scanner.scan();
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, data: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
  };
  return { ...app, call, close: () => new Promise((r) => app.server.close(r)) };
}

test('API: status, opportunities, odds screen, static files', async () => {
  const app = await boot();
  try {
    const s = await app.call('GET', '/api/status');
    assert.equal(s.data.provider, 'simulated');
    assert.ok(s.data.counts.events > 0);
    for (const p of ['/api/arbs', '/api/ev', '/api/middles', '/api/lowholds', '/api/odds?market=spreads']) {
      const r = await app.call('GET', p);
      assert.equal(r.status, 200, p);
      assert.ok(Array.isArray(r.data), p);
    }
    const odds = await app.call('GET', '/api/odds?market=h2h&sport=soccer');
    assert.ok(odds.data.every((e) => e.sport === 'soccer'));
    assert.deepEqual(odds.data[0].markets[0].outcomes, ['home', 'draw', 'away']);
    assert.match((await app.call('GET', '/')).data, /EdgeFinder/);
    assert.match((await app.call('GET', '/lib/odds.js')).data, /export function devig/);
    assert.equal((await app.call('GET', '/../package.json')).status, 404);
  } finally { await app.close(); }
});

test('API: wallet deposits, bets, settlement and funding check', async () => {
  const app = await boot();
  try {
    await app.call('POST', '/api/wallet/transactions', { book: 'draftkings', type: 'deposit', amount: 500 });
    await app.call('PUT', '/api/wallet/balances/fanduel', { balance: 50 });
    const f = await app.call('POST', '/api/wallet/funding', { legs: [{ book: 'draftkings', stake: 100 }, { book: 'fanduel', stake: 100 }] });
    assert.equal(f.data.funded, false);
    assert.equal(f.data.maxScale, 0.5);

    const bets = await app.call('POST', '/api/wallet/bets', { kind: 'arb', event: 'A @ B', legs: [
      { book: 'draftkings', price: 2.1, stake: 100, label: 'A' }, { book: 'fanduel', price: 2.05, stake: 50, label: 'B' }] });
    assert.equal(bets.data.length, 2);
    let w = (await app.call('GET', '/api/wallet')).data;
    assert.equal(w.balances.draftkings, 400);
    assert.equal(w.totals.exposure, 150);

    await app.call('POST', `/api/wallet/bets/${bets.data[0].id}/settle`, { result: 'won' });
    await app.call('POST', `/api/wallet/bets/${bets.data[1].id}/settle`, { result: 'lost' });
    w = (await app.call('GET', '/api/wallet')).data;
    assert.equal(w.balances.draftkings, 610);
    assert.equal(w.totals.profit, 60);
    // re-settling must not double-credit
    await app.call('POST', `/api/wallet/bets/${bets.data[0].id}/settle`, { result: 'won' });
    assert.equal((await app.call('GET', '/api/wallet')).data.balances.draftkings, 610);

    const bad = await app.call('POST', '/api/wallet/bets', { legs: [{ book: 'x', price: 0.5, stake: 1 }] });
    assert.equal(bad.status, 400);
  } finally { await app.close(); }
});

test('API: settings and calculators', async () => {
  const app = await boot();
  try {
    const s = await app.call('PUT', '/api/settings', { minEvPct: 50, bogus: 1, alerts: { minArbPct: 2 } });
    assert.equal(s.data.minEvPct, 50);
    assert.equal(s.data.bogus, undefined);
    assert.equal(s.data.alerts.minArbPct, 2);
    assert.equal(s.data.alerts.enabled, true);
    assert.equal((await app.call('GET', '/api/ev')).data.length, 0);
    const c = await app.call('POST', '/api/calc/arbitrage', { prices: [2.1, 2.05], totalStake: 1000 });
    assert.equal(c.data.isArb, true);
    assert.equal((await app.call('POST', '/api/calc/nope', {})).status, 404);
  } finally { await app.close(); }
});

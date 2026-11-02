// Unit tests for the live-odds adapter using a fake fetch. They check how requests are built and
// responses are parsed; they are not a substitute for a real run against api.the-odds-api.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TheOddsApiProvider } from '../src/providers/theOddsApi.js';
import { Scanner } from '../src/scanner.js';
import { Store } from '../src/store.js';
import { loadDotEnv } from '../src/server.js';

const NOW = Date.parse('2026-11-02T18:00:00Z');
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();

function game({ id = 'g1', home = 'Celtics', away = 'Knicks', start = '2026-11-03T00:00:00Z', books }) {
  return {
    id, sport_key: 'basketball_nba', sport_title: 'NBA', commence_time: start, home_team: home, away_team: away,
    bookmakers: Object.entries(books).map(([key, [h, a, upd = iso(1)]]) => ({
      key, title: key, last_update: upd,
      markets: [{ key: 'h2h', last_update: upd, outcomes: [{ name: home, price: h }, { name: away, price: a }] }],
    })),
  };
}

function fakeFetch(routes, { remaining = 9000 } = {}) {
  const calls = [];
  const fn = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const route = routes[u.pathname.replace('/v4', '')];
    const [status, body, last = 0] = typeof route === 'function' ? route(u) : route ?? [404, { message: 'no route' }];
    remaining -= last;
    return new Response(JSON.stringify(body), { status, headers: { 'x-requests-remaining': String(remaining), 'x-requests-used': String(10000 - remaining), 'x-requests-last': String(last) } });
  };
  fn.calls = calls;
  return fn;
}

const sportsList = [200, [
  { key: 'basketball_nba', active: true }, { key: 'baseball_mlb', active: false },
  { key: 'icehockey_nhl', active: true }, { key: 'tennis_atp_paris', active: true },
]];

test('requests only in-season supported sports, maps book keys, never sends regions', async () => {
  const fetch = fakeFetch({
    '/sports': sportsList,
    '/sports/basketball_nba/odds': [200, [game({ books: { draftkings: [1.9, 2.0], williamhill_us: [1.95, 1.95], pinnacle: [1.92, 1.98] } })], 3],
    '/sports/icehockey_nhl/odds': [200, [], 3],
  });
  const p = new TheOddsApiProvider({ apiKey: 'k', fetchImpl: fetch, now: () => NOW, books: () => ['draftkings', 'caesars', 'fanduel', 'pinnacle'] });
  const events = await p.fetch();
  const odds = fetch.calls.filter((u) => u.pathname.endsWith('/odds'));
  assert.deepEqual(odds.map((u) => u.pathname.split('/')[3]).sort(), ['basketball_nba', 'icehockey_nhl']);
  const q = odds[0].searchParams;
  assert.equal(q.get('bookmakers'), 'draftkings,williamhill_us,fanduel,pinnacle');
  assert.equal(q.get('regions'), null);
  assert.equal(q.get('oddsFormat'), 'decimal');
  assert.equal(q.get('apiKey'), 'k');
  assert.deepEqual([...new Set(events[0].offers.map((o) => o.book))].sort(), ['caesars', 'draftkings', 'pinnacle']);
  assert.deepEqual(p.missingBooks, ['fanduel']);
  assert.equal(p.credits.lastScan, 6);
  assert.equal(p.credits.remaining, 9000 - 6);
  assert.equal(p.costPerScan(), 2 * 3 * 1); // 2 sports × 3 markets × ⌈4 books / 10⌉
});

test('price movement and history persist across scans', async () => {
  let price = 2.0;
  const fetch = fakeFetch({ '/sports/basketball_nba/odds': () => [200, [game({ books: { draftkings: [price, 1.9] } })], 1] });
  const p = new TheOddsApiProvider({ apiKey: 'k', sports: ['basketball_nba'], fetchImpl: fetch, now: () => NOW, books: () => ['draftkings'] });
  await p.fetch();
  price = 2.1;
  let home = (await p.fetch())[0].offers.find((o) => o.outcome === 'home');
  assert.equal(home.prev, 2.0);
  home = (await p.fetch())[0].offers.find((o) => o.outcome === 'home');
  assert.equal(home.prev, 2.0, 'unchanged price keeps its last movement');
  assert.equal(p.getHistory('g1').find((h) => h.outcome === 'home').points.length, 2);
});

test('clear errors: bad key, partial failures, credit guard', async () => {
  const bad = new TheOddsApiProvider({ apiKey: 'nope', fetchImpl: fakeFetch({ '/sports': [401, { message: 'API key is not valid' }] }) });
  await assert.rejects(bad.fetch(), /API key rejected.*not valid/);

  const partial = new TheOddsApiProvider({ apiKey: 'k', sports: ['basketball_nba', 'icehockey_nhl'], books: () => ['draftkings'], fetchImpl: fakeFetch({
    '/sports/basketball_nba/odds': [200, [game({ books: { draftkings: [1.9, 2.0] } })], 1],
    '/sports/icehockey_nhl/odds': [500, {}],
  }) });
  assert.equal((await partial.fetch()).length, 1);
  assert.match(partial.warnings[0], /icehockey_nhl.*HTTP 500/);

  const broke = new TheOddsApiProvider({ apiKey: 'k', sports: ['basketball_nba'], books: () => ['draftkings'], fetchImpl: fakeFetch({ '/sports/basketball_nba/odds': [200, [], 1] }, { remaining: 3 }) });
  await broke.fetch(); // learns remaining = 2
  await assert.rejects(broke.fetch(), /Not enough API credits/);
});

test('scanner ignores stale prices from the live feed (classic false arbs)', async () => {
  const fetch = fakeFetch({ '/sports/basketball_nba/odds': [200, [game({
    start: new Date(NOW + 3600e3).toISOString(),
    books: { draftkings: [2.2, 1.7, iso(1)], fanduel: [1.7, 2.2, iso(90)], pinnacle: [1.95, 1.95, iso(1)] },
  })], 1] });
  const store = new Store(null);
  const provider = new TheOddsApiProvider({ apiKey: 'k', sports: ['basketball_nba'], fetchImpl: fetch, now: () => Date.now() });
  // shift fixture timestamps to be relative to the real clock
  const realNow = Date.now();
  provider.fetchImpl = async (u) => {
    const res = await fetch(u);
    const body = JSON.stringify(await res.json()).replace(/2026-11-02T1[0-9]:[0-9:.]+Z/g, (m) => new Date(realNow - (NOW - Date.parse(m))).toISOString());
    return new Response(body, { status: res.status, headers: res.headers });
  };
  const scanner = new Scanner({ provider, store });
  await scanner.scan();
  assert.equal(scanner.results.arbs.length, 0, 'FanDuel price is 90 min old → excluded');
  store.updateSettings({ staleAfterMin: 0 });
  scanner.compute();
  assert.equal(scanner.results.arbs.length, 1, 'with the filter off the stale arb shows');
  assert.ok(scanner.status().live.costPerScan >= 1);
});

test('.env loader sets missing vars without overriding real ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ef-'));
  const f = join(dir, '.env');
  writeFileSync(f, '# comment\nEF_TEST_A=hello\nexport EF_TEST_B="quoted value"\nEF_TEST_C=from-file\n');
  process.env.EF_TEST_C = 'from-env';
  loadDotEnv(f);
  assert.equal(process.env.EF_TEST_A, 'hello');
  assert.equal(process.env.EF_TEST_B, 'quoted value');
  assert.equal(process.env.EF_TEST_C, 'from-env');
});

test('network failures name the host and the cause', async () => {
  const p = new TheOddsApiProvider({ apiKey: 'k', sports: ['basketball_nba'], fetchImpl: async () => { throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }); } });
  await assert.rejects(p.fetch(), /Could not reach api\.the-odds-api\.com \(ENOTFOUND\)/);
});

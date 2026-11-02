import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findArbitrage, findPositiveEV, findMiddles, findLowHolds, groupMarkets } from '../src/lib/engine.js';
import { SimulatedProvider } from '../src/providers/simulated.js';
import { normalizeOddsApiEvent } from '../src/providers/theOddsApi.js';

const o = (book, market, line, outcome, price) => ({ book, market, line, outcome, price, updated: '2026-01-01T00:00:00Z' });
const event = (offers, extra = {}) => ({ id: 'e1', sport: 'basketball', league: 'NBA', home: 'Home', away: 'Away', commence: '2030-01-01T00:00:00Z', status: 'upcoming', offers, ...extra });

test('finds a two-way arbitrage across books with correct stakes', () => {
  const ev = event([
    o('pinnacle', 'h2h', null, 'home', 1.95), o('pinnacle', 'h2h', null, 'away', 1.95),
    o('draftkings', 'h2h', null, 'home', 2.12), o('draftkings', 'h2h', null, 'away', 1.75),
    o('fanduel', 'h2h', null, 'home', 1.8), o('fanduel', 'h2h', null, 'away', 2.02),
  ]);
  const [arb] = findArbitrage([ev], { totalStake: 100 });
  assert.ok(arb);
  assert.deepEqual(arb.legs.map((l) => l.book), ['draftkings', 'fanduel']);
  assert.ok(arb.profitPct > 2.5 && arb.profitPct < 3);
  assert.equal(findArbitrage([ev], { excludeBooks: ['fanduel'] }).length, 0);
  assert.equal(findArbitrage([{ ...ev, status: 'final' }]).length, 0);
});

test('+EV uses de-vigged sharp line as fair value', () => {
  const ev = event([
    o('pinnacle', 'h2h', null, 'home', 2.0), o('pinnacle', 'h2h', null, 'away', 1.85),
    o('betmgm', 'h2h', null, 'home', 2.2), o('betmgm', 'h2h', null, 'away', 1.65),
  ]);
  const list = findPositiveEV([ev], { sharpBooks: ['pinnacle'], minEvPct: 1, bankroll: 1000, kellyFraction: 0.25 });
  assert.equal(list.length, 1);
  const x = list[0];
  assert.equal(x.book, 'betmgm');
  assert.equal(x.outcome, 'home');
  const fair = (1 / 2.0) / (1 / 2.0 + 1 / 1.85);
  assert.ok(Math.abs(x.fairProb - fair) < 1e-3);
  assert.ok(Math.abs(x.evPct - (fair * 2.2 - 1) * 100) < 0.01);
  assert.ok(x.kellyStake > 0);
});

test('middles on totals with different lines', () => {
  const ev = event([
    o('draftkings', 'totals', 224.5, 'over', 1.91), o('draftkings', 'totals', 224.5, 'under', 1.91),
    o('fanduel', 'totals', 228.5, 'over', 1.91), o('fanduel', 'totals', 228.5, 'under', 1.91),
  ]);
  const mids = findMiddles([ev], { minEvPct: -100 });
  const m = mids.find((x) => x.market === 'totals' && x.width === 4);
  assert.ok(m, 'Over 224.5 / Under 228.5 middle found');
  assert.deepEqual(m.legs.map((l) => l.label), ['Over 224.5', 'Under 228.5']);
  assert.ok(m.profitIfHit > 0 && m.profitIfMiss < 0);
});

test('spread groups carry the home line and low holds are sorted', () => {
  const ev = event([
    o('a', 'spreads', -3.5, 'home', 1.95), o('a', 'spreads', -3.5, 'away', 1.95),
    o('b', 'spreads', -3.5, 'home', 1.9), o('b', 'spreads', -3.5, 'away', 2.0),
  ]);
  const [g] = groupMarkets(ev);
  assert.equal(g.best.home.book, 'a');
  assert.equal(g.best.away.book, 'b');
  const lows = findLowHolds([ev], { maxHoldPct: 5 });
  assert.equal(lows[0].legs[1].label, 'Away +3.5');
});

test('simulated feed is deterministic and produces realistic opportunities', async () => {
  const run = async () => {
    const p = new SimulatedProvider({ seed: 7, now: () => Date.parse('2026-11-02T12:00:00Z') });
    let events;
    for (let i = 0; i < 15; i++) events = await p.fetch();
    return events;
  };
  const a = await run(), b = await run();
  assert.deepEqual(a, b);
  assert.ok(a.length >= 25);
  assert.ok(new Set(a.flatMap((e) => e.offers.map((x) => x.book))).size >= 15);
  for (const arb of findArbitrage(a)) assert.ok(arb.profitPct < 15, `implausible arb ${arb.profitPct}%`);
  for (const x of findPositiveEV(a, { sharpBooks: ['pinnacle', 'circa'] })) assert.ok(x.evPct < 25);
});

test('normalizes The Odds API payloads', () => {
  const ev = normalizeOddsApiEvent({
    id: 'x', sport_key: 'basketball_nba', sport_title: 'NBA', commence_time: '2099-01-01T00:00:00Z', home_team: 'Celtics', away_team: 'Knicks',
    bookmakers: [{ key: 'draftkings', last_update: 't', markets: [
      { key: 'h2h', outcomes: [{ name: 'Celtics', price: 1.5 }, { name: 'Knicks', price: 2.6 }] },
      { key: 'spreads', outcomes: [{ name: 'Celtics', price: 1.91, point: -5.5 }, { name: 'Knicks', price: 1.91, point: 5.5 }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 221.5 }, { name: 'Under', price: 1.92, point: 221.5 }] },
    ] }],
  });
  assert.equal(ev.sport, 'basketball');
  assert.equal(ev.status, 'upcoming');
  assert.equal(ev.offers.length, 6);
  assert.ok(ev.offers.filter((x) => x.market === 'spreads').every((x) => x.line === -5.5));
  assert.deepEqual(ev.offers.filter((x) => x.market === 'totals').map((x) => x.outcome), ['over', 'under']);
});

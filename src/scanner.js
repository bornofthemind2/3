// The automation loop: poll the odds provider, recompute every opportunity, push updates to
// connected clients (SSE) and fire webhook alerts (Discord / Slack / generic) for new hits.
import { EventEmitter } from 'node:events';
import { findArbitrage, findPositiveEV, findMiddles, findLowHolds, groupMarkets } from './lib/engine.js';
import { formatOdds } from './lib/odds.js';
import { bookById } from './providers/books.js';

export class Scanner extends EventEmitter {
  constructor({ provider, store, fetchImpl = globalThis.fetch }) {
    super();
    this.provider = provider;
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.events = [];
    this.results = { arbs: [], ev: [], middles: [], lowHolds: [] };
    this.firstSeen = new Map();
    this.alerted = new Set();
    this.lastScan = null;
    this.lastError = null;
    this.scanCount = 0;
    this.scanMs = 0;
    this.timer = null;
  }

  start() {
    const loop = async () => {
      await this.scan();
      const sec = this.provider.name === 'simulated' ? this.store.settings.scanIntervalSec : Math.max(60, this.store.settings.scanIntervalSec);
      this.timer = setTimeout(loop, sec * 1000);
    };
    loop();
  }

  stop() { clearTimeout(this.timer); }

  async scan() {
    const t0 = Date.now();
    try {
      this.events = await this.provider.fetch();
      this.compute();
      this.lastError = null;
    } catch (e) {
      this.lastError = e.message;
      console.error('[scanner]', e);
    }
    this.lastScan = new Date().toISOString();
    this.scanCount++;
    this.scanMs = Date.now() - t0;
    this.emit('update', this.status());
    return this.results;
  }

  compute() {
    const s = this.store.settings;
    const bankroll = this.store.walletSummary().totals.bankroll || 1000;
    const common = { books: s.myBooks, totalStake: s.totalStake };
    const results = {
      arbs: findArbitrage(this.events, { ...common, minProfitPct: s.minArbPct }),
      ev: findPositiveEV(this.events, {
        ...common, sharpBooks: s.sharpBooks, minEvPct: s.minEvPct, method: s.devigMethod,
        bankroll, kellyFraction: s.kellyFraction,
      }),
      middles: findMiddles(this.events, { ...common, minEvPct: s.minMiddleEvPct, sharpBooks: s.sharpBooks, method: s.devigMethod }),
      lowHolds: findLowHolds(this.events, { maxHoldPct: s.maxHoldPct, books: s.myBooks }),
    };
    // track how long each opportunity has been alive
    const now = Date.now();
    const alive = new Set();
    for (const list of Object.values(results)) for (const r of list) {
      alive.add(r.id);
      if (!this.firstSeen.has(r.id)) this.firstSeen.set(r.id, now);
      r.ageSec = Math.round((now - this.firstSeen.get(r.id)) / 1000);
    }
    for (const id of this.firstSeen.keys()) if (!alive.has(id)) { this.firstSeen.delete(id); this.alerted.delete(id); }
    this.results = results;
    this.alert(results).catch((e) => console.warn('[alerts]', e.message));
  }

  async alert({ arbs, ev }) {
    const a = this.store.settings.alerts;
    if (!a.enabled) return;
    const fresh = [
      ...arbs.filter((x) => x.profitPct >= a.minArbPct),
      ...ev.filter((x) => x.evPct >= a.minEvPct),
    ].filter((x) => !this.alerted.has(x.id));
    if (!fresh.length) return;
    for (const x of fresh) this.alerted.add(x.id);
    this.emit('alert', fresh);
    if (!a.webhookUrl) return;
    const fmt = this.store.settings.oddsFormat;
    const lines = fresh.slice(0, 10).map((x) => x.legs
      ? `🟢 ARB ${x.profitPct.toFixed(2)}% · ${x.event} · ${x.marketLabel}\n` + x.legs.map((l) => `   ${l.label} ${formatOdds(l.price, fmt)} @ ${bookById[l.book]?.name ?? l.book} — stake $${l.stake}`).join('\n')
      : `🔵 +EV ${x.evPct.toFixed(2)}% · ${x.event} · ${x.label} ${formatOdds(x.price, fmt)} @ ${bookById[x.book]?.name ?? x.book} (fair ${formatOdds(x.fairPrice, fmt)}, Kelly $${x.kellyStake})`);
    const text = lines.join('\n');
    // Discord expects {content}, Slack expects {text}; send both.
    await this.fetchImpl(a.webhookUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text.slice(0, 1990), text, opportunities: fresh }),
    });
  }

  status() {
    return {
      provider: this.provider.name,
      lastScan: this.lastScan, lastError: this.lastError, scanCount: this.scanCount, scanMs: this.scanMs,
      remainingCredits: this.provider.remainingCredits ?? null,
      counts: {
        events: this.events.length,
        live: this.events.filter((e) => e.status === 'live').length,
        books: new Set(this.events.flatMap((e) => e.offers.map((o) => o.book))).size,
        arbs: this.results.arbs.length, ev: this.results.ev.length,
        middles: this.results.middles.length, lowHolds: this.results.lowHolds.length,
      },
    };
  }

  /** Data for the odds screen: one row per event market with each book's prices and the best price. */
  oddsScreen({ sport, market = 'h2h', status, q } = {}) {
    const needle = q?.toLowerCase();
    return this.events
      .filter((e) => (!sport || e.sport === sport) && (!status || e.status === status))
      .filter((e) => !needle || `${e.home} ${e.away} ${e.league}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.status === 'live') === (b.status === 'live') ? a.commence.localeCompare(b.commence) : a.status === 'live' ? -1 : 1)
      .map((e) => {
        const groups = groupMarkets(e).filter((g) => g.market === market);
        // main line = the one quoted by the most books
        groups.sort((a, b) => Object.keys(b.books).length - Object.keys(a.books).length);
        return {
          id: e.id, sport: e.sport, league: e.league, home: e.home, away: e.away, commence: e.commence,
          status: e.status, score: e.score,
          markets: groups.map((g) => ({ key: g.key, market: g.market, line: g.line, outcomes: g.outcomes, books: g.books, best: g.best, holdPct: g.bestHold == null ? null : g.bestHold * 100 })),
        };
      });
  }
}

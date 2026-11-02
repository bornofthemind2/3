// Live odds via The Odds API (https://the-odds-api.com). Read-only odds feed — no sportsbook logins.
// Enabled when ODDS_API_KEY is set. We request only the books you use plus the sharp reference books
// (`bookmakers=` param; every 10 books bill like one region), so each scan costs
// markets × ceil(books / 10) credits per in-season sport. See costPerScan() and the status bar.
import { BOOKS, fromOddsApiKey } from './books.js';

const SPORT_MAP = {
  americanfootball_nfl: ['americanfootball', 'NFL'],
  americanfootball_ncaaf: ['americanfootball', 'NCAAF'],
  basketball_nba: ['basketball', 'NBA'],
  basketball_ncaab: ['basketball', 'NCAAB'],
  icehockey_nhl: ['icehockey', 'NHL'],
  baseball_mlb: ['baseball', 'MLB'],
  soccer_epl: ['soccer', 'EPL'],
  soccer_uefa_champs_league: ['soccer', 'UCL'],
};

export function normalizeOddsApiEvent(raw) {
  const [sport, league] = SPORT_MAP[raw.sport_key] ?? [raw.sport_key.split('_')[0], raw.sport_title];
  const outcomeKey = (market, name) => {
    if (market === 'totals') return name.toLowerCase(); // Over / Under
    if (name === raw.home_team) return 'home';
    if (name === raw.away_team) return 'away';
    if (name.toLowerCase() === 'draw') return 'draw';
    return null;
  };
  const offers = [];
  for (const bm of raw.bookmakers ?? []) {
    const book = fromOddsApiKey[bm.key] ?? bm.key;
    for (const m of bm.markets ?? []) {
      if (!['h2h', 'spreads', 'totals'].includes(m.key)) continue;
      const homePoint = m.key === 'spreads' ? m.outcomes.find((o) => o.name === raw.home_team)?.point : null;
      for (const o of m.outcomes) {
        const outcome = outcomeKey(m.key, o.name);
        if (!outcome) continue;
        const line = m.key === 'h2h' ? null : m.key === 'spreads' ? (homePoint ?? -o.point) : o.point;
        offers.push({ book, market: m.key, line, outcome, price: o.price, updated: m.last_update ?? bm.last_update });
      }
    }
  }
  const started = Date.parse(raw.commence_time) <= Date.now();
  return {
    id: raw.id, sport, league, home: raw.home_team, away: raw.away_team,
    commence: raw.commence_time, status: started ? 'live' : 'upcoming', score: null, offers,
  };
}

export const DEFAULT_SPORTS = Object.keys(SPORT_MAP);
const API = 'https://api.the-odds-api.com/v4';

export class TheOddsApiProvider {
  /**
   * @param apiKey   The Odds API key (never logged or sent anywhere else)
   * @param sports   explicit sport keys, or null = every supported sport that is currently in season
   * @param books    () => our book ids to request (your books + sharp references)
   * @param markets  comma list; each market multiplies the credit cost
   */
  constructor({ apiKey, sports = null, books = () => BOOKS.map((b) => b.id), markets = 'h2h,spreads,totals', fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
    if (!apiKey) throw new Error('TheOddsApiProvider requires an apiKey');
    this.name = 'the-odds-api';
    this.apiKey = apiKey;
    this.fixedSports = sports?.length ? sports : null;
    this.books = books;
    this.markets = markets;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.state = new Map(); // offer key -> { price, prev }
    this.history = new Map(); // offer key -> [[iso, price], ...]
    this.sportsCache = null;
    this.credits = { remaining: null, used: null, lastScan: 0 };
    this.warnings = [];
    this.missingBooks = [];
    this.lastSports = [];
  }

  get remainingCredits() { return this.credits.remaining; }

  async get(path, params = {}) {
    const url = new URL(API + path);
    url.search = new URLSearchParams({ ...params, apiKey: this.apiKey });
    let res;
    try {
      res = await this.fetchImpl(url);
    } catch (e) {
      const why = e.cause?.code || e.cause?.message || e.message;
      const behindProxy = (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY;
      throw new Error(`Could not reach ${url.host} (${why})${behindProxy ? ' — HTTPS_PROXY is set: start with NODE_USE_ENV_PROXY=1 so Node uses it' : ' — check your network / firewall allows this host'}`);
    }
    const h = (k) => res.headers.get(k);
    if (h('x-requests-remaining') != null) this.credits.remaining = Number(h('x-requests-remaining'));
    if (h('x-requests-used') != null) this.credits.used = Number(h('x-requests-used'));
    const cost = Number(h('x-requests-last') ?? 0);
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message ?? ''; } catch { /* not JSON */ }
      const hint = res.status === 401 ? 'API key rejected — check ODDS_API_KEY'
        : res.status === 429 ? 'rate limited or out of credits' : `HTTP ${res.status}`;
      const err = new Error(`${path}: ${hint}${msg ? ` (${msg})` : ''}`);
      err.status = res.status;
      throw err;
    }
    return { data: await res.json(), cost };
  }

  /** In-season sports. The /sports endpoint does not use credits; cached for an hour. */
  async resolveSports() {
    if (this.fixedSports) return this.fixedSports;
    if (this.sportsCache && this.now() - this.sportsCache.at < 3600_000) return this.sportsCache.list;
    try {
      const { data } = await this.get('/sports');
      const list = data.filter((s) => s.active && SPORT_MAP[s.key]).map((s) => s.key);
      this.sportsCache = { at: this.now(), list };
      return list;
    } catch (e) {
      if (e.status === 401) throw e;
      return this.sportsCache?.list ?? DEFAULT_SPORTS;
    }
  }

  bookmakerKeys() {
    return [...new Set(this.books())].map((id) => BOOKS.find((b) => b.id === id)?.oddsApiKey ?? id);
  }

  /** Credits one scan costs: markets × ceil(bookmakers / 10) per sport (the API's billing rule). */
  costPerScan(sportCount = this.lastSports.length || DEFAULT_SPORTS.length) {
    return sportCount * this.markets.split(',').length * Math.max(1, Math.ceil(this.bookmakerKeys().length / 10));
  }

  async fetch() {
    const sports = await this.resolveSports();
    this.lastSports = sports;
    if (this.credits.remaining != null && this.credits.remaining < this.costPerScan(sports.length)) {
      throw new Error(`Not enough API credits left (${this.credits.remaining}) for a scan costing ~${this.costPerScan(sports.length)}`);
    }
    const bookmakers = this.bookmakerKeys().join(',');
    const results = await Promise.allSettled(sports.map((sport) =>
      this.get(`/sports/${sport}/odds`, { bookmakers, markets: this.markets, oddsFormat: 'decimal', dateFormat: 'iso' })));
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
    if (!ok.length && failed.length) throw failed[0];
    this.warnings = failed.map((e) => e.message);
    this.credits.lastScan = ok.reduce((s, r) => s + r.cost, 0);

    const events = ok.flatMap((r) => r.data).map(normalizeOddsApiEvent);
    const t = new Date(this.now()).toISOString();
    const seenKeys = new Set();
    const seenBooks = new Set();
    for (const ev of events) for (const o of ev.offers) {
      seenBooks.add(o.book);
      const k = `${ev.id}|${o.book}|${o.market}|${o.line}|${o.outcome}`;
      seenKeys.add(k);
      const st = this.state.get(k);
      const prev = st && st.price !== o.price ? st.price : st?.prev;
      if (prev != null) o.prev = prev;
      this.state.set(k, { price: o.price, prev });
      const h = this.history.get(k) ?? [];
      if (!h.length || h[h.length - 1][1] !== o.price) h.push([o.updated ?? t, o.price]);
      if (h.length > 60) h.shift();
      this.history.set(k, h);
    }
    for (const k of this.state.keys()) if (!seenKeys.has(k)) { this.state.delete(k); this.history.delete(k); }
    this.missingBooks = [...new Set(this.books())].filter((id) => !seenBooks.has(id));
    return events;
  }

  info() {
    return {
      credits: this.credits, costPerScan: this.costPerScan(), sports: this.lastSports,
      missingBooks: this.missingBooks, warnings: this.warnings,
    };
  }

  getHistory(eventId) {
    const out = [];
    for (const [k, points] of this.history) {
      if (!k.startsWith(`${eventId}|`)) continue;
      const [, book, market, line, outcome] = k.split('|');
      out.push({ book, market, line: line === 'null' ? null : Number(line), outcome, points });
    }
    return out;
  }
}

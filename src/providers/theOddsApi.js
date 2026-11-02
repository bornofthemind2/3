// Live odds via The Odds API (https://the-odds-api.com) — covers 70+ US/UK/EU/AU sportsbooks.
// Enabled when ODDS_API_KEY is set. Each fetch costs (markets × regions) credits per sport, so the
// scanner interval for this provider defaults to 60s.

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
    for (const m of bm.markets ?? []) {
      if (!['h2h', 'spreads', 'totals'].includes(m.key)) continue;
      const homePoint = m.key === 'spreads' ? m.outcomes.find((o) => o.name === raw.home_team)?.point : null;
      for (const o of m.outcomes) {
        const outcome = outcomeKey(m.key, o.name);
        if (!outcome) continue;
        const line = m.key === 'h2h' ? null : m.key === 'spreads' ? (homePoint ?? -o.point) : o.point;
        offers.push({ book: bm.key, market: m.key, line, outcome, price: o.price, updated: m.last_update ?? bm.last_update });
      }
    }
  }
  const started = Date.parse(raw.commence_time) <= Date.now();
  return {
    id: raw.id, sport, league, home: raw.home_team, away: raw.away_team,
    commence: raw.commence_time, status: started ? 'live' : 'upcoming', score: null, offers,
  };
}

export class TheOddsApiProvider {
  constructor({ apiKey, sports = Object.keys(SPORT_MAP).slice(0, 6), regions = 'us,us2,uk,eu', markets = 'h2h,spreads,totals', fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new Error('TheOddsApiProvider requires an apiKey');
    this.name = 'the-odds-api';
    this.apiKey = apiKey;
    this.sports = sports;
    this.regions = regions;
    this.markets = markets;
    this.fetchImpl = fetchImpl;
    this.prev = new Map();
    this.remainingCredits = null;
  }

  async fetch() {
    const results = await Promise.allSettled(this.sports.map(async (sport) => {
      const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
      url.search = new URLSearchParams({ apiKey: this.apiKey, regions: this.regions, markets: this.markets, oddsFormat: 'decimal' });
      const res = await this.fetchImpl(url);
      if (!res.ok) throw new Error(`${sport}: HTTP ${res.status}`);
      this.remainingCredits = res.headers.get('x-requests-remaining') ?? this.remainingCredits;
      return res.json();
    }));
    const events = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value).map(normalizeOddsApiEvent);
    const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
    if (errors.length) console.warn('[odds-api]', errors.join('; '));
    // attach previous price for movement arrows
    const next = new Map();
    for (const ev of events) for (const o of ev.offers) {
      const k = `${ev.id}|${o.book}|${o.market}|${o.line}|${o.outcome}`;
      const p = this.prev.get(k);
      if (p != null && p !== o.price) o.prev = p;
      next.set(k, o.price);
    }
    this.prev = next;
    return events;
  }

  getHistory() { return []; }
}

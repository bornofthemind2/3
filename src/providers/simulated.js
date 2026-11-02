// Simulated multi-book odds feed. Models a "true" game state per event, has every book quote off it with
// its own margin and bias, and lets soft books lag the sharp market — which is exactly what produces
// real-world arbs and +EV spots. Used when no ODDS_API_KEY is configured, and in tests (seeded).
import { BOOKS } from './books.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const SPORTS = {
  americanfootball: {
    league: 'NFL', sigma: 13.5, tSigma: 10, totalMean: 45, muRange: 10, durationMin: 190,
    teams: ['Chiefs', 'Bills', 'Eagles', '49ers', 'Ravens', 'Lions', 'Cowboys', 'Packers', 'Dolphins', 'Bengals', 'Jets', 'Steelers', 'Chargers', 'Texans', 'Rams', 'Vikings'],
  },
  basketball: {
    league: 'NBA', sigma: 12, tSigma: 18, totalMean: 228, muRange: 9, durationMin: 150,
    teams: ['Celtics', 'Nuggets', 'Bucks', 'Lakers', 'Warriors', 'Suns', 'Knicks', 'Heat', 'Thunder', 'Mavericks', '76ers', 'Timberwolves', 'Cavaliers', 'Kings'],
  },
  icehockey: {
    league: 'NHL', sigma: 2.4, tSigma: 2.2, totalMean: 6, muRange: 0.8, durationMin: 160, fixedSpread: 1.5,
    teams: ['Bruins', 'Rangers', 'Oilers', 'Avalanche', 'Panthers', 'Stars', 'Maple Leafs', 'Golden Knights', 'Devils', 'Hurricanes'],
  },
  baseball: {
    league: 'MLB', sigma: 4.2, tSigma: 4.4, totalMean: 8.5, muRange: 1.2, durationMin: 180, fixedSpread: 1.5,
    teams: ['Dodgers', 'Yankees', 'Braves', 'Astros', 'Phillies', 'Orioles', 'Rangers', 'Mariners', 'Padres', 'Cubs'],
  },
  soccer: {
    league: 'EPL', sigma: 1.7, tSigma: 1.7, totalMean: 2.75, muRange: 0.9, durationMin: 115,
    teams: ['Arsenal', 'Man City', 'Liverpool', 'Chelsea', 'Tottenham', 'Man United', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham'],
  },
};

const roundHalf = (x) => Math.round(x * 2) / 2;
const roundPrice = (d) => Math.max(1.01, Math.round(d * 1000) / 1000);

export class SimulatedProvider {
  constructor({ seed = Date.now(), eventsPerSport = 6, books = BOOKS, now = () => Date.now() } = {}) {
    this.name = 'simulated';
    this.rand = mulberry32(seed);
    this.books = books;
    this.now = now;
    this.events = [];
    this.history = new Map();
    this.seq = 0;
    for (const sport of Object.keys(SPORTS)) {
      for (let i = 0; i < eventsPerSport; i++) this.events.push(this.newEvent(sport, i));
    }
    for (const ev of this.events) for (const b of this.books) this.quote(ev, b, true);
  }

  gauss() {
    const u = Math.max(this.rand(), 1e-12), v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }

  newEvent(sport, index) {
    const cfg = SPORTS[sport];
    const teams = [...cfg.teams].sort(() => this.rand() - 0.5);
    // A couple of games per sport start "live"; the rest tip off over the next 2 days.
    const startsIn = index < 2 ? -(this.rand() * cfg.durationMin * 0.6) : 20 + this.rand() * 2880;
    const ev = {
      id: `sim-${sport}-${++this.seq}`,
      sport, league: cfg.league, home: teams[0], away: teams[1],
      commence: new Date(this.now() + startsIn * 60000).toISOString(),
      status: 'upcoming',
      // latent state
      mu: (this.rand() * 2 - 1) * cfg.muRange + cfg.sigma * 0.12, // home advantage
      tmu: cfg.totalMean + this.gauss() * cfg.tSigma * 0.15,
      bookState: {},
      score: null,
    };
    this.updateStatus(ev);
    return ev;
  }

  /** Expected final margin / total given the live score. */
  expected(ev) {
    const live = ev.status === 'live' && ev.score;
    const progress = live ? Math.min(0.95, parseFloat(ev.score.clock) / 100) : 0;
    return {
      progress,
      mu: live ? (ev.score.home - ev.score.away) + ev.mu * (1 - progress) : ev.mu,
      tmu: live ? ev.score.home + ev.score.away + ev.tmu * (1 - progress) : ev.tmu,
    };
  }

  /** The sharp market's main lines right now. */
  mainLines(ev) {
    const cfg = SPORTS[ev.sport];
    const { mu, tmu } = this.expected(ev);
    return {
      spread: cfg.fixedSpread ? (mu > 0 ? -cfg.fixedSpread : cfg.fixedSpread) : roundHalf(-mu),
      total: cfg.tSigma < 3 ? Math.floor(tmu) + 0.5 : roundHalf(tmu),
    };
  }

  updateStatus(ev) {
    const cfg = SPORTS[ev.sport];
    const elapsed = (this.now() - Date.parse(ev.commence)) / 60000;
    if (elapsed < 0) ev.status = 'upcoming';
    else if (elapsed < cfg.durationMin) {
      ev.status = 'live';
      ev.score ??= { home: 0, away: 0, clock: '' };
      ev.score.clock = `${Math.round((elapsed / cfg.durationMin) * 100)}%`;
    } else ev.status = 'final';
  }

  /** Fair probabilities for every market line given the game state. */
  fairMarkets(ev, spreadLine, totalLine) {
    const cfg = SPORTS[ev.sport];
    const { progress, mu, tmu } = this.expected(ev);
    const rem = Math.sqrt(1 - progress);
    const sig = cfg.sigma * rem, tsig = cfg.tSigma * rem;
    const markets = {};
    if (ev.sport === 'soccer') {
      const pHome = 1 - normCdf((0.5 - mu) / sig);
      const pAway = normCdf((-0.5 - mu) / sig);
      markets.h2h = { home: pHome, away: pAway, draw: 1 - pHome - pAway };
    } else {
      const pHome = 1 - normCdf(-mu / sig);
      markets.h2h = { home: pHome, away: 1 - pHome };
    }
    const pCover = 1 - normCdf((-spreadLine - mu) / sig);
    markets.spreads = { home: pCover, away: 1 - pCover };
    const pOver = 1 - normCdf((totalLine - tmu) / tsig);
    markets.totals = { over: pOver, under: 1 - pOver };
    return markets;
  }

  /** Have `book` (re)quote `ev`. Books sometimes hang a line ½ point off the market → middles. */
  quote(ev, book, initial = false) {
    const st = (ev.bookState[book.id] ??= {
      bias: this.gauss() * (book.sharp ? 0.004 : 0.012),
      spreadShift: book.sharp ? 0 : this.pick([0, 0, 0, 0, -0.5, 0.5, -1, 1]),
      totalShift: book.sharp ? 0 : this.pick([0, 0, 0, 0, -0.5, 0.5]),
      offers: [],
    });
    if (SPORTS[ev.sport].fixedSpread) st.spreadShift = 0;
    const main = this.mainLines(ev);
    const spreadLine = main.spread + st.spreadShift;
    const totalLine = main.total + st.totalShift;
    const fair = this.fairMarkets(ev, spreadLine, totalLine);
    const t = new Date(this.now()).toISOString();
    const offers = [];
    const mispriced = !book.sharp && !initial && this.rand() < 0.03;
    for (const [market, probs] of Object.entries(fair)) {
      const outs = Object.keys(probs);
      const vig = book.vig * (outs.length === 3 ? 1.4 : 1) * (market === 'h2h' ? 1 : 1.05);
      const skewed = outs.map((o) => Math.max(0.01, probs[o] * Math.exp((o === 'home' || o === 'over' ? 1 : -1) * st.bias + this.gauss() * 0.006)));
      const s = skewed.reduce((a, b) => a + b, 0);
      const boostIdx = mispriced && market === this.pick(['h2h', 'spreads', 'totals']) ? Math.floor(this.rand() * outs.length) : -1;
      outs.forEach((o, i) => {
        let price = 1 / ((skewed[i] / s) * (1 + vig));
        if (i === boostIdx) price = 1 + (price - 1) * (1.03 + this.rand() * 0.05); // mispriced line
        const line = market === 'h2h' ? null : market === 'spreads' ? spreadLine : totalLine;
        offers.push({ book: book.id, market, line, outcome: o, price: roundPrice(price), updated: t });
      });
    }
    // carry previous prices for movement arrows + history
    const prevByKey = new Map(st.offers.map((o) => [`${o.market}:${o.line}:${o.outcome}`, o]));
    for (const o of offers) {
      const prev = prevByKey.get(`${o.market}:${o.line}:${o.outcome}`);
      if (prev && prev.price !== o.price) o.prev = prev.price;
      else if (prev) { o.prev = prev.prev; o.updated = prev.updated; }
      const hk = `${ev.id}|${o.book}|${o.market}|${o.line}|${o.outcome}`;
      const h = this.history.get(hk) ?? [];
      if (!h.length || h[h.length - 1][1] !== o.price) h.push([t, o.price]);
      if (h.length > 40) h.shift();
      this.history.set(hk, h);
    }
    st.offers = offers;
  }

  tick() {
    const nextEvents = [];
    for (const ev of this.events) {
      this.updateStatus(ev);
      if (ev.status === 'final') {
        for (const k of this.history.keys()) if (k.startsWith(`${ev.id}|`)) this.history.delete(k);
        nextEvents.push(this.newEvent(ev.sport, 99));
        continue;
      }
      const cfg = SPORTS[ev.sport];
      const live = ev.status === 'live';
      // information arrives: the sharp market moves first
      ev.mu += this.gauss() * cfg.sigma * (live ? 0.006 : 0.003);
      ev.tmu += this.gauss() * cfg.tSigma * (live ? 0.006 : 0.003);
      let scored = false;
      if (live && this.rand() < 0.08) {
        scored = true;
        const side = this.rand() < 1 / (1 + Math.exp(-ev.mu / cfg.sigma)) ? 'home' : 'away';
        ev.score[side] += ev.sport === 'americanfootball' ? this.pick([3, 7]) : ev.sport === 'basketball' ? this.pick([2, 3, 5, 7]) : 1;
      }
      for (const b of this.books) {
        // soft books lag the sharp market → stale lines; every book re-prices after a score
        const rate = scored ? 1 : b.sharp ? 0.9 : live ? 0.6 : 0.3;
        if (this.rand() < rate) this.quote(ev, b);
      }
      nextEvents.push(ev);
    }
    for (const ev of nextEvents) if (!Object.keys(ev.bookState).length) for (const b of this.books) this.quote(ev, b, true);
    this.events = nextEvents;
  }

  async fetch() {
    this.tick();
    return this.snapshot();
  }

  snapshot() {
    return this.events.map((ev) => ({
      id: ev.id, sport: ev.sport, league: ev.league, home: ev.home, away: ev.away,
      commence: ev.commence, status: ev.status, score: ev.score ? { ...ev.score } : null,
      offers: Object.values(ev.bookState).flatMap((s) => s.offers.map((o) => ({ ...o }))),
    }));
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

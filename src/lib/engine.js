// Opportunity engine: turns normalized odds into arbs, +EV bets, middles and low-hold markets.
//
// Normalized event shape (produced by every provider):
// {
//   id, sport, league, home, away, commence (ISO), status: 'upcoming'|'live'|'final',
//   score?: { home, away, clock },
//   offers: [{ book, market: 'h2h'|'spreads'|'totals', line: number|null, outcome, price, updated }]
// }
// outcome ∈ home|away|draw for h2h/spreads, over|under for totals.
// For spreads `line` is the HOME handicap (away handicap is −line).
import { devig, hold, round } from './odds.js';
import { arbStakes, expectedValue, kelly } from './calculators.js';

export const MARKET_OUTCOMES = {
  h2h2: ['home', 'away'],
  h2h3: ['home', 'draw', 'away'],
  spreads: ['home', 'away'],
  totals: ['over', 'under'],
};

const THREE_WAY = new Set(['soccer']);

export function outcomesFor(market, sport) {
  if (market === 'h2h') return THREE_WAY.has(sport) ? MARKET_OUTCOMES.h2h3 : MARKET_OUTCOMES.h2h2;
  return MARKET_OUTCOMES[market];
}

export function outcomeLabel(event, market, line, outcome) {
  const fmt = (x) => (x > 0 ? `+${x}` : `${x}`);
  if (market === 'h2h') return outcome === 'draw' ? 'Draw' : event[outcome];
  if (market === 'spreads') return `${event[outcome]} ${fmt(outcome === 'home' ? line : -line)}`;
  return `${outcome === 'over' ? 'Over' : 'Under'} ${line}`;
}

export function marketLabel(market, line) {
  if (market === 'h2h') return 'Moneyline';
  if (market === 'spreads') return `Spread ${line > 0 ? '+' : ''}${line}`;
  return `Total ${line}`;
}

/** Group an event's offers into markets (market + line), each with a price per book per outcome. */
export function groupMarkets(event) {
  const groups = new Map();
  for (const o of event.offers) {
    const key = `${o.market}:${o.line ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, market: o.market, line: o.line ?? null, outcomes: outcomesFor(o.market, event.sport), books: {} };
      groups.set(key, g);
    }
    (g.books[o.book] ??= {})[o.outcome] = { price: o.price, updated: o.updated, prev: o.prev };
  }
  for (const g of groups.values()) {
    g.best = {};
    for (const out of g.outcomes) {
      let best = null;
      for (const [book, prices] of Object.entries(g.books)) {
        const p = prices[out];
        if (p && (!best || p.price > best.price)) best = { book, price: p.price };
      }
      g.best[out] = best;
    }
    const complete = g.outcomes.every((o) => g.best[o]);
    g.bestHold = complete ? hold(g.outcomes.map((o) => g.best[o].price)) : null;
  }
  return [...groups.values()];
}

/** Allowlist test for bettable books. `books` null/empty = every book. */
const allowFn = (books) => {
  const set = books?.length ? new Set(books) : null;
  return (b) => !set || set.has(b);
};

/** Best price per outcome using only allowed books. */
function bestAllowed(group, allowed) {
  return Object.fromEntries(group.outcomes.map((o) => {
    let best = null;
    for (const [book, p] of Object.entries(group.books)) {
      if (!allowed(book) || !p[o]) continue;
      if (!best || p[o].price > best.price) best = { book, price: p[o].price, updated: p[o].updated };
    }
    return [o, best];
  }));
}

const isComplete = (prices, outcomes) => prices && outcomes.every((o) => prices[o]);

/** Fair probabilities for a market from the sharp books (averaged), falling back to consensus. */
export function fairProbabilities(group, sharpBooks, method = 'multiplicative', fallback = 'consensus') {
  const pick = (books) => books
    .map((b) => group.books[b])
    .filter((p) => isComplete(p, group.outcomes))
    .map((p) => devig(group.outcomes.map((o) => p[o].price), method));
  let sets = pick(sharpBooks);
  let source = 'sharp';
  if (!sets.length && fallback === 'consensus') {
    sets = pick(Object.keys(group.books));
    source = 'consensus';
    if (sets.length < 3) return null; // too thin to trust
  }
  if (!sets.length) return null;
  const avg = group.outcomes.map((_, i) => sets.reduce((s, p) => s + p[i], 0) / sets.length);
  return { probs: Object.fromEntries(group.outcomes.map((o, i) => [o, avg[i]])), source, books: sets.length };
}

const baseInfo = (event, group) => ({
  eventId: event.id, sport: event.sport, league: event.league,
  event: `${event.away} @ ${event.home}`, commence: event.commence, status: event.status,
  market: group.market, line: group.line, marketLabel: marketLabel(group.market, group.line),
});

/**
 * Arbitrage: if the best implied probabilities across your books sum to < 100%, staking every
 * side in proportion to 1/price returns the same payout whatever happens.
 * `books` = the books you can bet at (legs only come from these).
 */
export function findArbitrage(events, { minProfitPct = 0, totalStake = 100, books = null } = {}) {
  const out = [];
  const allowed = allowFn(books);
  for (const ev of events) {
    if (ev.status === 'final') continue;
    for (const g of groupMarkets(ev)) {
      const best = bestAllowed(g, allowed);
      const legs = g.outcomes.map((o) => best[o] && { outcome: o, ...best[o] });
      if (legs.some((l) => !l)) continue;
      const prices = legs.map((l) => l.price);
      const h = hold(prices);
      if (h >= 0) continue;
      const calc = arbStakes(prices, totalStake);
      if (calc.profitPct < minProfitPct) continue;
      out.push({
        id: `arb:${ev.id}:${g.key}:${legs.map((l) => `${l.book}@${l.price}`).join('|')}`,
        ...baseInfo(ev, g),
        profitPct: calc.profitPct,
        legs: legs.map((l, i) => ({
          ...l, label: outcomeLabel(ev, g.market, g.line, l.outcome),
          stake: calc.stakes[i], payout: calc.payouts[i],
        })),
        totalStake: calc.totalStake,
        guaranteedProfit: calc.guaranteedProfit,
      });
    }
  }
  return out.sort((a, b) => b.profitPct - a.profitPct);
}

export function findPositiveEV(events, {
  sharpBooks = ['pinnacle'], minEvPct = 1, method = 'multiplicative', fallback = 'consensus',
  bankroll = 1000, kellyFraction = 0.25, maxOdds = 10, books = null,
} = {}) {
  const out = [];
  const sharp = new Set(sharpBooks);
  const allowed = allowFn(books);
  for (const ev of events) {
    if (ev.status === 'final') continue;
    for (const g of groupMarkets(ev)) {
      const fair = fairProbabilities(g, sharpBooks, method, fallback);
      if (!fair) continue;
      for (const [book, prices] of Object.entries(g.books)) {
        if (sharp.has(book) || !allowed(book)) continue; // sharp books are the reference, never a bet
        for (const o of g.outcomes) {
          const p = prices[o];
          if (!p || p.price > maxOdds) continue;
          const prob = fair.probs[o];
          const evPct = expectedValue(p.price, prob) * 100;
          if (evPct < minEvPct) continue;
          const k = kelly(p.price, prob, bankroll, kellyFraction, 0.05);
          out.push({
            id: `ev:${ev.id}:${g.key}:${o}:${book}`,
            ...baseInfo(ev, g),
            outcome: o, label: outcomeLabel(ev, g.market, g.line, o),
            book, price: p.price, updated: p.updated, fairProb: round(prob, 4), fairPrice: round(1 / prob, 3),
            evPct: round(evPct, 2), fairSource: fair.source, sharpCount: fair.books,
            kellyPct: k.stakePct, kellyStake: k.stake,
          });
        }
      }
    }
  }
  return out.sort((a, b) => b.evPct - a.evPct);
}

// Standard deviation of final margin / total by sport, for middle-hit estimates.
const SIGMA = {
  americanfootball: { spreads: 13.5, totals: 10 },
  basketball: { spreads: 12, totals: 18 },
  icehockey: { spreads: 2.4, totals: 2.2 },
  baseball: { spreads: 4.2, totals: 4.4 },
  soccer: { spreads: 1.7, totals: 1.7 },
};
function normCdf(x) {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
/**
 * Middle between leg A ("result > lo", e.g. Over lo / Home +x) and leg B ("result < hi", Under hi / Away −y).
 * Final scores are integers, so we sum over each whole-number result in [lo, hi]:
 *   strictly inside → both legs win;  result == lo → A pushes, B wins;  result == hi → A wins, B pushes.
 * The result is modelled as N(centre, σ) discretised to integers. `centre` should come from the market
 * (see marketCentre); it defaults to the midpoint of the two lines.
 */
export function evaluateMiddle(sport, market, lo, hi, priceA, priceB, totalStake = 100, centre = (lo + hi) / 2) {
  const sigma = SIGMA[sport]?.[market] ?? 10;
  const c = centre;
  const sA = (totalStake * priceB) / (priceA + priceB), sB = totalStake - sA;
  const miss = sA * priceA - totalStake;
  let ev = miss, hitProb = 0, pushProb = 0, best = miss;
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
    const pk = normCdf((k + 0.5 - c) / sigma) - normCdf((k - 0.5 - c) / sigma);
    let profit;
    if (k > lo && k < hi) { profit = sA * priceA + sB * priceB - totalStake; hitProb += pk; }
    else if (k === lo) { profit = sA + sB * priceB - totalStake; pushProb += pk; }
    else { profit = sA * priceA + sB - totalStake; pushProb += pk; }
    ev += pk * (profit - miss);
    best = Math.max(best, profit);
  }
  return { stakeA: round(sA), stakeB: round(sB), profitIfMiss: round(miss), profitIfHit: round(best), hitProb, pushProb, expectedProfit: ev };
}

function normInv(p) {
  let lo = -8, hi = 8;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (normCdf(m) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * Where the market expects the result (final margin for spreads, combined score for totals), from the
 * no-vig price of the most widely quoted line: P(result > L) = p  ⇒  centre = L − σ·Φ⁻¹(1 − p).
 */
export function marketCentre(event, groups, market, sharpBooks = [], method = 'multiplicative') {
  const sigma = SIGMA[event.sport]?.[market] ?? 10;
  const main = groups.filter((g) => g.market === market).sort((a, b) => Object.keys(b.books).length - Object.keys(a.books).length)[0];
  if (!main) return null;
  let probs = fairProbabilities(main, sharpBooks, method, 'consensus')?.probs;
  if (!probs) { // thin market: de-vig the best available prices
    if (main.outcomes.some((o) => !main.best[o])) return null;
    const d = devig(main.outcomes.map((o) => main.best[o].price), method);
    probs = Object.fromEntries(main.outcomes.map((o, i) => [o, d[i]]));
  }
  const [L, p] = market === 'totals' ? [main.line, probs.over] : [-main.line, probs.home];
  return L - sigma * normInv(1 - Math.min(0.999, Math.max(0.001, p)));
}

/** Probability that an integer result lands strictly inside (lo, hi). */
export function middleHitProb(sport, market, lo, hi) {
  return evaluateMiddle(sport, market, lo, hi, 2, 2).hitProb;
}

export function findMiddles(events, { minWidth = 0.5, totalStake = 100, minEvPct = -2, books = null, sharpBooks = [], method = 'multiplicative' } = {}) {
  const out = [];
  const allowed = allowFn(books);
  for (const ev of events) {
    if (ev.status === 'final') continue;
    const groups = groupMarkets(ev);
    for (const market of ['totals', 'spreads']) {
      const centre = marketCentre(ev, groups, market, sharpBooks, method);
      if (centre == null) continue;
      const gs = groups.filter((g) => g.market === market).map((g) => ({ ...g, best: bestAllowed(g, allowed) }));
      for (const ga of gs) for (const gb of gs) {
        // totals: Over ga.line + Under gb.line with gb.line > ga.line
        // spreads: Home +ga.line + Away −gb.line with ga.line > gb.line
        const width = market === 'totals' ? gb.line - ga.line : ga.line - gb.line;
        if (width < minWidth) continue;
        const [oa, ob] = market === 'totals' ? ['over', 'under'] : ['home', 'away'];
        const a = ga.best[oa], b = gb.best[ob];
        if (!a || !b || a.book === b.book) continue;
        // map both markets onto "result > lo" (leg A) and "result < hi" (leg B)
        const [lo, hi] = market === 'totals' ? [ga.line, gb.line] : [-ga.line, -gb.line];
        const m = evaluateMiddle(ev.sport, market, lo, hi, a.price, b.price, totalStake, centre);
        if (m.hitProb === 0 && m.pushProb === 0) continue; // no whole-number result in between
        const evPct = (m.expectedProfit / totalStake) * 100;
        if (evPct < minEvPct) continue;
        out.push({
          id: `mid:${ev.id}:${ga.key}:${gb.key}:${a.book}:${b.book}`,
          eventId: ev.id, sport: ev.sport, league: ev.league, event: `${ev.away} @ ${ev.home}`,
          commence: ev.commence, status: ev.status, market, width,
          marketLabel: market === 'totals' ? `Totals ${ga.line}–${gb.line}` : `Spread middle ${width} pts`,
          legs: [
            { book: a.book, price: a.price, label: outcomeLabel(ev, market, ga.line, oa), stake: m.stakeA },
            { book: b.book, price: b.price, label: outcomeLabel(ev, market, gb.line, ob), stake: m.stakeB },
          ],
          profitIfMiss: m.profitIfMiss, profitIfHit: m.profitIfHit,
          hitProb: round(m.hitProb * 100, 2), pushProb: round(m.pushProb * 100, 2), evPct: round(evPct, 2),
        });
      }
    }
  }
  return out.sort((a, b) => b.evPct - a.evPct);
}

export function findLowHolds(events, { maxHoldPct = 2, limit = 200, books = null } = {}) {
  const out = [];
  const allowed = allowFn(books);
  for (const ev of events) {
    if (ev.status === 'final') continue;
    for (const g of groupMarkets(ev)) {
      const best = bestAllowed(g, allowed);
      if (g.outcomes.some((o) => !best[o])) continue;
      const h = hold(g.outcomes.map((o) => best[o].price));
      if (h * 100 > maxHoldPct) continue;
      out.push({
        id: `hold:${ev.id}:${g.key}`,
        ...baseInfo(ev, g),
        holdPct: round(h * 100, 3),
        legs: g.outcomes.map((o) => ({ outcome: o, label: outcomeLabel(ev, g.market, g.line, o), ...best[o] })),
      });
    }
  }
  return out.sort((a, b) => a.holdPct - b.holdPct).slice(0, limit);
}

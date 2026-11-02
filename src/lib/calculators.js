// Betting calculators: arbitrage, +EV, Kelly, middles, promo conversion, hedging.
// All prices are decimal odds. Shared by server and browser.
import { hold, round } from './odds.js';

/**
 * Split a total stake across outcomes so every outcome returns the same payout.
 * `roundTo` rounds each stake (e.g. 1 or 5) to look less "arby" to books.
 */
export function arbStakes(prices, totalStake = 100, roundTo = 0) {
  const inv = prices.map((d) => 1 / d);
  const sum = inv.reduce((a, b) => a + b, 0);
  let stakes = inv.map((x) => (totalStake * x) / sum);
  if (roundTo > 0) stakes = stakes.map((s) => Math.max(roundTo, Math.round(s / roundTo) * roundTo));
  const staked = stakes.reduce((a, b) => a + b, 0);
  const payouts = stakes.map((s, i) => s * prices[i]);
  const minPayout = Math.min(...payouts);
  return {
    stakes: stakes.map((s) => round(s)),
    payouts: payouts.map((p) => round(p)),
    totalStake: round(staked),
    guaranteedProfit: round(minPayout - staked),
    profitPct: round(((minPayout - staked) / staked) * 100, 3),
    hold: round(hold(prices) * 100, 3),
    isArb: sum < 1,
  };
}

/** Expected value of a 1-unit bet at `price` when the true probability is `fairProb`. */
export function expectedValue(price, fairProb) {
  return fairProb * price - 1;
}

/** Kelly stake. `fraction` = 0.25 for quarter-Kelly. Returns 0 when there is no edge. */
export function kelly(price, fairProb, bankroll = 1, fraction = 1, maxPct = 1) {
  const b = price - 1;
  const f = (fairProb * price - 1) / b;
  const pct = Math.max(0, Math.min(f * fraction, maxPct));
  return { fullKellyPct: round(Math.max(0, f) * 100, 3), stakePct: round(pct * 100, 3), stake: round(pct * bankroll) };
}

export function fairOdds(prob) {
  return 1 / prob;
}

/** Hedge an existing bet (stake @ price) with an opposing bet so profit is locked either way. */
export function hedge(stake, price, hedgePrice) {
  const payout = stake * price;
  const hedgeStake = payout / hedgePrice;
  const total = stake + hedgeStake;
  return {
    hedgeStake: round(hedgeStake),
    profitIfOriginalWins: round(payout - total),
    profitIfHedgeWins: round(hedgeStake * hedgePrice - total),
  };
}

/**
 * Middle on totals (Over lowLine / Under highLine) or spreads (Fav −x / Dog +y).
 * Stakes are balanced so the "miss" outcomes return the same; a hit wins both.
 * `middleProb` is your estimate that the result lands in the middle.
 */
export function middle(priceA, priceB, totalStake = 100, middleProb = 0) {
  const sA = (totalStake * priceB) / (priceA + priceB);
  const sB = totalStake - sA;
  const miss = sA * priceA - totalStake; // equal to sB*priceB - totalStake
  const hit = sA * priceA + sB * priceB - totalStake;
  const ev = middleProb * hit + (1 - middleProb) * miss;
  return {
    stakeA: round(sA), stakeB: round(sB),
    profitIfMiss: round(miss), profitIfHit: round(hit),
    expectedProfit: round(ev),
    breakEvenMiddleProb: hit === miss ? null : round((-miss / (hit - miss)) * 100, 2),
  };
}

/**
 * Promo conversion. Types:
 *   bonus    — bonus/free bet, stake not returned on a win (SNR)
 *   boost    — profit boost of `boostPct` on winnings, cash stake
 *   nosweat  — cash bet refunded as a bonus bet on a loss; `refundRate` = what you expect to convert it at
 *   cash     — plain cash bet hedged (for comparison / qualifying bets)
 * `price` is the promo-side price, `hedgePrice` the opposing price at another book.
 */
export function promoConversion({ type = 'bonus', amount = 100, price, hedgePrice, boostPct = 0, refundRate = 0.7 }) {
  let hedgeStake, profitA, profitB, effective = price;
  if (type === 'bonus') {
    hedgeStake = (amount * (price - 1)) / hedgePrice;
    profitA = amount * (price - 1) - hedgeStake;
    profitB = hedgeStake * (hedgePrice - 1);
  } else if (type === 'boost') {
    effective = 1 + (price - 1) * (1 + boostPct / 100);
    hedgeStake = (amount * effective) / hedgePrice;
    profitA = amount * effective - amount - hedgeStake;
    profitB = hedgeStake * hedgePrice - hedgeStake - amount;
  } else if (type === 'nosweat') {
    hedgeStake = (amount * (price - refundRate)) / hedgePrice;
    profitA = amount * (price - 1) - hedgeStake;
    profitB = hedgeStake * (hedgePrice - 1) - amount + refundRate * amount;
  } else {
    hedgeStake = (amount * price) / hedgePrice;
    profitA = amount * price - amount - hedgeStake;
    profitB = hedgeStake * hedgePrice - hedgeStake - amount;
  }
  const locked = Math.min(profitA, profitB);
  return {
    hedgeStake: round(hedgeStake),
    effectivePrice: round(effective, 4),
    profitIfPromoWins: round(profitA),
    profitIfHedgeWins: round(profitB),
    lockedProfit: round(locked),
    conversionPct: round((locked / amount) * 100, 2),
  };
}

/** Kelly for an arb-free +EV bet list, scaled so total exposure never exceeds `maxExposurePct`. */
export function scaleKellyPortfolio(stakes, bankroll, maxExposurePct = 0.25) {
  const total = stakes.reduce((a, b) => a + b, 0);
  const cap = bankroll * maxExposurePct;
  if (total <= cap || total === 0) return stakes;
  return stakes.map((s) => round((s * cap) / total));
}

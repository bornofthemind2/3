import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbStakes, kelly, expectedValue, hedge, middle, promoConversion } from '../src/lib/calculators.js';

test('arbStakes equalises payouts and reports profit', () => {
  const r = arbStakes([2.1, 2.05], 1000);
  assert.ok(r.isArb);
  assert.ok(Math.abs(r.payouts[0] - r.payouts[1]) < 0.02);
  assert.equal(r.totalStake, 1000);
  assert.ok(r.guaranteedProfit > 36 && r.guaranteedProfit < 38);
});

test('arbStakes flags non-arbs', () => {
  const r = arbStakes([1.91, 1.91], 100);
  assert.equal(r.isArb, false);
  assert.ok(r.guaranteedProfit < 0);
});

test('kelly and EV', () => {
  assert.ok(Math.abs(expectedValue(2.2, 0.5) - 0.1) < 1e-9);
  const k = kelly(2.2, 0.5, 1000, 1);
  assert.ok(Math.abs(k.fullKellyPct - (0.1 / 1.2) * 100) < 1e-2);
  assert.equal(kelly(1.8, 0.5, 1000).stake, 0, 'no edge → no stake');
  assert.equal(kelly(2.2, 0.5, 1000, 0.25).stake, Math.round(1000 * (0.1 / 1.2) * 0.25 * 100) / 100);
});

test('hedge locks equal profit', () => {
  const r = hedge(50, 9, 1.5);
  assert.ok(Math.abs(r.profitIfOriginalWins - r.profitIfHedgeWins) < 0.02);
  assert.equal(r.hedgeStake, 300);
});

test('middle: misses equal, hit wins both', () => {
  const r = middle(1.91, 1.91, 200, 0.1);
  assert.equal(r.stakeA, 100);
  assert.ok(r.profitIfMiss < 0 && r.profitIfHit > 150);
  assert.ok(r.breakEvenMiddleProb > 0 && r.breakEvenMiddleProb < 5);
});

test('promo conversions equalise both outcomes', () => {
  for (const type of ['bonus', 'boost', 'nosweat', 'cash']) {
    const r = promoConversion({ type, amount: 100, price: 5, hedgePrice: 1.22, boostPct: 50, refundRate: 0.7 });
    assert.ok(Math.abs(r.profitIfPromoWins - r.profitIfHedgeWins) < 0.02, type);
  }
  const bonus = promoConversion({ type: 'bonus', amount: 100, price: 5, hedgePrice: 1.22 });
  assert.ok(bonus.conversionPct > 70 && bonus.conversionPct < 80); // typical +400 / -450 conversion
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { americanToDecimal, decimalToAmerican, parseOdds, devig, hold, formatOdds } from '../src/lib/odds.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('american <-> decimal', () => {
  close(americanToDecimal(150), 2.5);
  close(americanToDecimal(-110), 1.909090909);
  assert.equal(decimalToAmerican(2.5), 150);
  assert.equal(decimalToAmerican(1.5), -200);
  assert.equal(formatOdds(2.5), '+150');
  assert.throws(() => americanToDecimal(50), RangeError);
});

test('parseOdds handles american, decimal and fractional', () => {
  close(parseOdds('+150'), 2.5);
  close(parseOdds('-200'), 1.5);
  close(parseOdds('2.25'), 2.25);
  close(parseOdds('5/2'), 3.5);
});

test('hold of a -110/-110 market is ~4.76%', () => {
  close(hold([1.909090909, 1.909090909]), 0.047619, 1e-5);
});

test('every devig method returns probabilities that sum to 1', () => {
  const prices = [1.5, 2.9];
  for (const m of ['multiplicative', 'additive', 'power', 'shin']) {
    const p = devig(prices, m);
    close(p.reduce((a, b) => a + b, 0), 1, 1e-4);
    assert.ok(p[0] > p[1], `${m} keeps favourite ahead`);
  }
  // symmetric market → 50/50
  devig([1.91, 1.91]).forEach((p) => close(p, 0.5));
});

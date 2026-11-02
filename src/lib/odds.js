// Odds conversion and vig-removal primitives.
// Shared by the server (Node) and the browser UI — keep it dependency-free.

export function americanToDecimal(american) {
  const a = Number(american);
  if (!Number.isFinite(a) || a === 0 || (a > -100 && a < 100)) {
    throw new RangeError(`Invalid American odds: ${american}`);
  }
  return a > 0 ? 1 + a / 100 : 1 + 100 / -a;
}

export function decimalToAmerican(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 1) throw new RangeError(`Invalid decimal odds: ${decimal}`);
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

export function fractionalToDecimal(num, den) {
  return 1 + Number(num) / Number(den);
}

/** Parse "+150", "-110", "2.5", "5/2" into decimal odds. */
export function parseOdds(input) {
  const s = String(input).trim();
  if (/^\d+\s*\/\s*\d+$/.test(s)) {
    const [n, d] = s.split('/').map(Number);
    return fractionalToDecimal(n, d);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) throw new RangeError(`Unparseable odds: ${input}`);
  if (s.startsWith('+') || s.startsWith('-') || Math.abs(n) >= 100) return americanToDecimal(n);
  if (n > 1) return n;
  throw new RangeError(`Unparseable odds: ${input}`);
}

export function formatOdds(decimal, format = 'american') {
  if (decimal == null || !Number.isFinite(decimal)) return '—';
  if (format === 'decimal') return decimal.toFixed(2);
  if (format === 'implied') return `${(100 / decimal).toFixed(1)}%`;
  const a = decimalToAmerican(decimal);
  return a > 0 ? `+${a}` : String(a);
}

export const impliedProb = (decimal) => 1 / decimal;

/** Sum of implied probabilities − 1. Negative hold means an arbitrage exists. */
export function hold(decimals) {
  return decimals.reduce((s, d) => s + 1 / d, 0) - 1;
}

/**
 * Remove the bookmaker margin from a full set of mutually-exclusive outcomes.
 * Returns fair probabilities that sum to 1.
 *   multiplicative — proportional normalisation (default, industry standard)
 *   additive       — subtract equal share of the overround from each outcome
 *   power          — find k such that Σ p_i^k = 1 (handles favourite/longshot bias)
 *   shin           — Shin (1993) insider-trading model
 */
export function devig(decimals, method = 'multiplicative') {
  const raw = decimals.map((d) => 1 / d);
  const total = raw.reduce((a, b) => a + b, 0);
  const n = raw.length;
  switch (method) {
    case 'additive': {
      const share = (total - 1) / n;
      const p = raw.map((x) => Math.max(x - share, 1e-9));
      const s = p.reduce((a, b) => a + b, 0);
      return p.map((x) => x / s);
    }
    case 'power': {
      let lo = 0.5, hi = 3;
      for (let i = 0; i < 100; i++) {
        const k = (lo + hi) / 2;
        const s = raw.reduce((a, x) => a + x ** k, 0);
        if (s > 1) lo = k; else hi = k;
      }
      const k = (lo + hi) / 2;
      return raw.map((x) => x ** k);
    }
    case 'shin': {
      if (total <= 1) return raw.map((x) => x / total);
      let lo = 0, hi = 0.5;
      const probs = (z) => raw.map((x) =>
        (Math.sqrt(z * z + 4 * (1 - z) * (x * x) / total) - z) / (2 * (1 - z)));
      for (let i = 0; i < 100; i++) {
        const z = (lo + hi) / 2;
        const s = probs(z).reduce((a, b) => a + b, 0);
        if (s > 1) lo = z; else hi = z;
      }
      return probs((lo + hi) / 2);
    }
    default:
      return raw.map((x) => x / total);
  }
}

export const round = (x, dp = 2) => Math.round(x * 10 ** dp) / 10 ** dp;

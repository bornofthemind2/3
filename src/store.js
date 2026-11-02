// JSON-file persistence for settings and the bankroll/wallet ledger.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SHARP_BOOKS } from './providers/books.js';

export const DEFAULT_SETTINGS = {
  scanIntervalSec: 5,
  totalStake: 100,
  minArbPct: 0.25,
  minEvPct: 1.5,
  minMiddleEvPct: -1,
  maxHoldPct: 2,
  sharpBooks: SHARP_BOOKS,
  devigMethod: 'multiplicative',
  kellyFraction: 0.25,
  excludeBooks: [],
  oddsFormat: 'american',
  alerts: { enabled: true, webhookUrl: '', minArbPct: 1, minEvPct: 3 },
};

const emptyState = () => ({ settings: structuredClone(DEFAULT_SETTINGS), wallet: { balances: {}, transactions: [], bets: [] } });

export class Store {
  constructor(file) {
    this.file = file;
    this.state = emptyState();
    if (file) {
      try {
        const loaded = JSON.parse(readFileSync(file, 'utf8'));
        this.state = {
          settings: { ...DEFAULT_SETTINGS, ...loaded.settings, alerts: { ...DEFAULT_SETTINGS.alerts, ...loaded.settings?.alerts } },
          wallet: { ...emptyState().wallet, ...loaded.wallet },
        };
      } catch (e) {
        if (e.code !== 'ENOENT') console.warn(`[store] could not read ${file}: ${e.message}`);
      }
    }
  }

  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
  }

  get settings() { return this.state.settings; }

  updateSettings(patch) {
    const allowed = Object.keys(DEFAULT_SETTINGS);
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (!allowed.includes(k)) continue;
      this.state.settings[k] = k === 'alerts' ? { ...this.state.settings.alerts, ...v } : v;
    }
    this.state.settings.scanIntervalSec = Math.max(1, Number(this.state.settings.scanIntervalSec) || 5);
    this.save();
    return this.settings;
  }

  // ---------- wallet ----------
  get wallet() { return this.state.wallet; }

  walletSummary() {
    const w = this.wallet;
    const pending = w.bets.filter((b) => b.status === 'pending');
    const settled = w.bets.filter((b) => b.status !== 'pending');
    const exposureByBook = {};
    for (const b of pending) exposureByBook[b.book] = (exposureByBook[b.book] ?? 0) + b.stake;
    const deposits = w.transactions.filter((t) => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
    const withdrawals = w.transactions.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0);
    const balance = Object.values(w.balances).reduce((a, b) => a + b, 0);
    const exposure = pending.reduce((s, b) => s + b.stake, 0);
    const profit = settled.reduce((s, b) => s + (b.profit ?? 0), 0);
    const staked = settled.reduce((s, b) => s + b.stake, 0);
    return {
      balances: w.balances, exposureByBook,
      totals: {
        balance: r2(balance), exposure: r2(exposure), bankroll: r2(balance + exposure),
        deposits: r2(deposits), withdrawals: r2(withdrawals), profit: r2(profit),
        roiPct: staked ? r2((profit / staked) * 100) : 0, pendingBets: pending.length, settledBets: settled.length,
      },
      transactions: w.transactions.slice(-200).reverse(),
      bets: w.bets.slice(-300).reverse(),
    };
  }

  addTransaction({ book, type, amount, note = '' }) {
    amount = Number(amount);
    if (!book || !['deposit', 'withdrawal', 'adjustment'].includes(type) || !Number.isFinite(amount)) {
      throw new HttpError(400, 'book, type (deposit|withdrawal|adjustment) and numeric amount are required');
    }
    const delta = type === 'withdrawal' ? -Math.abs(amount) : type === 'deposit' ? Math.abs(amount) : amount;
    this.wallet.balances[book] = r2((this.wallet.balances[book] ?? 0) + delta);
    const tx = { id: randomUUID(), at: new Date().toISOString(), book, type, amount: Math.abs(amount), delta, note };
    this.wallet.transactions.push(tx);
    this.save();
    return tx;
  }

  setBalance(book, balance) {
    const cur = this.wallet.balances[book] ?? 0;
    return this.addTransaction({ book, type: 'adjustment', amount: Number(balance) - cur, note: 'balance set' });
  }

  /** Log one or more bets (an arb is a group of legs sharing a groupId). Stakes are debited immediately. */
  placeBets(legs, { kind = 'manual', groupId = randomUUID(), event = '', market = '' } = {}) {
    const created = [];
    for (const leg of legs) {
      const stake = Number(leg.stake), price = Number(leg.price);
      if (!leg.book || !(stake > 0) || !(price > 1)) throw new HttpError(400, 'each leg needs book, stake > 0 and decimal price > 1');
      const bet = {
        id: randomUUID(), groupId, kind, placedAt: new Date().toISOString(),
        book: leg.book, event: leg.event ?? event, market: leg.market ?? market, selection: leg.label ?? leg.selection ?? '',
        price, stake: r2(stake), status: 'pending', profit: null,
      };
      this.wallet.balances[bet.book] = r2((this.wallet.balances[bet.book] ?? 0) - bet.stake);
      this.wallet.bets.push(bet);
      created.push(bet);
    }
    this.save();
    return created;
  }

  settleBet(id, result) {
    const bet = this.wallet.bets.find((b) => b.id === id);
    if (!bet) throw new HttpError(404, 'bet not found');
    if (!['won', 'lost', 'push', 'void', 'pending'].includes(result)) throw new HttpError(400, 'result must be won|lost|push|void|pending');
    // reverse any previous settlement credit
    if (bet.status !== 'pending') this.wallet.balances[bet.book] = r2((this.wallet.balances[bet.book] ?? 0) - (bet.returned ?? 0));
    const returned = result === 'won' ? bet.stake * bet.price : result === 'push' || result === 'void' ? bet.stake : 0;
    bet.status = result;
    bet.returned = result === 'pending' ? 0 : r2(returned);
    bet.profit = result === 'pending' ? null : r2(returned - bet.stake);
    bet.settledAt = result === 'pending' ? null : new Date().toISOString();
    this.wallet.balances[bet.book] = r2((this.wallet.balances[bet.book] ?? 0) + bet.returned);
    this.save();
    return bet;
  }

  deleteBet(id) {
    const i = this.wallet.bets.findIndex((b) => b.id === id);
    if (i < 0) throw new HttpError(404, 'bet not found');
    const [bet] = this.wallet.bets.splice(i, 1);
    // refund stake and remove any settlement credit
    this.wallet.balances[bet.book] = r2((this.wallet.balances[bet.book] ?? 0) + bet.stake - (bet.returned ?? 0));
    this.save();
    return bet;
  }

  /** Check whether balances cover each leg; suggest the largest scaled stake that fits. */
  checkFunding(legs) {
    let scale = 1;
    const rows = legs.map((l) => {
      const bal = this.wallet.balances[l.book] ?? 0;
      if (l.stake > 0) scale = Math.min(scale, Math.max(0, bal) / l.stake);
      return { book: l.book, stake: l.stake, balance: bal, shortfall: r2(Math.max(0, l.stake - bal)) };
    });
    return { funded: rows.every((r) => r.shortfall === 0), maxScale: r2(scale), legs: rows };
  }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const r2 = (x) => Math.round(x * 100) / 100;

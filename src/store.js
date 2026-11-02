// JSON-file persistence for settings and the bankroll/wallet ledger.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SHARP_BOOKS, DEFAULT_MY_BOOKS, BOOKS } from './providers/books.js';

export const DEFAULT_SETTINGS = {
  scanIntervalSec: 5, // demo feed
  liveIntervalSec: 300, // live odds API: every scan costs credits (0 = only when you press "Scan now")
  staleAfterMin: 30, // ignore pre-game prices not updated for this long (0 = off)
  staleLiveSec: 120, // ignore in-play prices older than this (0 = off)
  totalStake: 100,
  minArbPct: 0.25,
  minEvPct: 1.5,
  minMiddleEvPct: 0.5,
  maxHoldPct: 2,
  // Pinnacle alone keeps your 9 books + 1 sharp at 10 bookmakers = 1 credit "region" per market.
  sharpBooks: SHARP_BOOKS.includes('pinnacle') ? ['pinnacle'] : SHARP_BOOKS,
  devigMethod: 'multiplicative',
  kellyFraction: 0.25,
  myBooks: DEFAULT_MY_BOOKS, // books you have accounts at — the only books you'll be told to bet
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
    const live = Number(this.state.settings.liveIntervalSec);
    this.state.settings.liveIntervalSec = live > 0 ? Math.max(30, live) : 0;
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

  /**
   * Import deposits/withdrawals from a CSV statement you exported yourself (no account scraping).
   * Header names are matched loosely: date|time, book|sportsbook, type|description, amount, note.
   * If there is no book column, pass `book`. If there is no type, the sign of the amount decides.
   * Rows already imported (same date, book, type, amount) are skipped, so re-importing is safe.
   */
  importCsv(csv, { book: defaultBook } = {}) {
    const rows = parseCsv(String(csv ?? ''));
    if (rows.length < 2) throw new HttpError(400, 'CSV needs a header row and at least one data row');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
    const ci = { date: col('date', 'time'), book: col('book', 'sportsbook', 'operator'), type: col('type', 'description', 'transaction'), amount: col('amount', 'value'), note: col('note', 'memo', 'reference') };
    if (ci.amount < 0) throw new HttpError(400, 'CSV must have an "amount" column');
    const seen = new Set(this.wallet.transactions.map((t) => t.importKey).filter(Boolean));
    const result = { imported: 0, skipped: 0, errors: [] };
    rows.slice(1).forEach((r, i) => {
      if (r.every((c) => !c.trim())) return;
      const line = i + 2;
      const book = resolveBook(ci.book >= 0 ? r[ci.book] : defaultBook);
      const raw = Number(String(r[ci.amount] ?? '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
      if (!book) return result.errors.push(`line ${line}: unknown or missing book`);
      if (!Number.isFinite(raw) || raw === 0) return result.errors.push(`line ${line}: bad amount`);
      const t = (ci.type >= 0 ? r[ci.type] : '').toLowerCase();
      const type = /withdraw|cash ?out|payout/.test(t) ? 'withdrawal' : /deposit/.test(t) ? 'deposit' : /adjust|balance/.test(t) ? 'adjustment' : raw < 0 ? 'withdrawal' : 'deposit';
      const date = ci.date >= 0 ? r[ci.date].trim() : '';
      const importKey = `${date}|${book}|${type}|${Math.abs(raw)}`;
      if (seen.has(importKey)) { result.skipped++; return; }
      seen.add(importKey);
      const tx = this.addTransaction({ book, type, amount: type === 'adjustment' ? raw : Math.abs(raw), note: (ci.note >= 0 ? r[ci.note] : '') || `CSV import ${date}`.trim() }, false);
      tx.importKey = importKey;
      if (date && !Number.isNaN(Date.parse(date))) tx.at = new Date(date).toISOString();
      result.imported++;
    });
    this.save();
    return result;
  }

  addTransaction({ book, type, amount, note = '' }, persist = true) {
    amount = Number(amount);
    if (!book || !['deposit', 'withdrawal', 'adjustment'].includes(type) || !Number.isFinite(amount)) {
      throw new HttpError(400, 'book, type (deposit|withdrawal|adjustment) and numeric amount are required');
    }
    const delta = type === 'withdrawal' ? -Math.abs(amount) : type === 'deposit' ? Math.abs(amount) : amount;
    this.wallet.balances[book] = r2((this.wallet.balances[book] ?? 0) + delta);
    const tx = { id: randomUUID(), at: new Date().toISOString(), book, type, amount: Math.abs(amount), delta, note };
    this.wallet.transactions.push(tx);
    if (persist) this.save();
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

function resolveBook(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit = BOOKS.find((b) => b.id === s || norm(b.name) === norm(s) || b.oddsApiKey === s);
  return hit?.id ?? (/^[a-z0-9_]+$/.test(s) ? s : null);
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

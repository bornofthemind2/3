import { formatOdds, parseOdds, devig, hold, decimalToAmerican } from '/lib/odds.js';
import { arbStakes, kelly, expectedValue, hedge, middle, promoConversion } from '/lib/calculators.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (x) => (x < 0 ? '-$' : '$') + Math.abs(Number(x) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x, dp = 2) => { const v = Number(x); return `${(Math.abs(v) < 0.5 / 10 ** dp ? 0 : v).toFixed(dp)}%`; };

const state = {
  tab: localGet('tab') || 'arbs',
  books: {}, settings: null, status: null,
  oddsMarket: 'h2h', oddsStatus: '', allLines: false,
  lastPrices: new Map(),
};

function localGet(k) { try { return localStorage.getItem(`ef:${k}`); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(`ef:${k}`, v); } catch { /* ignore */ } }

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const fmt = () => $('#f-format').value;
const odds = (d) => formatOdds(d, fmt());
const bookName = (id) => state.books[id]?.name ?? id;
const since = (iso) => ago(Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)));
const ago = (sec) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}h`);
const when = (iso, status) => status === 'live' ? '<span class="tag live">LIVE</span>'
  : `<span class="tag">${new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>`;
const filters = () => {
  const p = new URLSearchParams();
  for (const [k, id] of [['sport', '#f-sport'], ['book', '#f-book'], ['q', '#f-q']]) if ($(id).value) p.set(k, $(id).value);
  return p;
};

// ---------------------------------------------------------------- toasts / notifications
function toast(html, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = html;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 7000);
}

// ---------------------------------------------------------------- views
const views = {
  async arbs() {
    const list = await api(`/api/arbs?${filters()}`);
    if (!list.length) return empty('No arbitrage right now. The scanner re-checks every few seconds — lower “Min arb %” in Settings to see thinner edges.');
    return `<div class="cards">${list.map((a) => `
      <div class="card">
        <div class="card-head">
          <div><h3>${esc(a.event)}</h3><div class="sub">${when(a.commence, a.status)}<span class="tag">${esc(a.league)}</span>${esc(a.marketLabel)}</div></div>
          <div class="big">${pct(a.profitPct)}</div>
        </div>
        <table class="legs">${a.legs.map((l) => `
          <tr><td>${esc(l.label)}</td><td class="book">${esc(bookName(l.book))}${l.updated ? ` <span class="sub" title="price last updated">${since(l.updated)}</span>` : ''}</td><td class="num">${odds(l.price)}</td><td class="num">${money(l.stake)}</td></tr>`).join('')}
        </table>
        <div class="card-foot">
          <span>Profit <b class="pos">${money(a.guaranteedProfit)}</b> on ${money(a.totalStake)} · seen ${ago(a.ageSec)}</span>
          <button class="small" data-log='${esc(JSON.stringify({ kind: 'arb', event: a.event, market: a.marketLabel, legs: a.legs.map(({ book, price, label, stake }) => ({ book, price, label, stake })) }))}'>Log bets</button>
        </div>
      </div>`).join('')}</div>`;
  },

  async ev() {
    const list = await api(`/api/ev?${filters()}`);
    if (!list.length) return empty('No +EV bets above your threshold right now.');
    return `<div class="table-wrap"><table class="grid">
      <tr><th>EV</th><th class="left">Event</th><th class="left">Market</th><th class="left">Bet</th><th>Book</th><th>Odds</th><th>Fair</th><th>Win %</th><th>Kelly</th><th>Age</th><th></th></tr>
      ${list.map((x) => `<tr>
        <td class="num"><b style="color:var(--blue)">${pct(x.evPct)}</b></td>
        <td class="left">${when(x.commence, x.status)}${esc(x.event)}</td>
        <td class="left">${esc(x.marketLabel)}</td>
        <td class="left"><b>${esc(x.label)}</b></td>
        <td class="book">${esc(bookName(x.book))}</td>
        <td class="price">${odds(x.price)}</td>
        <td class="price" title="Fair value from ${x.fairSource === 'sharp' ? `${x.sharpCount} sharp book(s)` : 'market consensus'}">${odds(x.fairPrice)}</td>
        <td class="num">${pct(x.fairProb * 100, 1)}</td>
        <td class="num" title="${x.kellyPct}% of bankroll">${money(x.kellyStake)}</td>
        <td class="num">${ago(x.ageSec)}</td>
        <td><button class="small" data-log='${esc(JSON.stringify({ kind: 'ev', event: x.event, market: x.marketLabel, legs: [{ book: x.book, price: x.price, label: x.label, stake: x.kellyStake || 10 }] }))}'>Log</button></td>
      </tr>`).join('')}</table></div>`;
  },

  async middles() {
    const list = await api(`/api/middles?${filters()}`);
    if (!list.length) return empty('No middles found. Middles appear when books hang different lines on the same total or spread.');
    return `<div class="cards">${list.map((m) => `
      <div class="card">
        <div class="card-head">
          <div><h3>${esc(m.event)}</h3><div class="sub">${when(m.commence, m.status)}<span class="tag">${esc(m.league)}</span>${esc(m.marketLabel)} · width ${m.width}</div></div>
          <div class="big ${m.evPct >= 0 ? '' : 'neg'}">${m.evPct >= 0 ? '+' : ''}${pct(m.evPct)} EV</div>
        </div>
        <table class="legs">${m.legs.map((l) => `<tr><td>${esc(l.label)}</td><td class="book">${esc(bookName(l.book))}</td><td class="num">${odds(l.price)}</td><td class="num">${money(l.stake)}</td></tr>`).join('')}</table>
        <div class="card-foot">
          <span>Miss <b class="${m.profitIfMiss >= 0 ? 'pos' : 'negv'}">${money(m.profitIfMiss)}</b> · Hit <b class="pos">${money(m.profitIfHit)}</b> · est. hit ${pct(m.hitProb, 1)}${m.pushProb ? ` + push ${pct(m.pushProb, 1)}` : ''}</span>
          <button class="small" data-log='${esc(JSON.stringify({ kind: 'middle', event: m.event, market: m.marketLabel, legs: m.legs }))}'>Log bets</button>
        </div>
      </div>`).join('')}</div>`;
  },

  async lowholds() {
    const list = await api(`/api/lowholds?${filters()}`);
    if (!list.length) return empty('No markets under your max hold.');
    return `<p class="sub" style="color:var(--muted)">Lowest-margin markets using the best price per side — ideal for converting bonus bets, clearing rollover and hedging promos.</p>
      <div class="table-wrap"><table class="grid">
      <tr><th>Hold</th><th class="left">Event</th><th class="left">Market</th><th class="left">Best prices</th></tr>
      ${list.map((x) => `<tr>
        <td class="num"><b class="${x.holdPct < 0 ? 'pos' : ''}">${pct(x.holdPct)}</b></td>
        <td class="left">${when(x.commence, x.status)}${esc(x.event)}</td>
        <td class="left">${esc(x.marketLabel)}</td>
        <td class="left">${x.legs.map((l) => `${esc(l.label)} <b>${odds(l.price)}</b> <span class="sub">${esc(bookName(l.book))}</span>`).join(' &nbsp;·&nbsp; ')}</td>
      </tr>`).join('')}</table></div>`;
  },

  async odds() {
    const p = filters();
    p.set('market', state.oddsMarket);
    if (state.oddsStatus) p.set('status', state.oddsStatus);
    const events = await api(`/api/odds?${p}`);
    const bookFilter = $('#f-book').value;
    const mine = state.settings.myBooks, sharp = state.settings.sharpBooks;
    const books = [...mine, ...sharp.filter((b) => !mine.includes(b))].filter((b) => !bookFilter || b === bookFilter || sharp.includes(b));
    const controls = `<div class="row" style="margin-bottom:10px;align-items:center">
      <div class="toolbar" style="padding:0">
        ${['h2h', 'spreads', 'totals'].map((m) => `<button class="${state.oddsMarket === m ? 'primary' : 'ghost'}" data-market="${m}">${{ h2h: 'Moneyline', spreads: 'Spread', totals: 'Total' }[m]}</button>`).join('')}
        <select id="o-status"><option value="">All games</option><option value="live" ${state.oddsStatus === 'live' ? 'selected' : ''}>Live only</option><option value="upcoming" ${state.oddsStatus === 'upcoming' ? 'selected' : ''}>Upcoming</option></select>
        <label class="chk"><input type="checkbox" id="o-all" ${state.allLines ? 'checked' : ''}> Show alternate lines</label>
      </div></div>`;
    if (!events.length) return controls + empty('No events match.');
    const rows = [];
    for (const e of events) {
      const markets = state.allLines ? e.markets : e.markets.slice(0, 1);
      markets.forEach((m, mi) => m.outcomes.forEach((o, oi) => {
        const name = o === 'home' ? e.home : o === 'away' ? e.away : o === 'draw' ? 'Draw' : o === 'over' ? 'Over' : 'Under';
        const line = m.market === 'spreads' ? (o === 'home' ? m.line : -m.line) : m.market === 'totals' ? m.line : null;
        const first = mi === 0 && oi === 0;
        const last = mi === markets.length - 1 && oi === m.outcomes.length - 1;
        rows.push(`<tr class="${last ? 'sep' : ''}">
          <td class="left event">${first ? `${when(e.commence, e.status)}<a href="#" data-history="${esc(e.id)}" data-title="${esc(`${e.away} @ ${e.home}`)}">${esc(e.league)}</a>${e.score ? ` <span class="sub">${e.score.away}–${e.score.home} · ${esc(e.score.clock)}</span>` : ''}` : ''}</td>
          <td class="left"><b>${esc(name)}</b>${line != null ? ` ${line > 0 && m.market === 'spreads' ? '+' : ''}${line}` : ''}</td>
          <td class="num">${oi === 0 && m.holdPct != null ? pct(m.holdPct, 1) : ''}</td>
          ${books.map((b) => {
            const q = m.books[b]?.[o];
            if (!q) return '<td class="price sub">—</td>';
            const bestMine = Math.max(...mine.map((x) => m.books[x]?.[o]?.price ?? 0));
            const isBest = !sharp.includes(b) && q.price === bestMine;
            const key = `${e.id}|${m.key}|${b}|${o}`;
            const old = state.lastPrices.get(key);
            state.lastPrices.set(key, q.price);
            const dir = q.prev ? (q.price > q.prev ? 'up' : q.price < q.prev ? 'down' : '') : '';
            return `<td class="price ${isBest ? 'best' : ''} ${dir} ${old && old !== q.price ? 'flash' : ''}" title="${esc(bookName(b))} · updated ${new Date(q.updated).toLocaleTimeString()}">${odds(q.price)}</td>`;
          }).join('')}
        </tr>`);
      }));
    }
    return controls + `<div class="table-wrap"><table class="grid">
      <tr><th class="left">Game</th><th class="left">Selection</th><th>Hold</th>${books.map((b) => `<th title="${sharp.includes(b) ? 'Sharp reference — fair value only' : 'Your book'}">${esc(bookName(b))}${sharp.includes(b) ? ' <span class="tag">ref</span>' : ''}</th>`).join('')}</tr>
      ${rows.join('')}</table></div>`;
  },

  async wallet() {
    const w = await api('/api/wallet');
    const t = w.totals;
    const bookIds = [...new Set([...state.settings.myBooks, ...Object.keys(w.balances)])];
    return `
      <div class="stats">
        ${stat('Bankroll', money(t.bankroll))}${stat('Cash in books', money(t.balance))}${stat('Open exposure', money(t.exposure))}
        ${stat('Settled P/L', `<span class="${t.profit >= 0 ? 'pos' : 'negv'}">${money(t.profit)}</span>`)}${stat('ROI', pct(t.roiPct))}
        ${stat('Deposited', money(t.deposits))}${stat('Withdrawn', money(t.withdrawals))}${stat('Bets', `${t.pendingBets} open / ${t.settledBets} settled`)}
      </div>
      <div class="two">
        <section class="card"><h2>Sportsbook balances</h2>
          <div class="table-wrap"><table class="grid">
            <tr><th class="left">Book</th><th>Balance</th><th>In play</th><th>Set balance</th></tr>
            ${bookIds.map((b) => `<tr><td class="left">${esc(bookName(b))}</td>
              <td class="num ${(w.balances[b] ?? 0) < 0 ? 'negv' : ''}">${money(w.balances[b] ?? 0)}</td>
              <td class="num">${money(w.exposureByBook[b] ?? 0)}</td>
              <td><form class="row" data-setbal="${esc(b)}" style="gap:4px;justify-content:center"><input type="number" step="0.01" name="v" style="width:90px" placeholder="0.00"><button class="small">Set</button></form></td></tr>`).join('')}
          </table></div>
        </section>
        <section class="card"><h2>Deposit / withdraw</h2>
          <form id="tx-form">
            <div class="row">
              <label class="field">Book<select name="book">${bookIds.map((b) => `<option value="${esc(b)}">${esc(bookName(b))}</option>`).join('')}</select></label>
              <label class="field">Type<select name="type"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select></label>
              <label class="field">Amount<input name="amount" type="number" step="0.01" min="0" required></label>
            </div>
            <label class="field">Note<input name="note" placeholder="optional"></label>
            <button class="primary">Record</button>
          </form>
          <h2 style="margin-top:18px">Import a statement (CSV)</h2>
          <form id="import-form">
            <p class="sub">Export your transaction history from the sportsbook’s website and drop it here. Columns are matched loosely (date, book, type, amount, note); if the file has no book column, pick one. Duplicate rows are skipped.</p>
            <div class="row">
              <label class="field">File<input type="file" name="file" accept=".csv,text/csv"></label>
              <label class="field">Book (if not in file)<select name="book"><option value="">— from file —</option>${bookIds.map((b) => `<option value="${esc(b)}">${esc(bookName(b))}</option>`).join('')}</select></label>
            </div>
            <label class="field">…or paste CSV<textarea name="csv" rows="3" style="background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:6px" placeholder="date,book,type,amount&#10;2026-10-01,DraftKings,Deposit,500"></textarea></label>
            <button class="ghost">Import</button>
          </form>
          <h2 style="margin-top:18px">Recent transactions</h2>
          ${w.transactions.length ? `<div class="table-wrap"><table class="grid"><tr><th class="left">When</th><th class="left">Book</th><th>Type</th><th>Change</th><th class="left">Note</th></tr>
            ${w.transactions.slice(0, 15).map((x) => `<tr><td class="left">${new Date(x.at).toLocaleString()}</td><td class="left">${esc(bookName(x.book))}</td><td>${esc(x.type)}</td><td class="num ${x.delta >= 0 ? 'pos' : 'negv'}">${money(x.delta)}</td><td class="left sub">${esc(x.note)}</td></tr>`).join('')}
          </table></div>` : '<p class="sub">None yet.</p>'}
        </section>
      </div>
      <section class="card" style="margin-top:16px"><h2>Bet log</h2>
        ${w.bets.length ? `<div class="table-wrap"><table class="grid">
          <tr><th class="left">Placed</th><th>Type</th><th class="left">Event</th><th class="left">Selection</th><th>Book</th><th>Odds</th><th>Stake</th><th>Status</th><th>P/L</th><th>Settle</th></tr>
          ${w.bets.map((b) => `<tr>
            <td class="left">${new Date(b.placedAt).toLocaleString()}</td><td><span class="tag">${esc(b.kind)}</span></td>
            <td class="left">${esc(b.event)} <span class="sub">${esc(b.market)}</span></td><td class="left">${esc(b.selection)}</td>
            <td>${esc(bookName(b.book))}</td><td class="price">${odds(b.price)}</td><td class="num">${money(b.stake)}</td>
            <td>${esc(b.status)}</td><td class="num ${b.profit > 0 ? 'pos' : b.profit < 0 ? 'negv' : ''}">${b.profit == null ? '—' : money(b.profit)}</td>
            <td>${['won', 'lost', 'push'].map((r) => `<button class="small" data-settle="${b.id}" data-result="${r}">${r}</button>`).join(' ')}
              <button class="small danger" data-delbet="${b.id}" title="Delete and refund stake">✕</button></td>
          </tr>`).join('')}</table></div>` : '<p class="sub">Use “Log bets” on any opportunity to track it here. Stakes are deducted from each book’s balance; settling credits returns.</p>'}
      </section>`;
  },

  calc() { return calculatorsHtml(); },

  settings() {
    const s = state.settings;
    const bookIds = Object.keys(state.books);
    return `<form id="settings-form" class="two">
      <section class="card"><h2>Scanner</h2>
        <div class="row">
          <label class="field">Demo feed scan (s)<input name="scanIntervalSec" type="number" min="1" value="${s.scanIntervalSec}"></label>
          <label class="field">Live odds scan (s, 0 = manual)<input name="liveIntervalSec" type="number" min="0" step="30" value="${s.liveIntervalSec}"></label>
          <label class="field">Default total stake ($)<input name="totalStake" type="number" min="1" value="${s.totalStake}"></label>
        </div>
        ${state.status?.live ? `<p class="sub">Each live scan costs ~${state.status.live.costPerScan} credits (${state.status.live.sports.length} in-season sports × markets × ⌈bookmakers ÷ 10⌉). At this interval that’s ~${s.liveIntervalSec ? Math.round((86400 / s.liveIntervalSec) * state.status.live.costPerScan).toLocaleString() : 0} credits/day. ${state.status.live.credits.remaining ?? '?'} left.</p>` : ''}
        <div class="row">
          <label class="field">Ignore pre-game prices older than (min, 0 = off)<input name="staleAfterMin" type="number" min="0" value="${s.staleAfterMin}"></label>
          <label class="field">Ignore live prices older than (s, 0 = off)<input name="staleLiveSec" type="number" min="0" value="${s.staleLiveSec}"></label>
        </div>
        <div class="row">
          <label class="field">Min arb %<input name="minArbPct" type="number" step="0.05" value="${s.minArbPct}"></label>
          <label class="field">Min +EV %<input name="minEvPct" type="number" step="0.1" value="${s.minEvPct}"></label>
        </div>
        <div class="row">
          <label class="field">Min middle EV %<input name="minMiddleEvPct" type="number" step="0.5" value="${s.minMiddleEvPct}"></label>
          <label class="field">Max low-hold %<input name="maxHoldPct" type="number" step="0.1" value="${s.maxHoldPct}"></label>
        </div>
        <div class="row">
          <label class="field">De-vig method<select name="devigMethod">${['multiplicative', 'additive', 'power', 'shin'].map((m) => `<option ${s.devigMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          <label class="field">Kelly fraction<input name="kellyFraction" type="number" step="0.05" min="0" max="1" value="${s.kellyFraction}"></label>
        </div>
        <h2>Sharp books (fair-value source)</h2>
        <p class="sub">Their no-vig price is the “true” probability each bet is measured against. They are never suggested as a bet.</p>
        <div class="row">${bookIds.filter((b) => state.books[b]?.sharp).map((b) => `<label class="chk"><input type="checkbox" name="sharp" value="${b}" ${s.sharpBooks.includes(b) ? 'checked' : ''}>${esc(bookName(b))}</label>`).join('')}</div>
      </section>
      <section class="card"><h2>My books</h2>
        <p class="sub">The books you have funded accounts at. Arbs, +EV, middles and low holds only ever tell you to bet at these — untick any that have limited you. Sharp books are used for fair value only and can’t be selected.</p>
        <div class="row">${bookIds.filter((b) => !state.books[b]?.sharp).map((b) => `<label class="chk"><input type="checkbox" name="mybook" value="${b}" ${s.myBooks.includes(b) ? 'checked' : ''}>${esc(bookName(b))}</label>`).join('')}</div>
        <h2 style="margin-top:18px">Alerts &amp; automation</h2>
        <label class="chk"><input type="checkbox" name="alertsEnabled" ${s.alerts.enabled ? 'checked' : ''}> Alert on new opportunities (in-app + browser notification + webhook)</label>
        <div class="row" style="margin-top:8px">
          <label class="field">Alert when arb ≥ %<input name="alertArb" type="number" step="0.1" value="${s.alerts.minArbPct}"></label>
          <label class="field">Alert when +EV ≥ %<input name="alertEv" type="number" step="0.1" value="${s.alerts.minEvPct}"></label>
        </div>
        <label class="field">Webhook URL (Discord, Slack or any JSON endpoint)<input name="webhookUrl" type="url" value="${esc(s.alerts.webhookUrl)}" placeholder="https://discord.com/api/webhooks/…"></label>
        <button type="button" class="ghost" id="btn-notify">Enable browser notifications</button>
        <div style="margin-top:16px"><button class="primary">Save settings</button></div>
      </section>
    </form>`;
  },
};

const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;
const stat = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;

// ---------------------------------------------------------------- calculators (run in-browser, shared math)
function calculatorsHtml() {
  return `<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">
    ${calcCard('arb', 'Arbitrage', 'Enter odds for every outcome (2 or 3-way) at different books.', `
      <div class="row"><label class="field">Outcome A odds<input name="a" value="+110"></label><label class="field">Outcome B odds<input name="b" value="-102"></label><label class="field">Outcome C (opt.)<input name="c" placeholder="3-way"></label></div>
      <div class="row"><label class="field">Total stake $<input name="total" type="number" value="1000"></label><label class="field">Round stakes to<select name="round"><option value="0">cents</option><option value="1">$1</option><option value="5">$5</option></select></label></div>`)}
    ${calcCard('ev', '+EV & Kelly', 'Fair value from a sharp line (both sides) or a win probability.', `
      <div class="row"><label class="field">Your odds<input name="price" value="+150"></label><label class="field">Sharp side odds<input name="s1" value="+128"></label><label class="field">Sharp other side<input name="s2" value="-140"></label></div>
      <div class="row"><label class="field">…or win prob %<input name="prob" type="number" step="0.1" placeholder="override"></label><label class="field">Bankroll $<input name="bank" type="number" value="5000"></label><label class="field">Kelly fraction<input name="frac" type="number" step="0.05" value="0.25"></label></div>`)}
    ${calcCard('promo', 'Promo conversion', 'Bonus bets, profit boosts and no-sweat bets hedged at another book.', `
      <div class="row"><label class="field">Promo type<select name="type"><option value="bonus">Bonus bet (SNR)</option><option value="boost">Profit boost</option><option value="nosweat">No-sweat / 2nd chance</option><option value="cash">Cash (qualifier)</option></select></label><label class="field">Amount $<input name="amount" type="number" value="100"></label></div>
      <div class="row"><label class="field">Promo-side odds<input name="price" value="+400"></label><label class="field">Hedge odds<input name="hedge" value="-450"></label></div>
      <div class="row"><label class="field">Boost %<input name="boost" type="number" value="50"></label><label class="field">No-sweat refund value %<input name="refund" type="number" value="70"></label></div>`)}
    ${calcCard('middle', 'Middle', 'e.g. Over 44.5 at book A and Under 47.5 at book B.', `
      <div class="row"><label class="field">Side A odds<input name="a" value="-110"></label><label class="field">Side B odds<input name="b" value="-110"></label></div>
      <div class="row"><label class="field">Total stake $<input name="total" type="number" value="200"></label><label class="field">Middle hit prob %<input name="p" type="number" step="0.5" value="8"></label></div>`)}
    ${calcCard('hedge', 'Hedge', 'Lock in profit on an open bet (futures, live).', `
      <div class="row"><label class="field">Original stake $<input name="stake" type="number" value="50"></label><label class="field">Original odds<input name="price" value="+800"></label><label class="field">Hedge odds now<input name="hedge" value="-200"></label></div>`)}
    ${calcCard('conv', 'Odds converter & no-vig', 'Convert formats and strip the vig from a full market.', `
      <div class="row"><label class="field">Odds (one per outcome, comma separated)<input name="list" value="-110, -110"></label><label class="field">Method<select name="method"><option>multiplicative</option><option>additive</option><option>power</option><option>shin</option></select></label></div>`)}
  </div>`;
}
const calcCard = (id, title, sub, fields) => `<form class="card calc" data-calc="${id}"><h3>${title}</h3><div class="sub" style="margin-bottom:10px">${sub}</div>${fields}<div class="result" id="r-${id}"></div></form>`;

const R = (rows) => rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
const CALCS = {
  arb(f) {
    const prices = [f.a, f.b, f.c].filter((x) => String(x).trim()).map(parseOdds);
    const r = arbStakes(prices, Number(f.total), Number(f.round));
    return R([
      ...prices.map((p, i) => [`Stake ${'ABC'[i]} @ ${odds(p)}`, `${money(r.stakes[i])} → ${money(r.payouts[i])}`]),
      ['Market hold', pct(r.hold, 2)],
      [r.isArb ? 'Guaranteed profit' : 'Guaranteed loss', `<span class="${r.guaranteedProfit >= 0 ? 'pos' : 'negv'}">${money(r.guaranteedProfit)} (${pct(r.profitPct)})</span>`],
    ]);
  },
  ev(f) {
    const price = parseOdds(f.price);
    let prob;
    if (String(f.prob).trim()) prob = Number(f.prob) / 100;
    else prob = devig([parseOdds(f.s1), parseOdds(f.s2)], state.settings?.devigMethod)[0];
    const ev = expectedValue(price, prob);
    const k = kelly(price, prob, Number(f.bank), Number(f.frac));
    return R([
      ['Fair win probability', pct(prob * 100)], ['Fair odds', odds(1 / prob)],
      ['Expected value', `<span class="${ev >= 0 ? 'pos' : 'negv'}">${pct(ev * 100)}</span>`],
      ['Full Kelly', pct(k.fullKellyPct)], [`Stake (${f.frac}× Kelly)`, `${money(k.stake)} (${pct(k.stakePct)})`],
    ]);
  },
  promo(f) {
    const r = promoConversion({ type: f.type, amount: Number(f.amount), price: parseOdds(f.price), hedgePrice: parseOdds(f.hedge), boostPct: Number(f.boost), refundRate: Number(f.refund) / 100 });
    return R([
      ...(f.type === 'boost' ? [['Boosted odds', odds(r.effectivePrice)]] : []),
      ['Hedge stake', money(r.hedgeStake)], ['Profit if promo side wins', money(r.profitIfPromoWins)],
      ['Profit if hedge wins', money(r.profitIfHedgeWins)],
      ['Locked profit', `<span class="${r.lockedProfit >= 0 ? 'pos' : 'negv'}">${money(r.lockedProfit)} (${pct(r.conversionPct)} conversion)</span>`],
    ]);
  },
  middle(f) {
    const r = middle(parseOdds(f.a), parseOdds(f.b), Number(f.total), Number(f.p) / 100);
    return R([
      ['Stake A / B', `${money(r.stakeA)} / ${money(r.stakeB)}`], ['If middle misses', money(r.profitIfMiss)],
      ['If middle hits', `<span class="pos">${money(r.profitIfHit)}</span>`], ['Expected profit', money(r.expectedProfit)],
      ['Break-even hit rate', r.breakEvenMiddleProb == null ? '—' : pct(r.breakEvenMiddleProb)],
    ]);
  },
  hedge(f) {
    const r = hedge(Number(f.stake), parseOdds(f.price), parseOdds(f.hedge));
    return R([['Hedge stake', money(r.hedgeStake)], ['Profit either way', `<span class="${r.profitIfOriginalWins >= 0 ? 'pos' : 'negv'}">${money(r.profitIfOriginalWins)}</span>`]]);
  },
  conv(f) {
    const prices = String(f.list).split(',').map((s) => s.trim()).filter(Boolean).map(parseOdds);
    const fair = prices.length > 1 ? devig(prices, f.method) : null;
    return R([
      ...prices.map((p, i) => [`#${i + 1}`, `${formatOdds(p, 'american')} · ${p.toFixed(3)} · ${pct(100 / p, 1)}${fair ? ` → fair ${decimalToAmerican(1 / fair[i]) > 0 ? '+' : ''}${decimalToAmerican(1 / fair[i])} (${pct(fair[i] * 100, 1)})` : ''}`]),
      ...(prices.length > 1 ? [['Hold / vig', pct(hold(prices) * 100)]] : []),
    ]);
  },
};
function runCalcForm(form) {
  const f = Object.fromEntries(new FormData(form));
  const out = $(`#r-${form.dataset.calc}`);
  try { out.innerHTML = CALCS[form.dataset.calc](f); } catch (e) { out.innerHTML = `<span class="negv">${esc(e.message)}</span>`; }
}

// ---------------------------------------------------------------- bet logging dialog
async function openLogDialog(payload) {
  const dlg = $('#dlg');
  const render = async (scale = 1) => {
    const legs = payload.legs.map((l) => ({ ...l, stake: Math.round(l.stake * scale * 100) / 100 }));
    const funding = await api('/api/wallet/funding', { method: 'POST', body: { legs } }).catch(() => null);
    dlg.innerHTML = `<form method="dialog" id="log-form">
      <h3 style="margin-top:0">Log ${esc(payload.kind)} — ${esc(payload.event)}</h3>
      <div class="sub" style="margin-bottom:10px">${esc(payload.market)} · confirm the prices you actually got</div>
      <table class="legs">${legs.map((l, i) => `<tr><td>${esc(l.label)}</td><td class="book">${esc(bookName(l.book))}</td>
        <td><input name="price${i}" value="${odds(l.price)}" style="width:80px"></td>
        <td><input name="stake${i}" type="number" step="0.01" value="${l.stake}" style="width:90px"></td></tr>`).join('')}</table>
      ${funding ? `<div class="funding ${funding.funded ? '' : 'bad'}">${funding.funded ? '✓ Balances cover every leg.'
        : `⚠ Short at ${funding.legs.filter((l) => l.shortfall > 0).map((l) => `${esc(bookName(l.book))} (${money(l.shortfall)})`).join(', ')}. Max scale with current balances: ${funding.maxScale}×`}</div>` : ''}
      <div class="row" style="margin-top:14px;justify-content:space-between;align-items:center">
        <label class="chk">Scale stakes <input type="number" id="log-scale" step="0.1" min="0.1" value="${scale}" style="width:70px"></label>
        <div class="row"><button value="cancel" class="ghost">Cancel</button><button value="ok" class="primary">Log bets</button></div>
      </div></form>`;
    $('#log-scale', dlg).onchange = (e) => render(Number(e.target.value) || 1);
    $('#log-form', dlg).onsubmit = async (e) => {
      if (e.submitter?.value !== 'ok') return;
      const fd = new FormData(e.target);
      const finalLegs = legs.map((l, i) => ({ ...l, price: parseOdds(fd.get(`price${i}`)), stake: Number(fd.get(`stake${i}`)) }));
      try {
        await api('/api/wallet/bets', { method: 'POST', body: { kind: payload.kind, event: payload.event, market: payload.market, legs: finalLegs } });
        toast(`Logged ${finalLegs.length} bet(s). Track them in Wallet.`);
      } catch (err) { toast(esc(err.message), 'err'); }
    };
  };
  await render(1);
  dlg.showModal();
}

async function openHistory(eventId, title) {
  const series = await api(`/api/events/${encodeURIComponent(eventId)}/history`);
  const dlg = $('#dlg');
  const ml = series.filter((s) => s.market === 'h2h' && s.outcome === 'home' && s.points.length > 1);
  let svg = '<p class="sub">No movement recorded yet (or the live provider does not expose history).</p>';
  if (ml.length) {
    const all = ml.flatMap((s) => s.points.map(([t, p]) => [Date.parse(t), 100 / p]));
    const [t0, t1] = [Math.min(...all.map((x) => x[0])), Math.max(...all.map((x) => x[0]))];
    const [p0, p1] = [Math.min(...all.map((x) => x[1])) - 0.5, Math.max(...all.map((x) => x[1])) + 0.5];
    const X = (t) => 40 + ((t - t0) / Math.max(1, t1 - t0)) * 540, Y = (p) => 200 - ((p - p0) / Math.max(0.01, p1 - p0)) * 180;
    const palette = ['#10b981', '#60a5fa', '#f59e0b', '#f472b6', '#a78bfa', '#f87171', '#22d3ee', '#84cc16'];
    svg = `<svg class="chart" viewBox="0 0 600 220">
      <line x1="40" y1="200" x2="580" y2="200" stroke="var(--line)"/><text x="4" y="24" fill="var(--muted)" font-size="10">${p1.toFixed(1)}%</text><text x="4" y="200" fill="var(--muted)" font-size="10">${p0.toFixed(1)}%</text>
      ${ml.slice(0, 8).map((s, i) => `<polyline fill="none" stroke="${palette[i]}" stroke-width="2" points="${s.points.map(([t, p]) => `${X(Date.parse(t)).toFixed(1)},${Y(100 / p).toFixed(1)}`).join(' ')}"/>`).join('')}
    </svg><div class="row" style="font-size:12px">${ml.slice(0, 8).map((s, i) => `<span><span style="color:${palette[i]}">■</span> ${esc(bookName(s.book))}</span>`).join('')}</div>`;
  }
  dlg.innerHTML = `<h3 style="margin-top:0">${esc(title)} — home moneyline implied probability</h3>${svg}<form method="dialog" style="text-align:right;margin-top:12px"><button class="ghost">Close</button></form>`;
  dlg.showModal();
}

// ---------------------------------------------------------------- render loop
let rendering = false;
async function render(force = false) {
  if (rendering) return;
  const live = ['arbs', 'ev', 'middles', 'lowholds', 'odds'].includes(state.tab);
  if (!force && (!live || $('#f-pause').checked || $('#dlg').open)) return;
  rendering = true;
  try {
    $('#toolbar').style.display = ['calc', 'settings', 'wallet'].includes(state.tab) ? 'none' : '';
    const html = await views[state.tab]();
    $('#view').innerHTML = html;
    if (state.tab === 'calc') document.querySelectorAll('form.calc').forEach(runCalcForm);
  } catch (e) {
    $('#view').innerHTML = empty(`Error: ${e.message}`);
  } finally { rendering = false; }
}

function setStatus(s) {
  state.status = s;
  const ok = !s.lastError;
  const L = s.live;
  const liveBits = L ? ` · ${L.credits.remaining ?? '?'} credits left (~${L.costPerScan}/scan) · ${s.intervalSec ? `next ${s.nextScan ? new Date(s.nextScan).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}` : 'manual scans'}` : '';
  const warn = [s.lastError, ...(L?.warnings ?? []), L?.missingBooks?.length && s.scanCount ? `no odds from ${L.missingBooks.map(bookName).join(', ')}` : ''].filter(Boolean);
  $('#status').innerHTML = `<span class="dot ${ok ? '' : 'off'}"></span>${s.provider === 'simulated' ? '<b>Demo feed</b> (simulated — don’t bet off it)' : 'Live: The Odds API'} · ${s.counts.books} books · ${s.counts.events} games (${s.counts.live} live) · ${s.lastScan ? new Date(s.lastScan).toLocaleTimeString() : '—'}${liveBits}${warn.length ? ` · <span title="${esc(warn.join(' | '))}" style="color:var(--warn)">⚠ ${esc(warn[0])}${warn.length > 1 ? ` (+${warn.length - 1})` : ''}</span>` : ''}`;
  $('#btn-scan').title = L ? `Costs ~${L.costPerScan} API credits` : 'Rescan now';
  for (const k of ['arbs', 'ev', 'middles', 'lowHolds']) {
    const el = $(`#c-${k}`); el.textContent = s.counts[k]; el.classList.toggle('hot', k !== 'lowHolds' && s.counts[k] > 0);
  }
}

function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('update', (e) => { setStatus(JSON.parse(e.data)); render(); });
  es.addEventListener('alert', (e) => {
    for (const x of JSON.parse(e.data).slice(0, 4)) {
      const msg = x.legs ? `<b>ARB ${pct(x.profitPct)}</b> · ${esc(x.event)}<br><span class="sub">${esc(x.marketLabel)}</span>`
        : `<b>+EV ${pct(x.evPct)}</b> · ${esc(x.label)} ${odds(x.price)} @ ${esc(bookName(x.book))}<br><span class="sub">${esc(x.event)}</span>`;
      toast(msg, x.legs ? '' : 'ev');
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(x.legs ? `Arb ${pct(x.profitPct)} — ${x.event}` : `+EV ${pct(x.evPct)} — ${x.label}`);
      }
    }
  });
  es.onerror = () => { $('#status').innerHTML = '<span class="dot off"></span>reconnecting…'; };
}

// ---------------------------------------------------------------- events
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.tab) {
    state.tab = t.dataset.tab; localSet('tab', state.tab);
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === t));
    return render(true);
  }
  if (t.dataset.log) return openLogDialog(JSON.parse(t.dataset.log));
  if (t.dataset.market) { state.oddsMarket = t.dataset.market; return render(true); }
  if (t.dataset.history) { e.preventDefault(); return openHistory(t.dataset.history, t.dataset.title); }
  if (t.dataset.settle) { await api(`/api/wallet/bets/${t.dataset.settle}/settle`, { method: 'POST', body: { result: t.dataset.result } }); return render(true); }
  if (t.dataset.delbet) { if (confirm('Delete this bet and refund its stake?')) { await api(`/api/wallet/bets/${t.dataset.delbet}`, { method: 'DELETE' }); render(true); } return; }
  if (t.id === 'btn-scan') { await api('/api/scan', { method: 'POST' }); return; }
  if (t.id === 'btn-notify') {
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Browser notifications on.' : 'Notifications were blocked by the browser.');
  }
});

document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'o-status') { state.oddsStatus = e.target.value; return render(true); }
  if (id === 'o-all') { state.allLines = e.target.checked; return render(true); }
  if (id === 'f-format') { localSet('format', e.target.value); return render(true); }
  if (['f-sport', 'f-book'].includes(id)) return render(true);
});
let qTimer;
$('#f-q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => render(true), 250); });
document.addEventListener('input', (e) => { const f = e.target.closest('form.calc'); if (f) runCalcForm(f); });

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.id === 'tx-form') {
    e.preventDefault();
    try { await api('/api/wallet/transactions', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); render(true); } catch (err) { toast(esc(err.message), 'err'); }
  } else if (f.id === 'import-form') {
    e.preventDefault();
    const fd = new FormData(f);
    const file = fd.get('file');
    const csv = file && file.size ? await file.text() : fd.get('csv');
    try {
      const r = await api('/api/wallet/import', { method: 'POST', body: { csv, book: fd.get('book') || undefined } });
      toast(`Imported ${r.imported} transaction(s)${r.skipped ? `, ${r.skipped} duplicate(s) skipped` : ''}${r.errors.length ? `<br><span class="sub">${esc(r.errors.slice(0, 3).join('; '))}</span>` : ''}`, r.errors.length ? 'err' : '');
      render(true);
    } catch (err) { toast(esc(err.message), 'err'); }
  } else if (f.dataset.setbal) {
    e.preventDefault();
    const v = new FormData(f).get('v');
    if (v === '') return;
    await api(`/api/wallet/balances/${encodeURIComponent(f.dataset.setbal)}`, { method: 'PUT', body: { balance: Number(v) } });
    render(true);
  } else if (f.id === 'settings-form') {
    e.preventDefault();
    const fd = new FormData(f);
    const n = (k) => Number(fd.get(k));
    const patch = {
      scanIntervalSec: n('scanIntervalSec'), liveIntervalSec: n('liveIntervalSec'), staleAfterMin: n('staleAfterMin'), staleLiveSec: n('staleLiveSec'), totalStake: n('totalStake'), minArbPct: n('minArbPct'), minEvPct: n('minEvPct'),
      minMiddleEvPct: n('minMiddleEvPct'), maxHoldPct: n('maxHoldPct'), devigMethod: fd.get('devigMethod'), kellyFraction: n('kellyFraction'),
      sharpBooks: fd.getAll('sharp'), myBooks: fd.getAll('mybook'),
      alerts: { enabled: fd.get('alertsEnabled') === 'on', minArbPct: n('alertArb'), minEvPct: n('alertEv'), webhookUrl: fd.get('webhookUrl') },
    };
    try { state.settings = await api('/api/settings', { method: 'PUT', body: patch }); toast('Settings saved.'); } catch (err) { toast(esc(err.message), 'err'); }
  } else if (f.classList.contains('calc')) e.preventDefault();
});

// ---------------------------------------------------------------- boot
(async function boot() {
  const [books, settings] = await Promise.all([api('/api/books'), api('/api/settings')]);
  state.books = Object.fromEntries(books.map((b) => [b.id, b]));
  state.settings = settings;
  $('#f-book').innerHTML += books.filter((b) => settings.myBooks.includes(b.id)).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  $('#f-format').value = localGet('format') || settings.oddsFormat;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  await render(true);
  connect();
})();

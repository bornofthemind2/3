// Zero-dependency HTTP server: REST API + Server-Sent Events + static UI.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, HttpError } from './store.js';
import { Scanner } from './scanner.js';
import { SimulatedProvider } from './providers/simulated.js';
import { TheOddsApiProvider } from './providers/theOddsApi.js';
import { BOOKS } from './providers/books.js';
import * as calc from './lib/calculators.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STATIC = { '/': join(ROOT, 'public'), '/lib/': join(ROOT, 'src/lib') };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

export function createApp({ provider, store, scanner } = {}) {
  store ??= new Store(process.env.DATA_FILE ?? join(ROOT, 'data/state.json'));
  provider ??= process.env.ODDS_API_KEY
    ? new TheOddsApiProvider({
      apiKey: process.env.ODDS_API_KEY,
      sports: process.env.ODDS_SPORTS?.split(','),
      books: () => [...store.settings.myBooks, ...store.settings.sharpBooks],
    })
    : new SimulatedProvider();
  scanner ??= new Scanner({ provider, store });

  const clients = new Set();
  const broadcast = (type, data) => {
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  };
  scanner.on('update', (status) => broadcast('update', status));
  scanner.on('alert', (items) => broadcast('alert', items));

  const routes = [
    ['GET', '/api/status', () => scanner.status()],
    ['GET', '/api/books', () => {
      // catalogue + any extra books the live provider returned (The Odds API has 70+)
      const seen = new Set(scanner.events.flatMap((e) => e.offers.map((o) => o.book)));
      const known = new Set(BOOKS.map((b) => b.id));
      const live = provider.name !== 'simulated';
      const list = BOOKS.filter((b) => !live || seen.has(b.id) || store.settings.sharpBooks.includes(b.id));
      for (const id of seen) if (!known.has(id)) list.push({ id, name: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), sharp: false });
      return list;
    }],
    ['GET', '/api/settings', () => store.settings],
    ['PUT', '/api/settings', ({ body }) => { const s = store.updateSettings(body); scanner.compute(); return s; }],
    ['POST', '/api/scan', async () => { await scanner.scan(); return scanner.status(); }],
    ['GET', '/api/arbs', ({ query }) => filterList(scanner.results.arbs, query)],
    ['GET', '/api/ev', ({ query }) => filterList(scanner.results.ev, query)],
    ['GET', '/api/middles', ({ query }) => filterList(scanner.results.middles, query)],
    ['GET', '/api/lowholds', ({ query }) => filterList(scanner.results.lowHolds, query)],
    ['GET', '/api/odds', ({ query }) => scanner.oddsScreen(query)],
    ['GET', '/api/events/:id/history', ({ params }) => provider.getHistory(params.id)],
    ['GET', '/api/wallet', () => store.walletSummary()],
    ['POST', '/api/wallet/transactions', ({ body }) => store.addTransaction(body)],
    ['POST', '/api/wallet/import', ({ body }) => store.importCsv(body.csv, { book: body.book })],
    ['PUT', '/api/wallet/balances/:book', ({ params, body }) => store.setBalance(params.book, body.balance)],
    ['POST', '/api/wallet/bets', ({ body }) => store.placeBets(body.legs ?? [body], body)],
    ['POST', '/api/wallet/bets/:id/settle', ({ params, body }) => store.settleBet(params.id, body.result)],
    ['DELETE', '/api/wallet/bets/:id', ({ params }) => store.deleteBet(params.id)],
    ['POST', '/api/wallet/funding', ({ body }) => store.checkFunding(body.legs ?? [])],
    ['POST', '/api/calc/:name', ({ params, body }) => runCalc(params.name, body)],
  ];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/stream') return openStream(req, res);
      if (url.pathname.startsWith('/api/')) {
        for (const [method, pattern, handler] of routes) {
          if (method !== req.method) continue;
          const params = match(pattern, url.pathname);
          if (!params) continue;
          const body = ['POST', 'PUT'].includes(req.method) ? await readJson(req) : undefined;
          const result = await handler({ params, body, query: Object.fromEntries(url.searchParams) });
          return send(res, 200, result);
        }
        throw new HttpError(404, `No route for ${req.method} ${url.pathname}`);
      }
      return await serveStatic(url.pathname, res);
    } catch (e) {
      const status = e.status ?? (e instanceof RangeError || e instanceof SyntaxError ? 400 : 500);
      if (status === 500) console.error(e);
      send(res, status, { error: e.message });
    }
  });

  function openStream(req, res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`event: update\ndata: ${JSON.stringify(scanner.status())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  }

  server.on('close', () => scanner.stop());
  return { server, scanner, store, provider };
}

function filterList(list, { sport, book, q, limit } = {}) {
  let out = list;
  if (sport) out = out.filter((x) => x.sport === sport);
  if (book) out = out.filter((x) => x.book === book || x.legs?.some((l) => l.book === book));
  if (q) { const n = q.toLowerCase(); out = out.filter((x) => `${x.event} ${x.league} ${x.marketLabel}`.toLowerCase().includes(n)); }
  return out.slice(0, Number(limit) || 500);
}

function runCalc(name, b = {}) {
  const n = (x) => Number(x);
  switch (name) {
    case 'arbitrage': return calc.arbStakes((b.prices ?? []).map(n), n(b.totalStake ?? 100), n(b.roundTo ?? 0));
    case 'kelly': return calc.kelly(n(b.price), n(b.prob), n(b.bankroll ?? 1000), n(b.fraction ?? 0.25));
    case 'hedge': return calc.hedge(n(b.stake), n(b.price), n(b.hedgePrice));
    case 'middle': return calc.middle(n(b.priceA), n(b.priceB), n(b.totalStake ?? 100), n(b.middleProb ?? 0));
    case 'promo': return calc.promoConversion({ ...b, amount: n(b.amount), price: n(b.price), hedgePrice: n(b.hedgePrice), boostPct: n(b.boostPct ?? 0), refundRate: n(b.refundRate ?? 0.7) });
    default: throw new HttpError(404, `unknown calculator ${name}`);
  }
}

function match(pattern, path) {
  const a = pattern.split('/'), b = path.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new HttpError(413, 'body too large'); }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'invalid JSON body'); }
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function serveStatic(pathname, res) {
  const prefix = pathname.startsWith('/lib/') ? '/lib/' : '/';
  const base = STATIC[prefix];
  const rel = pathname.slice(prefix.length) || 'index.html';
  const file = normalize(join(base, rel));
  if (!file.startsWith(base)) throw new HttpError(403, 'forbidden');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    throw new HttpError(404, 'not found');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const { server, scanner, provider } = createApp();
  scanner.start();
  server.listen(port, () => {
    console.log(`EdgeFinder running at http://localhost:${port}  (odds provider: ${provider.name})`);
  });
}

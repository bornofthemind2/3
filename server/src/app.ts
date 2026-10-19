import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import type { Draft, Identification } from './schemas.ts';

export type Handlers = {
  identify: (images: string[]) => Promise<Identification>;
  compose: (answers: unknown, identification: unknown) => Promise<Draft>;
  /** Shared secret the app sends as a bearer token; unset disables the check (local development only). */
  token?: string;
  /** Turns a handler error into a message safe to show the seller, or undefined for a generic 500. */
  publicMessage?: (e: unknown) => string | undefined;
};

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 4;
// About 4 MB of JPEG once decoded; the app sends 1024px-wide photos well under this.
const MAX_IMAGE_BASE64 = 5_500_000;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
    chunks.push(chunk as Buffer);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Body must be a JSON object');
  }
}

function authorized(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const given = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function parseImages(body: Record<string, unknown>): string[] {
  const images = body.images;
  if (!Array.isArray(images) || images.length === 0) throw new HttpError(400, '`images` must be a non-empty array');
  if (images.length > MAX_IMAGES) throw new HttpError(400, `At most ${MAX_IMAGES} images`);
  for (const img of images) {
    if (typeof img !== 'string' || img.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=\s]+$/.test(img)) {
      throw new HttpError(400, 'Each image must be base64-encoded JPEG data under 4 MB');
    }
  }
  return images as string[];
}

export function createApp(h: Handlers): Server {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
      if (req.method !== 'POST') throw new HttpError(404, 'Not found');
      if (!authorized(req, h.token)) throw new HttpError(401, 'Unauthorized');

      if (req.url === '/identify') {
        const body = await readJson(req);
        return send(res, 200, await h.identify(parseImages(body)));
      }
      if (req.url === '/compose') {
        const body = await readJson(req);
        if (!body.answers || typeof body.answers !== 'object') throw new HttpError(400, '`answers` is required');
        return send(res, 200, await h.compose(body.answers, body.identification));
      }
      throw new HttpError(404, 'Not found');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      const message = h.publicMessage?.(e);
      if (message) return send(res, 502, { error: message });
      console.error(e);
      send(res, 500, { error: 'Internal error' });
    }
  });
}

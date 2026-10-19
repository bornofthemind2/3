import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlockParam, BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { draftSchema, identificationSchema, type Draft, type Identification } from './schemas.ts';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const client = new Anthropic();

export class ListingAssistantError extends Error {}

const IDENTIFY_SYSTEM = `You help people sell used household items on online marketplaces such as Facebook Marketplace, eBay, OfferUp and Mercari.
You get photos of one item. Identify it as specifically as the photos allow, without guessing a brand or model you can't see or recognize with confidence.
Estimate a realistic used resale price range in US dollars for the condition you see, based on typical sold prices, not new retail.
Judge condition only from what is visible; when unsure, prefer "good".
Ask follow-up questions only where the answer changes the price or a buyer's decision and the photos don't show it (e.g. storage size, whether it powers on, shoe size). Ask nothing you could read from the photos.`;

const COMPOSE_SYSTEM = `You write marketplace listings for used items that sell quickly and honestly.
Use only facts the seller gave you or that came from identifying their photos. Never invent features, measurements, history, or claims such as "smoke-free home".
State flaws plainly. Keep the description to a short opening line, then short lines of key details. Plain text only.
Leave out pickup, shipping, and whether the price is negotiable; the app adds those per marketplace.`;

/** Sends a structured-output request and returns the parsed JSON, with refusal fallbacks enabled. */
async function structured<T>(params: {
  system: string;
  content: BetaContentBlockParam[];
  schema: Record<string, unknown>;
  effort: 'low' | 'medium';
}): Promise<T> {
  let message: BetaMessage;
  try {
    message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: params.system,
      output_config: { effort: params.effort, format: { type: 'json_schema', schema: params.schema } },
      messages: [{ role: 'user', content: params.content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ListingAssistantError('The assistant is busy. Try again in a minute.');
    if (e instanceof Anthropic.APIError) throw new ListingAssistantError(`Claude API error ${e.status}`);
    throw e;
  }

  if (message.stop_reason === 'refusal') throw new ListingAssistantError('The assistant declined to describe this item.');
  if (message.stop_reason === 'max_tokens') throw new ListingAssistantError('The assistant response was cut off.');
  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new ListingAssistantError('The assistant returned no listing.');
  return JSON.parse(text.text) as T;
}

export async function identify(imagesBase64: string[]): Promise<Identification> {
  const result = await structured<Identification>({
    system: IDENTIFY_SYSTEM,
    effort: 'medium',
    schema: identificationSchema,
    content: [
      ...imagesBase64.map((data) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
      })),
      { type: 'text', text: `These ${imagesBase64.length} photo(s) show one item I want to sell. Identify it.` },
    ],
  });
  result.followUps = result.followUps.slice(0, 3);
  if (result.priceHigh < result.priceLow) [result.priceLow, result.priceHigh] = [result.priceHigh, result.priceLow];
  return result;
}

export async function compose(answers: unknown, identification: unknown): Promise<Draft> {
  return structured<Draft>({
    system: COMPOSE_SYSTEM,
    effort: 'low',
    schema: draftSchema,
    content: [
      {
        type: 'text',
        text: `Seller's answers (JSON):\n${JSON.stringify(answers, null, 2)}\n\nWhat the photos showed (JSON, may be absent):\n${JSON.stringify(identification ?? null, null, 2)}\n\nWrite the listing.`,
      },
    ],
  });
}

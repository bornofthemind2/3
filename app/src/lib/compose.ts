import { CONDITION_LABELS } from './options';
import type { Answers, Draft, Identification } from './types';

/** Parses "$1,200" or "45.50" into a number; returns NaN when nothing usable is there. */
export function parsePrice(text: string): number {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return text.trim() === '' ? NaN : n;
}

/** Builds a listing without the AI service, from the seller's answers alone. */
export function composeLocally(answers: Answers, identification?: Identification): Draft {
  const nameParts = [answers.brand, answers.model, answers.itemName].filter((p) => p.trim());
  const name = Array.from(new Set(nameParts.map((p) => p.trim()))).join(' ');
  const condition = CONDITION_LABELS[answers.condition];

  const title = [name, answers.condition === 'new' ? 'New' : answers.condition === 'like_new' ? 'Like New' : '']
    .filter(Boolean)
    .join(' - ');

  const details: string[] = [];
  details.push(`Condition: ${condition}.`);
  if (answers.age && answers.age !== 'Not sure') details.push(`Age: ${answers.age}.`);
  if (answers.dimensions.trim()) details.push(`Dimensions: ${answers.dimensions.trim()}.`);
  if (answers.includes.trim()) details.push(`Includes: ${answers.includes.trim()}.`);
  details.push(answers.defects.trim() ? `Flaws: ${answers.defects.trim()}.` : 'No known flaws.');
  for (const q of identification?.followUps ?? []) {
    const a = answers.followUps[q.id];
    if (a?.trim()) details.push(`${q.question.replace(/\?$/, '')}: ${a.trim()}.`);
  }

  const price = parsePrice(answers.price);
  const fallbackPrice = identification ? Math.round((identification.priceLow + identification.priceHigh) / 2) : 0;

  return {
    title: title || 'Item for sale',
    description: [`${name || 'Item'} for sale.`, details.join('\n')].join('\n\n'),
    price: Number.isFinite(price) ? price : fallbackPrice,
    tags: [answers.brand, answers.itemName].filter((t) => t.trim()).map((t) => t.trim().toLowerCase()),
  };
}

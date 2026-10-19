// JSON schemas for Claude's structured outputs. Field names match the app's src/lib/types.ts.

export const CATEGORIES = [
  'electronics',
  'phones',
  'furniture',
  'appliances',
  'home_decor',
  'kitchen',
  'clothing',
  'shoes_bags',
  'toys_games',
  'sports_outdoors',
  'tools',
  'books_media',
  'collectibles',
  'baby_kids',
  'other',
] as const;

export const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'for_parts'] as const;

export type Identification = {
  itemName: string;
  category: (typeof CATEGORIES)[number];
  brand: string;
  model: string;
  conditionGuess: (typeof CONDITIONS)[number];
  bulky: boolean;
  priceLow: number;
  priceHigh: number;
  notes: string;
  followUps: { id: string; question: string; options: string[] }[];
};

export type Draft = {
  title: string;
  description: string;
  price: number;
  tags: string[];
};

export const identificationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'itemName',
    'category',
    'brand',
    'model',
    'conditionGuess',
    'bulky',
    'priceLow',
    'priceHigh',
    'notes',
    'followUps',
  ],
  properties: {
    itemName: { type: 'string', description: 'Short generic name a buyer would search for, e.g. "Standing desk".' },
    category: { type: 'string', enum: CATEGORIES },
    brand: { type: 'string', description: 'Brand if visible or confidently recognizable, else empty string.' },
    model: { type: 'string', description: 'Model name/number if visible, else empty string.' },
    conditionGuess: { type: 'string', enum: CONDITIONS },
    bulky: { type: 'boolean', description: 'True if too large or heavy to ship economically (most furniture, large appliances).' },
    priceLow: { type: 'number', description: 'Low end of a typical used resale price in USD.' },
    priceHigh: { type: 'number', description: 'High end of a typical used resale price in USD.' },
    notes: { type: 'string', description: 'One or two sentences for the seller: what affects the price, or what to photograph next. Empty if nothing useful.' },
    followUps: {
      type: 'array',
      description: 'Zero to three item-specific questions whose answers buyers care about and the photos do not show.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'question', 'options'],
        properties: {
          id: { type: 'string', description: 'snake_case key, e.g. "storage_capacity".' },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, description: 'Two to five likely short answers.' },
        },
      },
    },
  },
} as const;

export const draftSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'price', 'tags'],
  properties: {
    title: { type: 'string', description: 'Search-friendly title, at most 80 characters: brand, model, item type, key attribute.' },
    description: { type: 'string', description: 'Plain-text listing description. No markdown, no emojis, no pickup/shipping/price-firmness lines.' },
    price: { type: 'number', description: 'Asking price in USD; use the seller’s price.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Three to six lowercase search keywords.' },
  },
} as const;

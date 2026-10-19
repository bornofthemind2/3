import type { Category, Condition, Fulfillment } from './types';

export const CATEGORY_LABELS: Record<Category, string> = {
  electronics: 'Electronics',
  phones: 'Phones & tablets',
  furniture: 'Furniture',
  appliances: 'Appliances',
  home_decor: 'Home decor',
  kitchen: 'Kitchen & dining',
  clothing: 'Clothing',
  shoes_bags: 'Shoes & bags',
  toys_games: 'Toys & games',
  sports_outdoors: 'Sports & outdoors',
  tools: 'Tools & garden',
  books_media: 'Books, music & movies',
  collectibles: 'Collectibles & art',
  baby_kids: 'Baby & kids',
  other: 'Other',
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: 'New (unused)',
  like_new: 'Like new',
  good: 'Good, light wear',
  fair: 'Fair, visible wear',
  for_parts: 'For parts / not working',
};

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  local: 'Local pickup only',
  ship: 'Ship only',
  both: 'Pickup or ship',
};

export const AGE_OPTIONS = ['Under 1 year', '1–3 years', '3–5 years', '5+ years', 'Vintage', 'Not sure'];

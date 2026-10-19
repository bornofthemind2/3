import type { Answers, Category, Draft, MarketplaceId } from './types';

export type Marketplace = {
  id: MarketplaceId;
  name: string;
  color: string;
  bestFor: string;
  /** Page that starts a new listing. On phones with the marketplace app installed it usually opens the app. */
  createUrl: string;
  titleLimit: number;
  local: boolean;
  shipping: boolean;
  /** Categories this marketplace is limited to; undefined means general merchandise. */
  onlyCategories?: Category[];
};

export const MARKETPLACES: Record<MarketplaceId, Marketplace> = {
  facebook: {
    id: 'facebook',
    name: 'Facebook Marketplace',
    color: '#1877F2',
    bestFor: 'Almost anything, especially local pickup and furniture',
    createUrl: 'https://www.facebook.com/marketplace/create/item',
    titleLimit: 100,
    local: true,
    shipping: true,
  },
  ebay: {
    id: 'ebay',
    name: 'eBay',
    color: '#E53238',
    bestFor: 'Nationwide buyers: electronics, collectibles, parts, brand items',
    createUrl: 'https://www.ebay.com/sl/sell',
    titleLimit: 80,
    local: false,
    shipping: true,
  },
  offerup: {
    id: 'offerup',
    name: 'OfferUp',
    color: '#00AB80',
    bestFor: 'Quick local sales of household goods',
    createUrl: 'https://offerup.com/',
    titleLimit: 100,
    local: true,
    shipping: true,
  },
  craigslist: {
    id: 'craigslist',
    name: 'Craigslist',
    color: '#5A2E8C',
    bestFor: 'Large, heavy, or free items with local pickup',
    createUrl: 'https://post.craigslist.org/',
    titleLimit: 70,
    local: true,
    shipping: false,
  },
  mercari: {
    id: 'mercari',
    name: 'Mercari',
    color: '#4DC9FF',
    bestFor: 'Small shippable items: gadgets, toys, home goods',
    createUrl: 'https://www.mercari.com/sell/',
    titleLimit: 80,
    local: false,
    shipping: true,
  },
  poshmark: {
    id: 'poshmark',
    name: 'Poshmark',
    color: '#7F0353',
    bestFor: 'Clothing, shoes, bags, and accessories',
    createUrl: 'https://poshmark.com/create-listing',
    titleLimit: 80,
    local: false,
    shipping: true,
    onlyCategories: ['clothing', 'shoes_bags', 'home_decor', 'baby_kids'],
  },
  swappa: {
    id: 'swappa',
    name: 'Swappa',
    color: '#5BAF4A',
    bestFor: 'Phones, tablets, laptops, and other tech',
    createUrl: 'https://swappa.com/sell',
    titleLimit: 80,
    local: false,
    shipping: true,
    onlyCategories: ['phones', 'electronics'],
  },
  nextdoor: {
    id: 'nextdoor',
    name: 'Nextdoor',
    color: '#8ED500',
    bestFor: 'Selling to neighbors, kids and baby gear, free stuff',
    createUrl: 'https://nextdoor.com/for_sale_and_free/',
    titleLimit: 100,
    local: true,
    shipping: false,
  },
};

export const MARKETPLACE_ORDER: MarketplaceId[] = [
  'facebook',
  'ebay',
  'offerup',
  'mercari',
  'craigslist',
  'poshmark',
  'swappa',
  'nextdoor',
];

export function isAvailable(m: Marketplace, answers: Answers, bulky: boolean): boolean {
  if (m.onlyCategories && !m.onlyCategories.includes(answers.category)) return false;
  const wantsLocal = answers.fulfillment !== 'ship';
  const wantsShip = answers.fulfillment !== 'local';
  // Drop marketplaces that can't do what the seller asked for; bulky items need local pickup.
  if (!wantsLocal && !m.shipping) return false;
  if (!wantsShip && !m.local) return false;
  if (bulky && !m.local) return false;
  return true;
}

/** Ranks marketplaces for an item: the best fits first, at most `limit` preselected. */
export function recommend(answers: Answers, bulky: boolean, limit = 3): MarketplaceId[] {
  const score = (id: MarketplaceId): number => {
    const m = MARKETPLACES[id];
    let s = 0;
    if (m.onlyCategories?.includes(answers.category)) s += 5;
    if (id === 'facebook') s += 4;
    if (bulky && m.local) s += 3;
    if (!bulky && m.shipping && answers.fulfillment !== 'local') s += 2;
    if (id === 'ebay' && ['electronics', 'collectibles', 'tools', 'phones'].includes(answers.category)) s += 3;
    if (id === 'mercari' && !bulky) s += 1;
    if (id === 'offerup' && answers.fulfillment !== 'ship') s += 2;
    if (id === 'nextdoor' && answers.category === 'baby_kids') s += 2;
    return s;
  };
  return MARKETPLACE_ORDER.filter((id) => isAvailable(MARKETPLACES[id], answers, bulky))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Adapts the shared draft to one marketplace's conventions. */
export function formatFor(id: MarketplaceId, draft: Draft, answers: Answers): { title: string; body: string } {
  const m = MARKETPLACES[id];
  const title = truncate(draft.title, m.titleLimit);
  const lines = [draft.description.trim()];

  const logistics: string[] = [];
  if (answers.fulfillment !== 'ship' && m.local) {
    logistics.push(answers.location ? `Pickup in ${answers.location}.` : 'Local pickup available.');
  }
  if (answers.fulfillment !== 'local' && m.shipping) logistics.push('Shipping available.');
  if (answers.negotiable) logistics.push('Reasonable offers considered.');
  else logistics.push('Price is firm.');
  lines.push(logistics.join(' '));

  // Hashtags help search on these; elsewhere (e.g. Craigslist) they read as clutter.
  if (draft.tags.length && (id === 'poshmark' || id === 'mercari' || id === 'facebook')) {
    lines.push(draft.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '));
  }

  return { title, body: lines.filter(Boolean).join('\n\n') };
}

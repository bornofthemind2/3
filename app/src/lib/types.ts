export type Condition = 'new' | 'like_new' | 'good' | 'fair' | 'for_parts';

export type Fulfillment = 'local' | 'ship' | 'both';

export type Category =
  | 'electronics'
  | 'phones'
  | 'furniture'
  | 'appliances'
  | 'home_decor'
  | 'kitchen'
  | 'clothing'
  | 'shoes_bags'
  | 'toys_games'
  | 'sports_outdoors'
  | 'tools'
  | 'books_media'
  | 'collectibles'
  | 'baby_kids'
  | 'other';

export type MarketplaceId =
  | 'facebook'
  | 'ebay'
  | 'offerup'
  | 'craigslist'
  | 'mercari'
  | 'poshmark'
  | 'swappa'
  | 'nextdoor';

/** An item-specific question the AI asks after looking at the photos. */
export type FollowUpQuestion = {
  id: string;
  question: string;
  /** Suggested quick answers; the seller can also type their own. */
  options: string[];
};

/** What the AI (or the seller) believes the item is, before the questionnaire. */
export type Identification = {
  itemName: string;
  category: Category;
  brand: string;
  model: string;
  conditionGuess: Condition;
  bulky: boolean;
  priceLow: number;
  priceHigh: number;
  notes: string;
  followUps: FollowUpQuestion[];
};

export type Answers = {
  itemName: string;
  category: Category;
  brand: string;
  model: string;
  condition: Condition;
  age: string;
  defects: string;
  includes: string;
  dimensions: string;
  price: string;
  negotiable: boolean;
  fulfillment: Fulfillment;
  location: string;
  followUps: Record<string, string>;
};

export type Draft = {
  title: string;
  description: string;
  price: number;
  tags: string[];
};

export type PostStatus = {
  postedAt?: string;
  url?: string;
};

export type Listing = {
  id: string;
  createdAt: string;
  updatedAt: string;
  photos: string[];
  identification?: Identification;
  answers?: Answers;
  draft?: Draft;
  marketplaces: MarketplaceId[];
  posts: Partial<Record<MarketplaceId, PostStatus>>;
  sold?: boolean;
};

// Sportsbook catalogue.
//
//   bettable  — books you can place bets at (default set: books licensed in Virginia).
//               Opportunities only ever ask you to bet at books in your "My books" list.
//   sharp     — reference books used ONLY as the fair-value baseline for +EV. They are never
//               suggested as a leg (Pinnacle / Circa / Betfair aren't available in Virginia).
//   oddsApiKey — the bookmaker key used by The Odds API.
//   vig       — typical two-way margin, used by the simulator.
//
// Book availability changes — edit this list, or just tick the books you use in Settings.
export const BOOKS = [
  { id: 'draftkings', name: 'DraftKings', oddsApiKey: 'draftkings', bettable: true, vig: 0.048 },
  { id: 'fanduel', name: 'FanDuel', oddsApiKey: 'fanduel', bettable: true, vig: 0.045 },
  { id: 'betmgm', name: 'BetMGM', oddsApiKey: 'betmgm', bettable: true, vig: 0.05 },
  { id: 'caesars', name: 'Caesars', oddsApiKey: 'williamhill_us', bettable: true, vig: 0.05 },
  { id: 'fanatics', name: 'Fanatics', oddsApiKey: 'fanatics', bettable: true, vig: 0.05 },
  { id: 'bet365', name: 'bet365', oddsApiKey: 'bet365', bettable: true, vig: 0.045 },
  { id: 'espnbet', name: 'ESPN BET', oddsApiKey: 'espnbet', bettable: true, vig: 0.05 },
  { id: 'betrivers', name: 'BetRivers', oddsApiKey: 'betrivers', bettable: true, vig: 0.052 },
  { id: 'hardrock', name: 'Hard Rock Bet', oddsApiKey: 'hardrockbet', bettable: true, vig: 0.05 },
  { id: 'pinnacle', name: 'Pinnacle', oddsApiKey: 'pinnacle', sharp: true, vig: 0.022 },
  { id: 'circa', name: 'Circa Sports', oddsApiKey: 'circasports', sharp: true, vig: 0.028 },
  { id: 'betfair_ex', name: 'Betfair Exchange', oddsApiKey: 'betfair_ex_eu', sharp: true, vig: 0.02 },
];

export const bookById = Object.fromEntries(BOOKS.map((b) => [b.id, b]));
export const SHARP_BOOKS = BOOKS.filter((b) => b.sharp).map((b) => b.id);
export const DEFAULT_MY_BOOKS = BOOKS.filter((b) => b.bettable).map((b) => b.id);
export const fromOddsApiKey = Object.fromEntries(BOOKS.map((b) => [b.oddsApiKey, b.id]));

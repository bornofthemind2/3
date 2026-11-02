// Sportsbook catalogue. `sharp` books are used as the fair-value reference for +EV.
// `vig` is the typical two-way margin used by the simulator.
export const BOOKS = [
  { id: 'pinnacle', name: 'Pinnacle', sharp: true, vig: 0.022, region: 'eu' },
  { id: 'circa', name: 'Circa Sports', sharp: true, vig: 0.028, region: 'us' },
  { id: 'betonline', name: 'BetOnline', sharp: false, vig: 0.035, region: 'us' },
  { id: 'draftkings', name: 'DraftKings', sharp: false, vig: 0.048, region: 'us' },
  { id: 'fanduel', name: 'FanDuel', sharp: false, vig: 0.045, region: 'us' },
  { id: 'betmgm', name: 'BetMGM', sharp: false, vig: 0.05, region: 'us' },
  { id: 'caesars', name: 'Caesars', sharp: false, vig: 0.05, region: 'us' },
  { id: 'espnbet', name: 'ESPN BET', sharp: false, vig: 0.05, region: 'us' },
  { id: 'betrivers', name: 'BetRivers', sharp: false, vig: 0.052, region: 'us' },
  { id: 'fanatics', name: 'Fanatics', sharp: false, vig: 0.05, region: 'us' },
  { id: 'hardrock', name: 'Hard Rock Bet', sharp: false, vig: 0.05, region: 'us' },
  { id: 'bet365', name: 'bet365', sharp: false, vig: 0.045, region: 'eu' },
  { id: 'williamhill', name: 'William Hill', sharp: false, vig: 0.055, region: 'uk' },
  { id: 'unibet', name: 'Unibet', sharp: false, vig: 0.05, region: 'eu' },
  { id: 'betfair_ex', name: 'Betfair Exchange', sharp: true, vig: 0.02, region: 'uk' },
  { id: 'novig', name: 'Novig', sharp: false, vig: 0.015, region: 'us' },
];

export const bookById = Object.fromEntries(BOOKS.map((b) => [b.id, b]));
export const SHARP_BOOKS = BOOKS.filter((b) => b.sharp).map((b) => b.id);

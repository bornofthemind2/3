// Song library. Every song here is in the public domain (melody and lyrics),
// so the app ships with real, singable content and no licensing concerns.
//
// Each line is a list of tokens: `syllable|note|beats`
//   - a syllable ending in "-" joins the next syllable into one word
//   - "~" holds the previous syllable over a new note (a melisma)
//   - "_" is a rest: `_|beats`
//   - beats may be decimals or fractions ("2/3")

export const SONGS = [
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    artist: 'Traditional',
    key: 'C',
    bpm: 96,
    beatsPerBar: 4,
    pickup: 0,
    lines: [
      'Twin-|C4|1 kle|C4|1 twin-|G4|1 kle|G4|1 lit-|A4|1 tle|A4|1 star|G4|2',
      'How|F4|1 I|F4|1 won-|E4|1 der|E4|1 what|D4|1 you|D4|1 are|C4|2',
      'Up|G4|1 a-|G4|1 bove|F4|1 the|F4|1 world|E4|1 so|E4|1 high|D4|2',
      'Like|G4|1 a|G4|1 dia-|F4|1 mond|F4|1 in|E4|1 the|E4|1 sky|D4|2',
      'Twin-|C4|1 kle|C4|1 twin-|G4|1 kle|G4|1 lit-|A4|1 tle|A4|1 star|G4|2',
      'How|F4|1 I|F4|1 won-|E4|1 der|E4|1 what|D4|1 you|D4|1 are|C4|2',
    ],
  },
  {
    id: 'mary',
    title: 'Mary Had a Little Lamb',
    artist: 'Traditional',
    key: 'C',
    bpm: 108,
    beatsPerBar: 4,
    pickup: 0,
    lines: [
      'Ma-|E4|1 ry|D4|1 had|C4|1 a|D4|1 lit-|E4|1 tle|E4|1 lamb|E4|2',
      'lit-|D4|1 tle|D4|1 lamb|D4|2 lit-|E4|1 tle|G4|1 lamb|G4|2',
      'Ma-|E4|1 ry|D4|1 had|C4|1 a|D4|1 lit-|E4|1 tle|E4|1 lamb,|E4|1 its|E4|1',
      'fleece|D4|1 was|D4|1 white|E4|1 as|D4|1 snow|C4|4',
    ],
  },
  {
    id: 'rowboat',
    title: 'Row, Row, Row Your Boat',
    artist: 'Traditional',
    key: 'C',
    bpm: 66,
    beatsPerBar: 2,
    pickup: 0,
    lines: [
      'Row,|C4|1 row,|C4|1 row|C4|2/3 your|D4|1/3 boat|E4|1',
      'gent-|E4|2/3 ly|D4|1/3 down|E4|2/3 the|F4|1/3 stream|G4|2',
      'Mer-|C5|1/3 ri-|C5|1/3 ly|C5|1/3 mer-|G4|1/3 ri-|G4|1/3 ly|G4|1/3 mer-|E4|1/3 ri-|E4|1/3 ly|E4|1/3 mer-|C4|1/3 ri-|C4|1/3 ly|C4|1/3',
      'life|G4|2/3 is|F4|1/3 but|E4|2/3 a|D4|1/3 dream|C4|2',
    ],
  },
  {
    id: 'joyful',
    title: 'Joyful, Joyful (Ode to Joy)',
    artist: 'Beethoven / van Dyke',
    key: 'C',
    bpm: 112,
    beatsPerBar: 4,
    pickup: 0,
    lines: [
      'Joy-|E4|1 ful,|E4|1 joy-|F4|1 ful,|G4|1 we|G4|1 a-|F4|1 dore|E4|1 thee,|D4|1',
      'God|C4|1 of|C4|1 glo-|D4|1 ry,|E4|1 Lord|E4|1.5 of|D4|0.5 love!|D4|2',
      'Hearts|E4|1 un-|E4|1 fold|F4|1 like|G4|1 flow\'rs|G4|1 be-|F4|1 fore|E4|1 thee,|D4|1',
      'o-|C4|1 p\'ning|C4|1 to|D4|1 the|E4|1 sun|D4|1.5 a-|C4|0.5 bove.|C4|2',
      'Melt|D4|1 the|D4|1 clouds|E4|1 of|C4|1 sin|D4|1 and|E4|0.5 ~|F4|0.5 sad-|E4|1 ness,|C4|1',
      'drive|D4|1 the|E4|0.5 ~|F4|0.5 dark|E4|1 of|D4|1 doubt|C4|1 a-|D4|1 way!|G3|2',
      'Giv-|E4|1 er|E4|1 of|F4|1 im-|G4|1 mor-|G4|1 tal|F4|1 glad-|E4|1 ness,|D4|1',
      'fill|C4|1 us|C4|1 with|D4|1 the|E4|1 light|D4|1.5 of|C4|0.5 day!|C4|2',
    ],
  },
  {
    id: 'birthday',
    title: 'Happy Birthday',
    artist: 'Hill Sisters',
    key: 'C',
    bpm: 100,
    beatsPerBar: 3,
    pickup: 1,
    lines: [
      'Hap-|G4|0.75 py|G4|0.25 birth-|A4|1 day|G4|1 to|C5|1 you|B4|2',
      'Hap-|G4|0.75 py|G4|0.25 birth-|A4|1 day|G4|1 to|D5|1 you|C5|2',
      'Hap-|G4|0.75 py|G4|0.25 birth-|G5|1 day|E5|1 dear|C5|1 sing-|B4|1 er|A4|1',
      'Hap-|F5|0.75 py|F5|0.25 birth-|E5|1 day|C5|1 to|D5|1 you!|C5|3',
    ],
  },
  {
    id: 'jingle',
    title: 'Jingle Bells',
    artist: 'James Lord Pierpont',
    key: 'C',
    bpm: 132,
    beatsPerBar: 4,
    pickup: 0,
    lines: [
      'Jin-|E4|1 gle|E4|1 bells,|E4|2 jin-|E4|1 gle|E4|1 bells,|E4|2',
      'jin-|E4|1 gle|G4|1 all|C4|1.5 the|D4|0.5 way!|E4|4',
      'Oh|F4|1 what|F4|1 fun|F4|1.5 it|F4|0.5 is|F4|1 to|E4|1 ride|E4|1 in|E4|0.5 a|E4|0.5',
      'one-|E4|1 horse|D4|1 o-|D4|1 pen|E4|1 sleigh,|D4|2 hey!|G4|2',
      'Jin-|E4|1 gle|E4|1 bells,|E4|2 jin-|E4|1 gle|E4|1 bells,|E4|2',
      'jin-|E4|1 gle|G4|1 all|C4|1.5 the|D4|0.5 way!|E4|4',
      'Oh|F4|1 what|F4|1 fun|F4|1.5 it|F4|0.5 is|F4|1 to|E4|1 ride|E4|1 in|E4|0.5 a|E4|0.5',
      'one-|G4|1 horse|G4|1 o-|F4|1 pen|D4|1 sleigh!|C4|4',
    ],
  },
  {
    id: 'amazing',
    title: 'Amazing Grace',
    artist: 'John Newton',
    key: 'G',
    bpm: 84,
    beatsPerBar: 3,
    pickup: 1,
    lines: [
      'A-|D4|1 ma-|G4|2 zing|B4|0.5 ~|G4|0.5 grace,|B4|2 how|A4|1 sweet|G4|2 the|E4|1 sound|D4|2',
      'that|D4|1 saved|G4|2 a|B4|0.5 ~|G4|0.5 wretch|B4|2 like|A4|1 me!|D5|3 _|2',
      'I|B4|1 once|D5|2 was|B4|0.5 ~|G4|0.5 lost,|B4|2 but|A4|1 now|G4|2 am|E4|1 found,|D4|2',
      'was|D4|1 blind|G4|2 but|B4|0.5 ~|G4|0.5 now|B4|2 I|A4|1 see.|G4|3',
    ],
  },
]

export function getSong(id) {
  return SONGS.find((s) => s.id === id)
}

/** 1–3 star rating from vocal range and how fast the syllables come. */
export function songStars(parsed, song) {
  const range = (parsed.maxMidi - parsed.minMidi) / 12
  const rate = (parsed.notes.length / parsed.totalBeats) * (song.bpm / 60)
  const s = range + rate / 2
  return s < 1.5 ? 1 : s < 1.85 ? 2 : 3
}

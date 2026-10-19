# Snap & Sell

A mobile app for selling things around your home. You photograph an item, answer a few questions, and the app
writes a listing and helps you post it on the marketplaces that suit the item:

**Facebook Marketplace · eBay · OfferUp · Mercari · Craigslist · Poshmark · Swappa · Nextdoor**

```
app/      Expo (React Native, TypeScript) app for iOS and Android
server/   Small Node service that uses Claude to identify items from photos and write listings
```

## How it works

1. **Photos.** Take up to 10 photos with the camera or pick them from your library. Tap a photo to make it the
   cover; long-press to remove it.
2. **Identify (optional AI).** The app sends up to 4 resized photos to the server. Claude names the item, guesses
   brand/model/category/condition, estimates a used resale price range, flags bulky items, and suggests up to
   3 follow-up questions that only apply to that item (for example storage size, or whether it powers on).
3. **A few questions.** These come prefilled from step 2: what it is, brand/model, category, condition, age,
   flaws, what's included, size, any item-specific follow-ups, asking price and whether you'll take offers,
   pickup or shipping, and pickup area.
4. **Review.** Claude writes the title and description using only the facts you gave it. Without the server, a
   built-in template writes them instead. You can edit everything. The app picks the 3 marketplaces that fit
   best, based on category, size, and pickup/shipping, and you can change the selection.
5. **Post.** For each marketplace the app shortens the title to that site's limit and adds pickup, shipping,
   and offer lines (plus hashtags where they help). One tap saves the photos to your camera roll, copies the
   text, and opens the marketplace's new-listing page in its app or website. You mark each one as posted (and
   can paste the listing link), then mark the item sold when it's gone.

Listings, answers and photos are stored on the phone (AsyncStorage plus the app's document directory).

### Why the app doesn't post automatically

Facebook Marketplace, OfferUp, Mercari, Poshmark, Craigslist, Nextdoor and Swappa have no public API for
individual sellers to create listings, so the app gets everything ready and you paste it into each site. eBay
does have one: its Sell **Inventory API** (inventory item → offer → publish). It needs an eBay developer
account, user OAuth, and business policies. Adding it to the server is the next step toward one-tap eBay posting.

## Run it

### 1. Listing assistant server (optional but recommended)

Requires Node 22.18 or later and an [Anthropic API key](https://console.anthropic.com/).

```bash
cd server
npm install
cp .env.example .env      # set ANTHROPIC_API_KEY and a random APP_TOKEN
npm start                 # http://localhost:8787
npm test                  # API tests (stubbed, no Claude calls)
```

It uses `claude-opus-5-5` (override with `CLAUDE_MODEL`) with structured JSON output and server-side refusal
fallbacks enabled. Endpoints: `POST /identify` `{ images: [base64 JPEG] }`, `POST /compose`
`{ answers, identification }`, and `GET /health`.

### 2. Mobile app

```bash
cd app
npm install
cp .env.example .env      # EXPO_PUBLIC_API_URL = http://<your computer's LAN IP>:8787, token = APP_TOKEN
npx expo start            # scan the QR code with Expo Go, or press i / a for a simulator
```

Leave `EXPO_PUBLIC_API_URL` empty to use the app without AI.

Checks: `npx tsc --noEmit` and `npx expo lint`.

To ship to the App Store or Google Play, build with EAS (`npx eas-cli@latest build`). Put the server behind
HTTPS on a host of your choice first. Note that `APP_TOKEN` ships inside the app, so it only keeps out casual
abuse. For a public release, add real user accounts and per-user rate limits on the server.

---

_This repository also holds `Vue-Essentials-Cheat-Sheet.pdf`, a Vue.js cheat sheet._

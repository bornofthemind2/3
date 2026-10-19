import { createApp } from './app.ts';
import { compose, identify, ListingAssistantError } from './claude.ts';

const port = Number(process.env.PORT || 8787);
const token = process.env.APP_TOKEN || undefined;

if (!token) console.warn('APP_TOKEN is not set: anyone who can reach this server can use your Claude API key.');

createApp({
  identify,
  compose,
  token,
  publicMessage: (e) => (e instanceof ListingAssistantError ? e.message : undefined),
}).listen(port, () => {
  console.log(`Snap & Sell listing assistant on http://localhost:${port}`);
});

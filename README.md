# CardLedger

A sports card collection tracker. Tracks values, surfaces movers, computes gains/losses. Data lives in your browser (`localStorage`) — nothing is sent to a server.

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Deploy to GitHub + Vercel (~5 min)

### 1. Push to GitHub

Create a new empty repo on github.com (e.g. `cardledger`). Then in this folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cardledger.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project**
3. Import the `cardledger` repo
4. Vercel auto-detects Vite — just click **Deploy**
5. You'll get a URL like `cardledger-xyz.vercel.app`

That's it. Every `git push` will redeploy automatically.

## How it works

- **Add cards** with player, year, set, condition, parallel, purchase price/date
- **Log sale prices** over time (eBay, COMC, PWCC, Goldin, etc.) — the app builds a price history from your entries
- **Trends** are computed automatically: 7-day, 30-day, all-time % change
- **Movers tab** ranks biggest gainers/decliners over the last 30 days
- **Highest Value** flags your top cards in gold
- **Per-card detail** shows a price chart and full sale log

### Honest note on "live" prices

There's no free public API for live sports card sales, so this app doesn't auto-fetch prices. When you see a comp you care about (or buy/sell), log it — the app does all the trend math from there.

## Sharing with someone else

Each person who uses the deployed URL has their own collection (saved to their own browser's localStorage). You can give your friend the URL and their collection won't mix with yours, even on the same site.

If you want **completely separate deployments** (different URLs), see the `cardledger-share` folder for a duplicate project ready to deploy as a second Vercel app.

## Tech

- React 18 + Vite
- Tailwind CSS for layout, inline styles for the editorial color palette
- Recharts for price history charts
- Lucide icons
- Fonts: Fraunces (display), IBM Plex Sans (body), JetBrains Mono (numbers)

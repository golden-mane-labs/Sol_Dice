## Solana Dice Frontend (`satoshi-dice-main`)

Solana Dice is a **provably fair on-chain dice game on Solana**.  
This folder contains the main player-facing frontend, built with **Next.js App Router** and styled for a casino‑style experience.

### Tech stack

- **Framework**: Next.js (App Router, React)
- **Styling**: Tailwind-style utility classes + custom CSS in `globals.css`
- **State / data**: React hooks with REST APIs and WebSockets
- **QR**: `react-qrcode-logo` for deposit QR codes

## Getting started (local development)

- **Install dependencies**:

```bash
cd satoshi-dice-main
npm install
```

- **Run the dev server**:

```bash
npm run dev
```

- **Open the app** at `http://localhost:3000`.

- **Configure backend URL** (optional, defaults to `http://localhost:8000`):
  - Set `NEXT_PUBLIC_API_URL` in your env (e.g. `.env.local`)
  - Optionally set `NEXT_PUBLIC_WS_URL` if WebSocket endpoint differs

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## How to play the game

1. **Open the main page**
   - Go to `/` (home).  
   - The app fetches available wallets, bet limits, current SOL price, and game stats from the backend.

2. **Select your odds & multiplier**
   - Use the **multiplier selector** at the top:
     - Each option is a house wallet with a specific **multiplier** and **win chance**.
     - Higher multiplier ⇒ lower chance; lower multiplier ⇒ higher chance.
   - The slider and buttons update the selected multiplier and wallet address.

3. **Choose bet amount**
   - Use the **“Select Bet Amount”** panel on the left:
     - Type a value and pick **SOL** or **USD**.
     - Use quick buttons: **Min**, **1/2**, **x2**, **Max**.
   - The UI shows:
     - The SOL amount
     - The equivalent USD value using the live SOL price
     - The **min / max** allowed for the selected wallet.

4. **Review game info**
   - In the **Game Info** box:
     - **Roll Lower Than** → target threshold (0–65535) you must beat.
     - **Maximum Roll** → always 65535.
     - **Min Bet / Max Bet** → current bet limits in SOL for this wallet.

5. **Send SOL to play**
   - On the right, the **“Send SOL to Play”** panel shows:
     - A **QR code** (with the dice logo) for the selected wallet.
     - The **exact SOL amount** to send.
     - The **destination address** in text.
   - From your Solana wallet (Phantom, Solflare, etc.):
     - Scan the QR code or paste the address.
     - Enter the amount shown in the UI.
     - Confirm and send the transaction.

6. **See results & history**
   - The backend detects your deposit, evaluates the roll, and:
     - Sends a **payout transaction** if you win.
   - On the main page:
     - **Total Bets** shows global bet count.
     - **Recent Games** shows last few bets, updated via **WebSocket**.
   - Scroll down to see **All Bets History** (full paginated history with filters).
   - For full explanation and available games:
     - Go to `/rules` (rules + FAQ + available games).
   - To verify a specific game:
     - Go to `/fair?id=<GAME_ID>` for detailed **provably fair verification**.

## Frontend structure

### App routes (`src/app`)

- **`src/app/layout.js`**: Root layout, fonts, global wrappers.
- **`src/app/page.js`**: Main game UI:
  - Multiplier selection, bet slider, bet amount input (SOL/USD)
  - Wallet selection and QR code display
  - Game info (roll threshold, min/max bet)
  - Total bets and recent games (right-hand column)
  - Mounts `BettingHistory` and `Footer`.
- **`src/app/rules/page.js`**:
  - “Rules”, “FAQ”, and **Available Games** sections.
  - Fetches wallets and renders static‑style game options (min/max, odds, etc.).
- **`src/app/fair/page.js`**:
  - Provably fair page.
  - Shows:
    - Daily **server seed hashes** and plaintext (after publish).
    - When `?id=<bet_number>` is provided, detailed bet verification:
      - Bet amount & payout
      - Roll, outcome, server seed hash/plaintext
      - Deposit & payout txids with links to Solana Explorer.
- **`src/app/globals.css`**: Global styles and theme.

### Components (`src/components`)

- **`ClientOnly.js`**: Renders children only on the client to avoid hydration issues.
- **`navbar/index.js`**: Top navigation bar (links to main pages, brand, etc.).
- **`footer/index.js`**: Footer with site links / attribution.
- **`gameHistory/index.js`**:
  - Full **All Bets History** component.
  - Fetches recent bets and paginates client-side.
  - Filter tabs: **All / Wins / Big Wins / Rare Wins**.
  - WebSocket integration for live updates.

### Utilities (`src/utils`)

- **`api.js`**:
  - Central Axios client (`API_BASE_URL` from `NEXT_PUBLIC_API_URL`).
  - REST helpers:
    - `getAllWallets`, `getHouseInfo`, `getStats`, `getSolPrice`
    - `getRecentBets`, `getBetHistory`
    - Fairness helpers: `getFairnessSeeds`, `getBetDetails`, `getBetByNumber`
  - `getWebSocketUrl()`:
    - Builds WebSocket URL from `NEXT_PUBLIC_WS_URL` or `NEXT_PUBLIC_API_URL`.
- **`websocket.js`**:
  - Custom `useWebSocket` React hook used by:
    - Main page (price + recent bet updates)
    - Betting history (live refresh when new bet events arrive).

## Data flow & backend integration

- **HTTP (REST)**:
  - All data is fetched from the Solana Dice backend under `NEXT_PUBLIC_API_URL`.
  - Examples:
    - `/api/wallets/all` → available game wallets (multiplier, odds, bet ranges).
    - `/api/stats/house` → house info (min/max bet, network).
    - `/api/stats/game` → total bets, global stats.
    - `/api/bets/recent` and `/api/bets/history/...` → bet data.
    - `/api/fairness/seeds` / `/api/bet/verify` → provably fair info.

- **WebSockets**:
  - Connected via `getWebSocketUrl()` → `<WS_URL>/ws/bets`.
  - Streams:
    - New bet events (`type: "new_bet"`) used by main page and history.
    - Price updates (`type: "sol_price_update"`/`"btc_price_update"`).

## Notes for contributors

- **Do not change game rules in the frontend only** – rules are enforced on the backend; frontend is a visual/UI layer.
- When changing **API shapes**, update:
  - `src/utils/api.js` (helpers)
  - Call sites in:
    - `src/app/page.js`
    - `src/app/rules/page.js`
    - `src/app/fair/page.js`
    - `src/components/gameHistory/index.js`
- Keep “How to play” behavior on `/` consistent with explanatory copy on `/rules` and `/fair`.

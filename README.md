# Money Maze: a live Q&A game for your talk

The audience scans a QR code, types their name and a question, and turns into a **piggy bank** running around the
**Money Maze** on the projector. Piggy banks collect coins and "pay off" the **FEES / DEBT / INFLATION** blocks.
Every question unlocks one of the dashboard fundamentals (Budget, Cash flow, Revenue, Expenses, KPIs, Forecast).
When you put someone's question on screen they get +150 bonus points, and everyone who asks gets a badge they can share on LinkedIn.

| Page | Who uses it | URL |
|---|---|---|
| Ask page | Audience phones (the QR code) | `/` |
| Projector screen | Laptop connected to the projector | `/screen` |
| Host panel | You or a helper (phone or 2nd laptop) | `/host?key=…` |

## 1. Customize it

Edit [config.js](config.js): your name, the talk title, your LinkedIn URL, the "You are…" options, the 6 fundamentals, and the point values.

## 2. Run it on your laptop

```bash
npm install
npm start
```

The terminal prints three links. The **host key** changes each time you start the server. To keep it the same,
start with `HOST_KEY=mysecret npm start` (Git Bash) or `$env:HOST_KEY="mysecret"; npm start` (PowerShell).

## 3. Make it reachable from the audience's phones

Phones have to be able to reach your server. Pick one option:

**A. Same Wi‑Fi (easiest, but test it at the venue).** The QR code uses your laptop's Wi‑Fi IP, for example `http://10.0.0.39:3000`.
Many college and conference networks block phone-to-laptop traffic, so try it from your own phone in the room.
Windows may ask to allow Node.js through the firewall. Allow it on **Private** networks.

**B. Free tunnel (works on any network).** Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), then:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the `https://….trycloudflare.com` address it prints and restart the app with it:

```powershell
$env:PUBLIC_URL="https://your-tunnel.trycloudflare.com"; npm start
```

**C. Deploy it (most reliable).** Push this folder to GitHub and create a free **Web Service** on [Render](https://render.com)
(build command `npm install`, start command `npm start`, set the environment variable `HOST_KEY`). Render provides the
public URL automatically and the QR code uses it. Open the site a minute before your talk, because free services go to sleep when nobody is using them.

## 4. During the talk

1. On the projector laptop, open `/screen` and click **Fullscreen** (bottom right).
2. On your phone, or a helper's phone, open the host panel link. Click **Show on screen** on a question to display it.
   The asker gets +150 points, a gold ring around their piggy bank, and a "your question is on the big screen!" alert on their phone.
3. **Clear screen** puts the card away. **Hide** and **Delete** handle off-topic questions, and **Remove** takes a player out of the game.
4. **Reset everything** (host panel) wipes the board before your real session. Do this after testing!

Data is saved to `data/state.json`, so restarting the server keeps the game going.

## Safety built in
- Names are limited to 24 characters and questions to 280. A simple filter blocks common profanity.
- Each phone has to wait 15 seconds between questions.
- Questions **only** appear big on screen when you choose them. Names do appear in the maze automatically, so use **Remove** if someone enters a rude name the filter missed.

# Gmail Tracker Chrome Extension

Tracks when recipients open your Gmail emails using a tracking pixel.

## How it works

1. When you send an email, the extension appends a 1×1 invisible image linked to your tracker server
2. When the recipient opens the email (and loads images), the pixel fires → server logs the open
3. The popup shows **📤 Sent** or **👁 Opened** (+ open count)

> **Limitation:** Requires recipient's email client to load images. Many clients block images by default,
> so "no open" doesn't guarantee unread. True SMTP delivery confirmation is not available this way.

---

## Setup

### 1. Start the tracker server

```bash
cd server
npm install
npm start
# → http://localhost:3001
```

For production, deploy to [Railway](https://railway.app), [Render](https://render.com),
or [Fly.io](https://fly.io) (all have free tiers). Set `PORT` env var if needed.

### 2. Load the Chrome extension

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder

### 3. Configure the server URL

1. Open Gmail
2. Click the Gmail Tracker icon in the Chrome toolbar
3. Enter your server URL (e.g. `https://my-tracker.railway.app`)
4. Click **Save**

---

## Usage

- Compose an email in Gmail — you'll see **✦ Tracking** next to the Send button
- Send as normal; the extension intercepts the click and injects the pixel
- Open the extension popup to see status per email

---

## File structure

```
gmail-tracker/
├── extension/
│   ├── manifest.json     Extension config (MV3)
│   ├── content.js        Hooks Gmail compose + injects pixel
│   ├── background.js     Service worker (minimal)
│   ├── popup.html/js     Tracker popup UI
│   └── styles.css        Injected Gmail styles
└── server/
    ├── server.js         Express pixel + status API
    └── package.json
```

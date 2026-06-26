const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'emails.json');

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

app.use(cors()); // Allow Chrome extension + Gmail origins
app.use(express.json());

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

// --- Pixel endpoint: fires when recipient opens the email ---
app.get('/pixel/:id', (req, res) => {
  const { id } = req.params;
  const data = load();
  const now = Date.now();

  if (!data[id]) {
    data[id] = { firstOpenedAt: now, openedAt: [now] };
    console.log(`[FIRST OPEN] ${id}`);
  } else {
    data[id].openedAt.push(now);
    console.log(`[REOPEN x${data[id].openedAt.length}] ${id}`);
  }
  save(data);

  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache'
  });
  res.end(PIXEL);
});

// --- Single email status ---
app.get('/status/:id', (req, res) => {
  const { id } = req.params;
  const record = load()[id];
  if (!record) return res.json({ id, opened: false });
  res.json({
    id,
    opened: true,
    firstOpenedAt: record.firstOpenedAt,
    openCount: record.openedAt.length,
    lastOpenedAt: record.openedAt.at(-1)
  });
});

// --- Batch status check (called by popup) ---
app.post('/status/batch', (req, res) => {
  const { ids = [] } = req.body;
  const data = load();
  const results = ids.map(id => {
    const rec = data[id];
    if (!rec) return { id, opened: false };
    return {
      id,
      opened: true,
      firstOpenedAt: rec.firstOpenedAt,
      openCount: rec.openedAt.length,
      lastOpenedAt: rec.openedAt.at(-1)
    };
  });
  res.json({ results });
});

app.get('/health', (_, res) => res.json({ status: 'ok', emails: Object.keys(load()).length }));

app.listen(PORT, () => {
  console.log(`Gmail Tracker server → http://localhost:${PORT}`);
});

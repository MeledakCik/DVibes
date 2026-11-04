'use strict';

const cors = require('cors');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const ytdlp = require('./ytdlp');

// Keep the sidecar consistent with Next.js when it runs from the repo root.
// Values already present in the shell always win.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env.local'));
loadEnvFile(path.join(__dirname, '..', '.env'));

const app = express();
const PORT = Number(process.env.YTDLP_PORT || process.env.PORT || 8787);
const HOST = process.env.YTDLP_HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'accept']
  })
);
app.use(express.json({ limit: '16kb' }));

// Very small in-memory rate limiter. It protects the sidecar from accidental
// request storms; it is not meant as multi-tenant security.
const hits = new Map();
function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = hits.get(key) || { count: 0, resetAt: now + 60000 };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + 60000;
    }
    bucket.count += 1;
    hits.set(key, bucket);
    if (bucket.count > maxPerMinute) {
      return res.status(429).json({ ok: false, error: 'Too many requests, slow down a little.' });
    }
    return next();
  };
}

function fail(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

app.get('/health', async (_req, res) => {
  const ytdlpStatus = await ytdlp.status();
  res.json({
    ok: true,
    service: 'dvibes-ytdlp',
    ytdlp: ytdlpStatus,
    timestamp: Date.now()
  });
});

app.post('/api/extract', rateLimit(30), async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  const rawId = typeof req.body?.videoId === 'string' ? req.body.videoId : '';
  const videoId = ytdlp.extractVideoId(rawId) || ytdlp.extractVideoId(url);

  if (!videoId) {
    return fail(res, 400, 'Provide { url } or { videoId } for a YouTube video.');
  }

  try {
    const result = await ytdlp.extract(videoId);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[extract]', error instanceof Error ? error.message : error);
    return fail(res, 502, error instanceof Error ? error.message : 'yt-dlp extraction failed');
  }
});

app.get('/api/extract', rateLimit(30), async (req, res) => {
  const videoId = ytdlp.extractVideoId(String(req.query.id || req.query.url || ''));
  if (!videoId) return fail(res, 400, 'Pass ?id=<videoId> or ?url=<youtubeUrl>.');

  try {
    const result = await ytdlp.extract(videoId);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return fail(res, 502, error instanceof Error ? error.message : 'yt-dlp extraction failed');
  }
});

app.get('/api/search', rateLimit(20), async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40);

  if (!query) return fail(res, 400, 'Pass ?q=<search query>.');

  try {
    const tracks = await ytdlp.search(query, limit);
    return res.json({ ok: true, tracks, query, limit });
  } catch (error) {
    console.error('[search]', error instanceof Error ? error.message : error);
    return fail(res, 502, error instanceof Error ? error.message : 'yt-dlp search failed');
  }
});

app.get('/api/trending', rateLimit(20), async (req, res) => {
  const query = String(req.query.q || 'trending music').trim();

  try {
    const tracks = await ytdlp.search(query, 25);
    return res.json({ ok: true, tracks, query });
  } catch (error) {
    return fail(res, 502, error instanceof Error ? error.message : 'yt-dlp search failed');
  }
});

app.use((_req, res) => fail(res, 404, 'Not found'));

app.use((error, _req, res, _next) => {
  console.error('[server]', error);
  return fail(res, 500, 'Unexpected server error');
});

app.listen(PORT, HOST, () => {
  console.log(`[dvibes] yt-dlp sidecar listening on http://${HOST}:${PORT}`);
  ytdlp
    .status()
    .then((result) => {
      if (result.available) {
        console.log(`[dvibes] yt-dlp ready: ${result.version} (${result.binary})`);
      } else {
        console.warn(`[dvibes] yt-dlp not ready yet: ${result.error}`);
      }
    })
    .catch(() => undefined);
});

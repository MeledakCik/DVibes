'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';

let binaryPromise = null;
let versionCache = null;

function localBinaryPath() {
  return path.join(__dirname, 'bin', isWindows ? 'yt-dlp.exe' : 'yt-dlp');
}

async function isExecutable(file) {
  try {
    await fsp.access(file, isWindows ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function binaryVersion(binary) {
  const { stdout } = await execFileAsync(binary, ['--version'], {
    timeout: 10000,
    windowsHide: true
  });
  return stdout.trim();
}

async function findOnPath() {
  try {
    const version = await binaryVersion(isWindows ? 'yt-dlp.exe' : 'yt-dlp');
    versionCache = version;
    return isWindows ? 'yt-dlp.exe' : 'yt-dlp';
  } catch {
    return null;
  }
}

function releaseAsset() {
  if (isWindows) return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.arch === 'arm64') return 'yt-dlp_linux_aarch64';
  return 'yt-dlp_linux';
}

async function downloadBinary() {
  if (process.env.YTDLP_AUTO_DOWNLOAD === 'false') {
    throw new Error('yt-dlp is missing and YTDLP_AUTO_DOWNLOAD=false');
  }

  const target = localBinaryPath();
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const asset = releaseAsset();
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;

  console.log(`[ytdlp] downloading ${asset} from GitHub…`);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'dvibes-ytdlp-installer' }
  });

  if (!response.ok || !response.body) {
    throw new Error(`yt-dlp download failed (HTTP ${response.status})`);
  }

  const temp = `${target}.download`;
  await pipeline(
    Readable.fromWeb(response.body),
    fs.createWriteStream(temp)
  );

  if (!isWindows) await fsp.chmod(temp, 0o755);
  await fsp.rename(temp, target);
  versionCache = await binaryVersion(target);
  console.log(`[ytdlp] installed ${versionCache} at ${target}`);
  return target;
}

async function getBinary() {
  if (!binaryPromise) {
    binaryPromise = (async () => {
      const explicit = process.env.YTDLP_PATH && process.env.YTDLP_PATH.trim();
      if (explicit && (await isExecutable(explicit))) {
        versionCache = await binaryVersion(explicit);
        return explicit;
      }

      const local = localBinaryPath();
      if (await isExecutable(local)) {
        versionCache = await binaryVersion(local);
        return local;
      }

      const onPath = await findOnPath();
      if (onPath) return onPath;

      return downloadBinary();
    })().catch((error) => {
      binaryPromise = null;
      throw error;
    });
  }

  return binaryPromise;
}

function extraArgs() {
  const raw = process.env.YTDLP_EXTRA_ARGS && process.env.YTDLP_EXTRA_ARGS.trim();
  return raw ? raw.split(/\s+/).filter(Boolean) : [];
}

async function run(args, timeoutMs = 90000) {
  const binary = await getBinary();
  const { stdout, stderr } = await execFileAsync(binary, [...args, ...extraArgs()], {
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });

  if (stderr && /ERROR:/i.test(stderr)) {
    throw new Error(stderr.trim().split(/\r?\n/).slice(-3).join(' '));
  }

  return stdout;
}

function parseJson(stdout) {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    if (start === -1) throw new Error('yt-dlp returned invalid JSON');
    return JSON.parse(trimmed.slice(start));
  }
}

function pickFormat(info) {
  if (typeof info.url === 'string' && info.url.startsWith('http')) {
    return { url: info.url, ext: info.ext };
  }

  const candidates = [...(info.requested_formats || []), ...(info.formats || [])].filter(
    (format) => typeof format.url === 'string' && format.url.startsWith('http')
  );

  const audioOnly = candidates.filter(
    (format) =>
      format.acodec &&
      format.acodec !== 'none' &&
      (!format.vcodec || format.vcodec === 'none')
  );

  const pool = audioOnly.length ? audioOnly : candidates;
  pool.sort((a, b) => {
    const aM4a = String(a.ext || a.mimeType || '').includes('m4a') ? 1 : 0;
    const bM4a = String(b.ext || b.mimeType || '').includes('m4a') ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0);
  });

  return pool[0] || null;
}

function thumbnailFor(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

function extractVideoId(value) {
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value, 'https://www.youtube.com');
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[a-zA-Z0-9_-]{11}$/.test(last)) return last;
  } catch {
    // ignore
  }
  return null;
}

async function extract(videoId) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId || '')) {
    throw Object.assign(new Error('Invalid YouTube video id'), { status: 400 });
  }

  const stdout = await run(
    [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--socket-timeout',
      '20',
      '-f',
      'bestaudio[ext=m4a]/bestaudio/best',
      `https://www.youtube.com/watch?v=${videoId}`
    ],
    90000
  );

  const info = parseJson(stdout);
  const format = pickFormat(info);
  if (!format || !format.url) {
    throw new Error('yt-dlp returned no direct audio URL');
  }

  const id = extractVideoId(info.id) || extractVideoId(info.webpage_url) || videoId;
  const ext = format.ext || info.ext || 'm4a';

  return {
    videoId: id,
    audioUrl: format.url,
    title: (info.title || info.track || 'Untitled').trim(),
    artist: (info.artist || info.creator || info.uploader || info.channel || 'Unknown artist').trim(),
    thumbnail:
      (typeof info.thumbnail === 'string' && info.thumbnail.startsWith('http')
        ? info.thumbnail
        : (info.thumbnails || []).find((thumb) => thumb && String(thumb.url).startsWith('http'))?.url) ||
      thumbnailFor(id),
    duration: Number(info.duration) || 0,
    mimeType: ext === 'webm' ? 'audio/webm' : 'audio/mp4',
    provider: 'ytdlp',
    expiresAt: Date.now() + 60 * 60 * 1000
  };
}

async function search(query, limit = 25) {
  const stdout = await run(
    [
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-progress',
      '--socket-timeout',
      '20',
      `ytsearch${Math.min(limit, 40)}:${query}`
    ],
    90000
  );

  const parsed = parseJson(stdout);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

  return entries
    .map((entry) => {
      if (!entry) return null;
      const videoId = extractVideoId(entry.id) || extractVideoId(entry.url);
      if (!videoId) return null;
      const thumbs = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
      const thumbnail = thumbs.find((thumb) => thumb && String(thumb.url).startsWith('http'))?.url;
      return {
        videoId,
        title: (entry.title || 'Untitled').trim(),
        artist: (entry.uploader || entry.channel || 'Unknown artist').trim(),
        thumbnail: thumbnail || thumbnailFor(videoId),
        duration: Number(entry.duration) || 0
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

async function status() {
  try {
    const binary = await getBinary();
    const version = versionCache || (await binaryVersion(binary));
    versionCache = version;
    return { available: true, binary, version };
  } catch (error) {
    return {
      available: false,
      binary: null,
      version: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

module.exports = {
  getBinary,
  extract,
  search,
  status,
  extractVideoId,
  thumbnailFor
};

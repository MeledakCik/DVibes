import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { thumbnailFor, extractVideoId } from '@/lib/utils';
import type { ResolvedStream, Track } from '@/lib/types';

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';

let binaryPromise: Promise<string> | null = null;

function localBinaryPath(): string {
  return path.join(process.cwd(), 'server', 'bin', isWindows ? 'yt-dlp.exe' : 'yt-dlp');
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await fsp.access(file, isWindows ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function verifyBinary(file: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(file, ['--version'], { timeout: 10_000, windowsHide: true });
    return /\d{4}\.\d{2}\.\d{2}/.test(stdout) || stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function findOnPath(): Promise<string | null> {
  const command = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
  try {
    const { stdout } = await execFileAsync(command, ['--version'], { timeout: 10_000, windowsHide: true });
    if (stdout.trim()) return command;
  } catch {
    // not on PATH
  }
  return null;
}

function releaseAsset(): string {
  if (isWindows) return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.arch === 'arm64') return 'yt-dlp_linux_aarch64';
  return 'yt-dlp_linux';
}

async function downloadBinary(): Promise<string> {
  const target = localBinaryPath();
  if (await isExecutable(target)) return target;

  if (process.env.YTDLP_AUTO_DOWNLOAD === 'false') {
    throw new Error(
      'yt-dlp binary not found. Install it or set YTDLP_AUTO_DOWNLOAD=true / YTDLP_PATH.'
    );
  }

  await fsp.mkdir(path.dirname(target), { recursive: true });
  const asset = releaseAsset();
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'dvibes-ytdlp-installer' }
  });

  if (!response.ok || !response.body) {
    throw new Error(`Could not download yt-dlp (${response.status}) from ${url}`);
  }

  const temp = `${target}.download`;
  await pipeline(
    Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>),
    fs.createWriteStream(temp)
  );
  if (!isWindows) await fsp.chmod(temp, 0o755);
  await fsp.rename(temp, target);

  if (!(await verifyBinary(target))) {
    throw new Error('Downloaded yt-dlp binary could not be executed');
  }

  return target;
}

/**
 * Resolve a usable yt-dlp executable. Order: YTDLP_PATH, server/bin,
 * system PATH, then an automatic static build download.
 */
export async function getYtDlpBinary(): Promise<string> {
  if (!binaryPromise) {
    binaryPromise = (async () => {
      const explicit = process.env.YTDLP_PATH?.trim();
      if (explicit && (await isExecutable(explicit))) return explicit;

      const local = localBinaryPath();
      if (await isExecutable(local)) return local;

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

function extraArgs(): string[] {
  const raw = process.env.YTDLP_EXTRA_ARGS?.trim();
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

async function runYtDlp(args: string[], timeoutMs = 60_000): Promise<string> {
  const binary = await getYtDlpBinary();
  const { stdout } = await execFileAsync(binary, [...args, ...extraArgs()], {
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });
  return stdout;
}

interface YtDlpFormat {
  url?: string;
  ext?: string;
  acodec?: string;
  vcodec?: string;
  abr?: number;
  tbr?: number;
  mimeType?: string;
}

interface YtDlpInfo {
  id?: string;
  title?: string;
  track?: string;
  artist?: string;
  creator?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
  url?: string;
  ext?: string;
  formats?: YtDlpFormat[];
  requested_formats?: YtDlpFormat[];
  webpage_url?: string;
  original_url?: string;
}

interface YtDlpSearchEntry {
  id?: string;
  url?: string;
  title?: string;
  duration?: number;
  uploader?: string;
  channel?: string;
  thumbnails?: Array<{ url?: string }>;
}

interface YtDlpSearchResult {
  entries?: Array<YtDlpSearchEntry | null>;
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    if (start >= 0) {
      return JSON.parse(trimmed.slice(start));
    }
    throw new Error('yt-dlp returned invalid JSON');
  }
}

function pickFormat(info: YtDlpInfo): YtDlpFormat | null {
  if (info.url?.startsWith('http')) {
    return { url: info.url, ext: info.ext };
  }

  const candidates = [...(info.requested_formats ?? []), ...(info.formats ?? [])].filter(
    (format) => format.url?.startsWith('http')
  );

  const audioOnly = candidates.filter(
    (format) => format.acodec && format.acodec !== 'none' && (!format.vcodec || format.vcodec === 'none')
  );

  const pool = audioOnly.length ? audioOnly : candidates;
  pool.sort((a, b) => {
    const aM4a = (a.ext || a.mimeType || '').includes('m4a') ? 1 : 0;
    const bM4a = (b.ext || b.mimeType || '').includes('m4a') ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0);
  });

  return pool[0] ?? null;
}

export async function extractDirect(videoId: string): Promise<ResolvedStream> {
  const args = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--socket-timeout',
    '15',
    '-f',
    'bestaudio[ext=m4a]/bestaudio/best',
    `https://www.youtube.com/watch?v=${videoId}`
  ];

  const stdout = await runYtDlp(args, 60_000);
  const info = parseJsonOutput(stdout) as YtDlpInfo;
  const format = pickFormat(info);

  if (!format?.url) {
    throw new Error('yt-dlp did not return a direct audio URL');
  }

  const id = extractVideoId(info.id) || extractVideoId(info.webpage_url) || videoId;
  const ext = format.ext || info.ext || 'm4a';

  return {
    videoId: id,
    audioUrl: format.url,
    title: info.title?.trim() || info.track?.trim() || 'Untitled',
    artist:
      info.artist?.trim() ||
      info.creator?.trim() ||
      info.uploader?.trim() ||
      info.channel?.trim() ||
      'Unknown artist',
    thumbnail:
      info.thumbnail?.startsWith('http') ||
      info.thumbnails?.some((thumb) => thumb.url?.startsWith('http'))
        ? info.thumbnail || info.thumbnails?.find((thumb) => thumb.url?.startsWith('http'))?.url || ''
        : thumbnailFor(id),
    duration: Number(info.duration) || 0,
    provider: 'ytdlp',
    expiresAt: Date.now() + 60 * 60 * 1000,
    mimeType: ext === 'webm' ? 'audio/webm' : 'audio/mp4'
  };
}

export async function searchDirect(query: string, limit = 25): Promise<Track[]> {
  const args = [
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
    '--no-progress',
    '--socket-timeout',
    '15',
    `ytsearch${Math.min(limit, 40)}:${query}`
  ];

  const stdout = await runYtDlp(args, 60_000);
  const parsed = parseJsonOutput(stdout) as YtDlpSearchResult;
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

  return entries
    .map((entry): Track | null => {
      if (!entry) return null;
      const videoId = extractVideoId(entry.id) || extractVideoId(entry.url);
      if (!videoId) return null;
      const thumbnail = entry.thumbnails?.find((thumb) => thumb.url?.startsWith('http'))?.url;
      return {
        videoId,
        title: entry.title?.trim() || 'Untitled',
        artist: entry.uploader?.trim() || entry.channel?.trim() || 'Unknown artist',
        thumbnail: thumbnail || thumbnailFor(videoId),
        duration: Number(entry.duration) || 0,
        source: 'ytdlp'
      };
    })
    .filter((track): track is Track => !!track)
    .slice(0, limit);
}

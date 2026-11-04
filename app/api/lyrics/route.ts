import type { NextRequest } from 'next/server';
import { getLyrics, LyricsNotFoundError } from '@/lib/api/lyrics';
import { errorAttempts, fail, logProviderFailure, ok } from '@/lib/api/route-utils';
import { isYouTubeVideoId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get('id')?.trim() ?? '';
  const title = params.get('title')?.trim() ?? '';
  const artist = params.get('artist')?.trim() ?? '';
  const duration = Number(params.get('duration') || 0);

  if (!id) {
    return fail('MISSING_VIDEO_ID', 'Pass ?id=<youtube-video-id>', 400);
  }

  if (!isYouTubeVideoId(id)) {
    return fail('INVALID_VIDEO_ID', 'That is not a valid YouTube video id', 400);
  }

  if (!title) {
    return fail('MISSING_TITLE', 'Pass ?title=<track title>', 400);
  }

  if (title.length > 200 || artist.length > 200) {
    return fail('TITLE_TOO_LONG', 'Track titles and artists must be 200 characters or fewer', 400);
  }

  try {
    const payload = await getLyrics({
      videoId: id,
      title,
      artist,
      duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      refresh: params.get('refresh') === '1'
    });
    return ok(payload);
  } catch (error) {
    if (error instanceof LyricsNotFoundError) {
      return fail('NO_LYRICS', error.message, 404, error.attempts);
    }

    logProviderFailure('lyrics', error);
    return fail(
      'LYRICS_FAILED',
      'LRCLIB and lyrics.ovh could not be reached. Retry in a moment.',
      502,
      errorAttempts(error)
    );
  }
}

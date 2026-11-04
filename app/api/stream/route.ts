import type { NextRequest } from 'next/server';
import { resolveStream } from '@/lib/api/resolver';
import { fail, logProviderFailure, ok } from '@/lib/api/route-utils';
import { isYouTubeVideoId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim() ?? '';

  if (!id) {
    return fail('MISSING_VIDEO_ID', 'Pass ?id=<youtube-video-id>', 400);
  }

  if (!isYouTubeVideoId(id)) {
    return fail('INVALID_VIDEO_ID', 'That is not a valid YouTube video id', 400);
  }

  try {
    const force = request.nextUrl.searchParams.get('refresh') === '1';
    const { stream, cached } = await resolveStream(id, { force });
    return ok({ ...stream, cached });
  } catch (error) {
    logProviderFailure('stream', error);
    const attempts =
      error && typeof error === 'object' && 'attempts' in error
        ? ((error as { attempts?: unknown }).attempts as string[] | undefined)
        : undefined;

    return fail(
      'STREAM_RESOLUTION_FAILED',
      'This track could not be resolved by Piped, Invidious, or yt-dlp. Retry — mirrors rotate often.',
      502,
      attempts
    );
  }
}

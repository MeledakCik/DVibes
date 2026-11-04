import type { NextRequest } from 'next/server';
import { discoverCatalog } from '@/lib/api/catalog';
import { errorAttempts, fail, logProviderFailure, ok } from '@/lib/api/route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const requestedRegion = request.nextUrl.searchParams.get('region')?.toUpperCase();
  const region =
    requestedRegion && /^[A-Z]{2}$/.test(requestedRegion)
      ? requestedRegion
      : (process.env.TRENDING_REGION || 'US').toUpperCase();

  try {
    const data = await discoverCatalog(region, 30);
    return ok(data);
  } catch (error) {
    logProviderFailure('trending', error);
    return fail(
      'DISCOVERY_FAILED',
      'Could not load the music feed. Retry to try another API instance.',
      502,
      errorAttempts(error)
    );
  }
}

import type { NextRequest } from 'next/server';
import { searchCatalog } from '@/lib/api/catalog';
import { errorAttempts, fail, logProviderFailure, ok } from '@/lib/api/route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (!query) {
    return fail('MISSING_QUERY', 'Add a search query, for example ?q=lofi', 400);
  }

  if (query.length > 120) {
    return fail('QUERY_TOO_LONG', 'Search queries must be 120 characters or fewer', 400);
  }

  try {
    const data = await searchCatalog(query, 40);
    return ok(data);
  } catch (error) {
    logProviderFailure('search', error);
    return fail(
      'SEARCH_FAILED',
      'No search provider responded. Check your connection or retry in a moment.',
      502,
      errorAttempts(error)
    );
  }
}

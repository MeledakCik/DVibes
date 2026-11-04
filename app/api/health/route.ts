import { checkBackend } from '@/lib/api/ytdlp-client';
import { getPipedInstances } from '@/lib/api/instances';
import { getConfiguredInvidiousInstances } from '@/lib/api/invidious';
import { ok } from '@/lib/api/route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const backend = await checkBackend();

  return ok({
    status: 'ok',
    layers: {
      piped: { configured: getPipedInstances().length },
      invidious: { configured: getConfiguredInvidiousInstances().length },
      ytdlp: backend
    },
    timestamp: Date.now()
  });
}

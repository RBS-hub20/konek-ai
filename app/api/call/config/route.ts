import { getBrain, getBusinessForRead, listSkills, safe } from '@/lib/server/tenant';
import { buildCallPrompt, buildOpener } from '@/lib/ai/callPrompt';
import { vibeConfig } from '@/lib/ai/vibes';
import { languageConfig, languageToKey } from '@/lib/ai/languages';
import { vibeToKey } from '@/lib/types2';
import { env } from '@/lib/env';
import { timingSafeEqual } from '@/lib/server/operator';
import { fail, handle } from '@/lib/server/http';
import type { BusinessBrain, SkillRecord } from '@/lib/types2';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/call/config?businessId=&vibe=&language=&customerName=
 *
 * The media bridge calls this the moment a call connects, to fetch the system
 * prompt, opener and voice settings for that tenant. Machine-to-machine, so it
 * requires the x-konek-key header — never reachable from a browser.
 */
export async function GET(req: Request) {
  if (env.apiSecret) {
    const key = req.headers.get('x-konek-key') ?? '';
    if (!key || !timingSafeEqual(key, env.apiSecret)) {
      return fail('Missing or invalid x-konek-key.', 401);
    }
  }

  const p = new URL(req.url).searchParams;
  return handle(async () => {
    const { business } = await getBusinessForRead(p.get('businessId'));
    const vibe = vibeToKey(p.get('vibe') ?? business.active_vibe);
    const language = languageToKey(p.get('language') ?? business.language);
    const customerName = p.get('customerName') || null;

    const brain = await safe<BusinessBrain | null>(() => getBrain(business.id), null);
    const allSkills = await safe<SkillRecord[]>(() => listSkills(business.id), []);
    const skills = allSkills.filter((s) => s.is_active);

    const v = vibeConfig(vibe);
    const lang = languageConfig(language);

    return {
      business: { id: business.id, name: business.name },
      vibe,
      language,
      bcp47: lang.bcp47,
      /* Hint for the realtime voice; the bridge maps it to a provider voice. */
      voiceStyle: v.label,
      systemPrompt: buildCallPrompt({ business, brain, skills, vibe, language, customerName }),
      opener: buildOpener(business, brain, vibe, customerName, language),
      skillsUsed: skills.map((s) => s.id),
      goal: brain?.goal ?? 'Book',
    };
  });
}

import { getBrain, getBusinessForRead, getScript, listSkills, safe } from '@/lib/server/tenant';
import { renderScript } from '@/lib/types2';
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

    /* An outbound sales call follows a written script rather than improvising,
       which is most of what makes it understandable on a phone line. */
    const scriptId = p.get('scriptId');
    const script = scriptId ? await safe(() => getScript(scriptId), null) : null;
    const vars = {
      company: p.get('company') ?? '',
      contact: p.get('contact') ?? customerName ?? '',
      industry: p.get('industry') ?? '',
    };

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
      systemPrompt: script
        ? scriptPrompt(script, vars, language)
        : buildCallPrompt({ business, brain, skills, vibe, language, customerName }),
      opener: script
        ? renderScript(
            (language === 'TAGLISH' || language === 'TL'
              ? script.script_steps.find((s) => s.step === 'opener')?.text_ph
              : script.script_steps.find((s) => s.step === 'opener')?.text_ae) ?? '',
            vars
          ) || buildOpener(business, brain, vibe, customerName, language)
        : buildOpener(business, brain, vibe, customerName, language),
      script: script
        ? { id: script.id, name: script.name, voice_settings: script.voice_settings }
        : null,
      /* The bridge slows the voice to this. */
      speed: script?.voice_settings?.speed ?? null,
      skillsUsed: skills.map((s) => s.id),
      goal: brain?.goal ?? 'Book',
      /* When on, the bridge mirrors whatever language the caller uses. */
      autoLanguage: business.auto_language !== false,
    };
  });
}

/**
 * Turns a script into instructions the agent follows verbatim.
 *
 * Verbatim matters: the caller could not understand an improvised pitch, and a
 * written line with short sentences and full stops where a person breathes is
 * what fixes that.
 */
function scriptPrompt(
  script: { name: string; script_steps: { step: string; text_ph: string; text_ae: string; pause_ms: number }[] },
  vars: Record<string, string>,
  language: string
): string {
  const ph = language === 'TAGLISH' || language === 'TL';
  const lines = script.script_steps.map((s) => {
    const text = renderScript((ph ? s.text_ph : s.text_ae) || s.text_ph, vars);
    return `### ${s.step.toUpperCase()}\n${text}`;
  });

  return [
    'You are Cindy, calling on behalf of KONEK AI. You are on a live phone call.',
    `## SCRIPT — ${script.name}\nSay these lines close to word for word, in order. They are written to be understood on a phone line; do not improvise around them.\n\n${lines.join('\n\n')}`,
    '## HOW TO RUN IT\n' +
      '- Deliver one step, then stop and let them answer. Never run two steps together.\n' +
      '- If they answer a question, respond briefly in their words, then continue from where you were.\n' +
      '- Speak slowly and finish every word. This is a phone line, not a podcast.\n' +
      '- If they say they cannot hear or understand you, slow down further and repeat the last line more simply.\n' +
      '- If they are not interested, thank them and end the call politely. Do not push.',
    '## RULES\n- Never invent prices or claims beyond the script.\n- If asked something the script does not cover, say a colleague will confirm.',
  ].join('\n\n');
}

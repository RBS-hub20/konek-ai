import type { BrainRow, BusinessRow, CustomSkillRow, SkillRow } from '@/lib/types';

/* How each vibe should sound. Fed to the voice model and the dialogue model. */
export const VIBE_PROMPTS: Record<string, { style: string; voice: string }> = {
  'PRO CLOSER': {
    style:
      'Direct, confident, executive. No filler words. Handle objections head-on and always drive to a decision before the call ends.',
    voice: 'confident',
  },
  'FRIENDLY TITO': {
    style:
      'Warm, familiar, trusted — like a friendly Filipino uncle. Natural Taglish is welcome. Build rapport before asking for anything.',
    voice: 'warm',
  },
  'GEN-Z HYPE': {
    style:
      'Fast, playful, high energy. Short sentences. Enthusiastic but never pushy or cringe.',
    voice: 'energetic',
  },
  'CALM CARE': {
    style:
      'Gentle, patient, reassuring. Slower pace. Never rush the customer and always give them room to think.',
    voice: 'calm',
  },
};

export const DEFAULT_VIBE = 'PRO CLOSER';

const GOAL_PROMPTS: Record<string, string> = {
  explain: 'Your goal on this call is to ANSWER questions and educate. Do not push for a sale.',
  book: 'Your goal on this call is to BOOK an appointment before hanging up.',
  close: 'Your goal on this call is to CLOSE the sale on this call.',
};

export interface PromptInput {
  business: Pick<BusinessRow, 'name' | 'what_you_sell' | 'price' | 'goal'> | null;
  vibe: string;
  skills: Pick<SkillRow, 'id' | 'name' | 'system_prompt'>[];
  customSkills?: Pick<CustomSkillRow, 'name' | 'trigger_type' | 'trigger_value' | 'system_prompt' | 'description'>[];
  brain?: Pick<BrainRow, 'content' | 'source_name'>[];
}

/**
 * Assembles the single system prompt the voice agent runs on:
 * identity → vibe → goal → active skills → custom skills → business brain → guardrails.
 */
export function buildSystemPrompt({
  business,
  vibe,
  skills,
  customSkills = [],
  brain = [],
}: PromptInput): string {
  const v = VIBE_PROMPTS[vibe] ?? VIBE_PROMPTS[DEFAULT_VIBE];
  const name = business?.name ?? 'this business';
  const parts: string[] = [];

  parts.push(
    `You are Kai, an AI voice agent calling on behalf of ${name}. You are on a live phone call with a real customer. Speak naturally, one thought at a time, and never mention that you are an AI unless you are asked directly.`
  );

  parts.push(`## VOICE & TONE\n${v.style}`);

  if (business?.what_you_sell) {
    parts.push(
      `## WHAT ${name.toUpperCase()} SELLS\n${business.what_you_sell}${
        business.price ? `\nPrice range: ${business.price}. Never quote outside this range.` : ''
      }`
    );
  }

  if (business?.goal && GOAL_PROMPTS[business.goal]) {
    parts.push(`## GOAL\n${GOAL_PROMPTS[business.goal]}`);
  }

  if (skills.length) {
    parts.push(
      `## ACTIVE SKILLS\nYou have these skills switched on. Apply them when their trigger occurs.\n\n` +
        skills.map((s) => `### ${s.name}\n${s.system_prompt}`).join('\n\n')
    );
  }

  if (customSkills.length) {
    parts.push(
      `## CUSTOM SKILLS\nRules this business wrote for you. They take priority over the general skills above.\n\n` +
        customSkills
          .map((c) => {
            const trigger = [c.trigger_type, c.trigger_value].filter(Boolean).join(' ');
            const body = c.system_prompt || c.description || '';
            return `### ${c.name}\n${trigger ? `Trigger: ${trigger}\n` : ''}${body}`;
          })
          .join('\n\n')
    );
  }

  if (brain.length) {
    parts.push(
      `## BUSINESS BRAIN\nThe ONLY facts you may state about this business. If something is not here, say you do not want to guess and that a team member will confirm.\n\n` +
        brain.map((b) => `[${b.source_name ?? 'knowledge'}] ${b.content}`).join('\n\n')
    );
  }

  parts.push(
    `## RULES\n- Never invent prices, availability, policies or medical/legal advice.\n- If the customer asks to be removed or says stop calling, apologise once, confirm they are opted out, and end the call.\n- Keep replies under three sentences unless asked for detail.\n- If the customer sounds distressed or angry, drop the sales goal and offer a human callback.`
  );

  return parts.join('\n\n');
}

/** Maps a KONEK vibe onto a Cartesia voice style. */
export function vibeToVoiceStyle(vibe: string): string {
  return (VIBE_PROMPTS[vibe] ?? VIBE_PROMPTS[DEFAULT_VIBE]).voice;
}

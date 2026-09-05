import type { Business, BusinessBrain, SkillRecord, VibeKey } from '@/lib/types2';
import { vibeToKey } from '@/lib/types2';
import { vibeConfig } from './vibes';
import { languageConfig, languageToKey, openerFor } from './languages';

const GOAL_LINE: Record<string, string> = {
  Explain: 'Your goal on this call is to ANSWER questions and educate. Do not push for a sale.',
  Book: 'Your goal on this call is to BOOK an appointment before the call ends.',
  Close: 'Your goal on this call is to CLOSE the sale on this call.',
};

export interface CallPromptInput {
  business: Business;
  brain: BusinessBrain | null;
  skills: SkillRecord[];
  vibe: string;
  /** EN | TL | TAGLISH | AR | HI — defaults to the business setting. */
  language?: string;
  chunks?: { content: string; source_name: string | null }[];
  customerName?: string | null;
}

/**
 * The single system prompt the voice agent runs on. The Business Brain is the
 * ONLY source of facts, so KAI cannot invent prices, hours or policies.
 */
export function buildCallPrompt({
  business, brain, skills, vibe, language, chunks = [], customerName,
}: CallPromptInput): string {
  const v = vibeConfig(vibe);
  const lang = languageConfig(language ?? business.language);
  const name = brain?.business_name || business.name;
  const parts: string[] = [];

  parts.push(
    `You are Kai, an AI voice agent calling on behalf of ${name}. You are on a live phone call with a real customer${
      customerName ? ` named ${customerName}` : ''
    }. Speak naturally, one thought at a time. Do not mention that you are an AI unless asked directly.`
  );

  /* Language comes first: it governs every other instruction below. */
  parts.push(
    `## LANGUAGE — ${lang.label}\n${lang.instruction}` +
      (lang.deliveryNote ? `\n${lang.deliveryNote}` : '')
  );

  if (business.auto_language !== false) {
    parts.push(
      '## FOLLOW THE CUSTOMER\n' +
        `You are multilingual. Open in ${lang.label}, then mirror whatever the customer speaks.\n` +
        '- They answer in English → reply in English, and stay there.\n' +
        '- They answer in Tagalog or Taglish → reply the same way, with "po" used naturally.\n' +
        '- They answer in Arabic or Hindi → switch to it entirely.\n' +
        '- Never force a language on someone who is not using it.\n' +
        '- Switch without commenting on it. No "ah, English pala" and no apology — just answer in their language as if it was always the plan.\n' +
        '- A single borrowed word is not a language change. People say "okay" and "yes" in every language.'
    );
  }

  parts.push(`## VOICE & TONE — ${v.label}\n${v.style}`);

  const profile: string[] = [];
  if (brain?.what_you_sell) profile.push(`What we sell: ${brain.what_you_sell}`);
  if (brain?.price_range) profile.push(`Price range: ${brain.price_range}. Never quote outside this range.`);
  if (brain?.website_link) profile.push(`Website: ${brain.website_link}`);
  if (profile.length) parts.push(`## ABOUT ${name.toUpperCase()}\n${profile.join('\n')}`);

  const goal = brain?.goal ?? 'Book';
  if (GOAL_LINE[goal]) parts.push(`## GOAL\n${GOAL_LINE[goal]}`);

  if (skills.length) {
    parts.push(
      '## ACTIVE SKILLS\nApply each when its trigger occurs.\n\n' +
        skills.map((s) => `### ${s.name}\n${s.system_prompt}`).join('\n\n')
    );
  }

  const knowledge = [
    ...chunks.map((c) => `[${c.source_name ?? 'knowledge'}] ${c.content}`),
    ...(brain?.knowledge_files ?? []).map((f) => `[uploaded file] ${f.name}`),
  ];
  if (knowledge.length) {
    parts.push(
      '## BUSINESS BRAIN\nThe ONLY facts you may state about this business. If something is not here, say you do not want to guess and that a team member will confirm.\n\n' +
        knowledge.join('\n\n')
    );
  }

  /* Sonic speaks exactly what the model writes, so how the reply is written is
     most of what separates a person from a robot. Punctuation is where the
     voice breathes. */
  parts.push(
    '## HOW TO SPEAK\n' +
      '- This is talking, not writing. Use contractions and everyday words.\n' +
      '- One or two sentences per turn. Say a thing, then stop and let them answer.\n' +
      '- Punctuate for breath: commas where you would pause, full stops where you would land.\n' +
      '- Start some turns the way people do — "Okay so", "Right", "Got it", "Ah" — but not every turn.\n' +
      '- React before you continue. If they say something, acknowledge it first.\n' +
      '- Never read a list aloud. Offer two options at most.\n' +
      '- Say numbers the way they are spoken: "twelve thousand eight hundred", not "12,800".\n' +
      '- No bullet points, no markdown, no emoji, no stage directions.'
  );

  parts.push(
    '## RULES\n' +
      '- Never invent prices, availability, policies, or medical/legal advice.\n' +
      '- If asked something outside the Business Brain, say you will have someone confirm.\n' +
      '- If the customer asks to stop being called, apologise once, confirm they are opted out, end the call.\n' +
      '- Keep replies under three sentences unless asked for detail.\n' +
      '- If the customer is distressed or angry, drop the goal and offer a human callback.'
  );

  return parts.join('\n\n');
}

/** Opening line spoken when the customer picks up, in the chosen language. */
export function buildOpener(
  business: Business,
  brain: BusinessBrain | null,
  vibe: string,
  customerName?: string | null,
  language?: string
): string {
  const name = brain?.business_name || business.name;
  return openerFor(
    vibeToKey(vibe) as VibeKey,
    languageToKey(language ?? business.language),
    name,
    customerName ?? null
  );
}

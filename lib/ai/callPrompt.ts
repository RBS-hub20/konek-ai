import type { Business, BusinessBrain, SkillRecord } from '@/lib/types2';
import { vibeConfig } from './vibes';

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
  chunks?: { content: string; source_name: string | null }[];
  customerName?: string | null;
}

/**
 * The single system prompt the voice agent runs on. The Business Brain is the
 * ONLY source of facts, so KAI cannot invent prices, hours or policies.
 */
export function buildCallPrompt({
  business, brain, skills, vibe, chunks = [], customerName,
}: CallPromptInput): string {
  const v = vibeConfig(vibe);
  const name = brain?.business_name || business.name;
  const parts: string[] = [];

  parts.push(
    `You are Kai, an AI voice agent calling on behalf of ${name}. You are on a live phone call with a real customer${
      customerName ? ` named ${customerName}` : ''
    }. Speak naturally, one thought at a time. Do not mention that you are an AI unless asked directly.`
  );

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

/** Opening line spoken when the customer picks up. */
export function buildOpener(business: Business, brain: BusinessBrain | null, vibe: string, customerName?: string | null): string {
  const v = vibeConfig(vibe);
  const name = brain?.business_name || business.name;
  const who = customerName ? `${customerName}, ` : '';
  switch (v.label) {
    case 'FRIENDLY TITO':
      return `Hello po ${who}si Kai ito from ${name}. Kumusta po kayo? May quick question lang po ako, okay lang po ba?`;
    case 'GEN-Z HYPE':
      return `Hey ${who}it's Kai from ${name}! Got like thirty seconds? I've got something you're gonna want to hear.`;
    case 'CALM CARE':
      return `Hi ${who}this is Kai calling from ${name}. I hope I'm not catching you at a bad time — do you have a moment?`;
    default:
      return `Hi ${who}this is Kai from ${name}. I'll be quick — do you have a moment?`;
  }
}

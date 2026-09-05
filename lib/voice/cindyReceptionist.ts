import { renderScript, stepText, type OutboundScript } from '@/lib/types2';

/* ═══════════════════════════════════════════════════════════════════
   Cindy on an outbound call.

   The script is her material, not her lines. Reading it verbatim is
   what made her sound like a recording; improvising without it is what
   made her unintelligible. She works from it, in order, one beat at a
   time, in her own words.

   The language is decided before she speaks — by the lead's country —
   and never mentioned. "Ah, Tagalog po pala" is the exact failure this
   is written to prevent.
   ═══════════════════════════════════════════════════════════════════ */

export interface ReceptionistInput {
  script: OutboundScript | null;
  company?: string | null;
  contact?: string | null;
  industry?: string | null;
  /** PH | AE | … — decides the language, and is never announced. */
  country?: string | null;
}

export function languageModeFor(
  script: OutboundScript | null,
  country?: string | null
): 'PH-direct' | 'AE-direct' {
  const declared = script?.voice_settings?.language_mode;
  if (declared) return declared;
  return (country ?? '').toUpperCase() === 'PH' ? 'PH-direct' : 'AE-direct';
}

/** 0.88 carries Taglish on a phone line; Gulf English sits slightly faster. */
export function speedFor(script: OutboundScript | null, mode: 'PH-direct' | 'AE-direct'): number {
  const s = script?.voice_settings?.speed;
  if (typeof s === 'number' && s > 0) return s;
  return mode === 'PH-direct' ? 0.88 : 0.9;
}

export function buildReceptionistPrompt({
  script, company, contact, industry, country,
}: ReceptionistInput): string {
  const ph = languageModeFor(script, country) === 'PH-direct';
  const vars = {
    company: company ?? 'your business',
    contact: contact ?? '',
    industry: industry ?? 'business',
  };

  const parts: string[] = [];

  parts.push(
    'You are Cindy, a receptionist for KONEK AI, on a live outbound phone call. ' +
      'Warm, calm, unhurried — a good hotel front desk, not a salesperson. You listen more than you talk.'
  );

  /* Stated as fact, with no route to commenting on it. */
  parts.push(
    ph
      ? '## LANGUAGE\n' +
        'Speak Taglish from your very first word — the natural Manila mix, with "po" used the way people actually use it. ' +
        'This is simply how you speak on this call. It is not a choice you made, not something you noticed about them, ' +
        'and not something you ever mention.\n' +
        'Never say anything like "Ah, Tagalog po pala", "I see you speak Tagalog", "let me switch", or "I can speak Tagalog too". ' +
        'If they reply in English, answer in English and carry on — again without remarking on it.'
      : '## LANGUAGE\n' +
        'Speak clear, professional English from your first word. If they reply in Arabic, answer in Arabic and continue — ' +
        'without remarking on it. Never comment on which language anyone is speaking.'
  );

  if (script?.script_steps?.length) {
    const beats = script.script_steps
      .map((s) => `### ${s.step.toUpperCase()}\n${renderScript(stepText(s, country), vars)}`)
      .join('\n\n');
    parts.push(
      `## WHAT TO COVER — ${script.name}\n` +
        'These are your beats, in order. Cover the substance of each in your own words. Do not read them aloud word for word, ' +
        'and never run two beats together in one breath.\n\n' +
        beats
    );
  }

  parts.push(
    '## HOW YOU TALK\n' +
      '- One or two sentences, then stop. Let them answer. Silence is fine.\n' +
      '- Acknowledge before you continue: "I understand", "Got it", "Noted po", "Sige po".\n' +
      '- Match their mood. Busy: be brief, offer to call back. Friendly: warm up. Confused: slow down and say it more simply.\n' +
      '- Never stack two questions.\n' +
      '- If they interrupt, stop immediately and listen. They matter more than your next sentence.\n' +
      '- Say numbers as words: "forty nine dollars", "twenty four seven", "Konek A I".\n' +
      '- No lists, no markdown, no stage directions.'
  );

  parts.push(
    '## THE POINT OF THE CALL\n' +
      'Find out whether missed calls cost them business, and if so, get them to a human who can set up the trial. ' +
      'The moment they show real interest, hand over — do not keep selling to someone who already said yes.\n' +
      'If they are not interested, thank them warmly and end the call. Never push, and never answer the same objection twice.\n' +
      'Aim to reach the handover inside ninety seconds.'
  );

  parts.push(
    '## RULES\n' +
      '- Never invent prices, features or claims beyond what is above.\n' +
      '- If asked something you were not told, say a colleague will confirm.\n' +
      '- If they ask to be removed, apologise once, confirm it, and end the call.\n' +
      '- If they say they cannot hear or understand you, slow right down and say it more simply.'
  );

  return parts.join('\n\n');
}

/** Her first line, rendered from the script's opener. */
export function buildOpenerLine({ script, company, contact, industry, country }: ReceptionistInput): string {
  const vars = {
    company: company ?? 'your business',
    contact: contact ?? '',
    industry: industry ?? 'business',
  };
  const line = renderScript(stepText(script?.script_steps?.find((s) => s.step === 'opener'), country), vars);
  if (line) return line;

  return languageModeFor(script, country) === 'PH-direct'
    ? 'Good morning po. Si Cindy po from Konek A I. May thirty seconds lang po ba kayo?'
    : 'Good morning, this is Cindy from Konek A I. Do you have thirty seconds?';
}

import { config } from './config.js';
import { log } from './log.js';

/* Talking back to the Vercel app: fetch the tenant's prompt before the call
   starts, and post the result when it ends. Both are best-effort — a failure
   here degrades the call but never drops it. */

const headers = () => ({
  'Content-Type': 'application/json',
  ...(config.apiSecret ? { 'x-konek-key': config.apiSecret } : {}),
});

/**
 * Pulls the system prompt, opener and voice for this call.
 * Falls back to a usable generic agent if the app is unreachable, so a
 * deploy blip on Vercel does not leave the caller in silence.
 */
export async function fetchCallConfig({ businessId, vibe, language, customerName }) {
  const url = new URL(`${config.appUrl}/api/call/config`);
  if (businessId) url.searchParams.set('businessId', businessId);
  if (vibe) url.searchParams.set('vibe', vibe);
  if (language) url.searchParams.set('language', language);
  if (customerName) url.searchParams.set('customerName', customerName);

  try {
    const res = await fetch(url, {
      headers: headers(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${body.slice(0, 200)}`);
    }
    return await res.json();
  } catch (err) {
    log.warn('konek', `Could not fetch call config, using fallback: ${err.message}`);
    return fallbackConfig(vibe, language);
  }
}

function fallbackConfig(vibe, language) {
  const langLine = {
    TL: 'Magsalita ka ng Tagalog sa buong tawag.',
    TAGLISH: 'Speak natural Taglish — the everyday Filipino mix of Tagalog and English.',
    AR: 'تحدّث بالعربية طوال المكالمة.',
    HI: 'पूरी कॉल में हिन्दी में बात करें।',
  }[language] ?? 'Speak English throughout.';

  return {
    business: { id: null, name: 'the business' },
    vibe: vibe ?? 'PRO_CLOSER',
    language: language ?? 'EN',
    voiceStyle: 'PRO CLOSER',
    systemPrompt:
      `You are Kai, a friendly voice agent on a live phone call. ${langLine} ` +
      'You could not load this business\'s details, so do not state any facts about products, prices or availability. ' +
      'Apologise briefly, offer to have a colleague call back, and end the call politely.',
    opener: 'Hi, this is Kai. Can you hear me okay?',
    skillsUsed: [],
    goal: 'Explain',
    autoLanguage: true,
  };
}

/** Writes the finished call back to call_logs. */
export async function reportCall({
  callSid, status, durationSeconds, transcript,
  language, startedLanguage, languagesUsed, languageSwitches,
}) {
  try {
    const res = await fetch(`${config.appUrl}/api/call/transcript`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        twilioSid: callSid,
        status,
        duration: durationSeconds,
        transcript,
        language,
        startedLanguage,
        languagesUsed,
        languageSwitches,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) log.warn('konek', `Transcript post returned ${res.status}`);
    else log.info('konek', `Reported call ${callSid}: ${status}, ${durationSeconds}s`);
  } catch (err) {
    log.warn('konek', `Could not report call ${callSid}: ${err.message}`);
  }
}

/** Asks the app to move a live call onto a human. */
export async function requestHandoff({ callSid, businessId, language, reason }) {
  try {
    const res = await fetch(`${config.appUrl}/api/call/handoff`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ twilioSid: callSid, businessId, language, reason }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.warn('handoff', `refused (${res.status}): ${body.error ?? ''}`);
      return { transferred: false, reason: body.error };
    }
    log.info('handoff', body.transferred ? `transferred to ${body.to}` : `not transferred: ${body.reason ?? body.detail}`);
    return body;
  } catch (err) {
    log.warn('handoff', `failed: ${err.message}`);
    return { transferred: false, reason: err.message };
  }
}

import type { VibeKey } from '@/lib/types2';

/* ═══════════════════════════════════════════════════════════════════
   Language × vibe.

   A vibe is a personality; a language is what it speaks. They are
   independent, so PRO CLOSER exists in all five languages rather than
   being an English-only persona.
   ═══════════════════════════════════════════════════════════════════ */

export const LANGUAGE_KEYS = ['EN', 'TL', 'TAGLISH', 'AR', 'HI'] as const;
export type LanguageKey = (typeof LANGUAGE_KEYS)[number];

export const languageToKey = (v: string | null | undefined): LanguageKey => {
  const k = (v ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_') as LanguageKey;
  return LANGUAGE_KEYS.includes(k) ? k : 'EN';
};

export interface LanguageConfig {
  key: LanguageKey;
  label: string;
  native: string;
  /** BCP-47 tag for TTS and transcription. */
  bcp47: string;
  /** Instruction appended to the agent's system prompt. */
  instruction: string;
  /** Twilio <Say> voice for the no-bridge fallback. */
  twilioVoice: string;
  /** Twilio <Say> language attribute. */
  twilioLang: string;
  /** True when Twilio has no real voice for it and the fallback is approximate. */
  fallbackApproximate?: boolean;
  /** Extra delivery guidance, appended to the language instruction. */
  deliveryNote?: string;
  /** Shown beside calls so the spoken language is readable at a glance. */
  flag: string;
}

export const LANGUAGES: Record<LanguageKey, LanguageConfig> = {
  EN: {
    key: 'EN',
    label: 'English',
    native: 'English',
    bcp47: 'en-US',
    flag: '🇺🇸',
    instruction:
      'Speak English throughout. Use clear, natural, conversational English. Keep sentences short enough to say out loud.',
    twilioVoice: 'Polly.Matthew-Neural',
    twilioLang: 'en-US',
    deliveryNote:
      'Keep it relaxed and unhurried, the way you would talk to someone you already like.',
  },
  TL: {
    key: 'TL',
    label: 'Tagalog',
    native: 'Tagalog',
    bcp47: 'fil-PH',
    flag: '🇵🇭',
    instruction:
      'Magsalita ka ng Tagalog sa buong tawag. Gumamit ng magalang at natural na Tagalog, gamit ang "po" at "opo". Iwasan ang masyadong malalim na salita — dapat parang normal na usapan.',
    /* Twilio/Polly has no Filipino voice; the English-PH voice is the closest. */
    twilioVoice: 'Polly.Joanna-Neural',
    twilioLang: 'en-US',
    fallbackApproximate: true,
    deliveryNote:
      'Gamitin ang "po" at "opo" nang natural — hindi sa bawat pangungusap. Maikli ang mga pangungusap, parang totoong usapan sa telepono.',
  },
  TAGLISH: {
    key: 'TAGLISH',
    label: 'Taglish',
    native: 'Taglish',
    bcp47: 'fil-PH',
    flag: '🇵🇭',
    instruction:
      'Speak natural Taglish — the everyday Filipino mix of Tagalog and English, the way people actually talk in Metro Manila. Use "po" and "opo" for politeness. Keep English for product names, numbers and prices; use Tagalog for the connective, friendly parts.',
    twilioVoice: 'Polly.Joanna-Neural',
    twilioLang: 'en-US',
    fallbackApproximate: true,
    deliveryNote:
      'Switch between Tagalog and English mid-sentence the way Manila actually talks — "may available po kami this Thursday". Use "po" naturally, not in every sentence. Keep English for prices, dates and product names.',
  },
  AR: {
    key: 'AR',
    label: 'Arabic',
    native: 'العربية',
    bcp47: 'ar-AE',
    flag: '🇦🇪',
    instruction:
      'تحدّث بالعربية طوال المكالمة. استخدم لهجة خليجية مهذبة وواضحة وقريبة من الحديث اليومي. اجعل الجمل قصيرة ومناسبة للنطق.',
    twilioVoice: 'Polly.Zeina',
    twilioLang: 'arb',
  },
  HI: {
    key: 'HI',
    label: 'Hindi',
    native: 'हिन्दी',
    bcp47: 'hi-IN',
    flag: '🇮🇳',
    instruction:
      'पूरी कॉल में हिन्दी में बात करें। सरल, विनम्र और रोज़मर्रा की हिन्दी का प्रयोग करें। वाक्य छोटे रखें ताकि बोलने में स्वाभाविक लगें।',
    twilioVoice: 'Polly.Aditi',
    twilioLang: 'hi-IN',
  },
};

export const languageConfig = (v: string | null | undefined) => LANGUAGES[languageToKey(v)];

/* ── Openers: what Kai says the moment the customer picks up ──────── */

type OpenerFn = (business: string, name: string | null) => string;

const OPENERS: Record<VibeKey, Record<LanguageKey, OpenerFn>> = {
  PRO_CLOSER: {
    EN: (b, n) => `Hi${n ? ` ${n}` : ''}, this is Kai from ${b}. I'll be quick — do you have a moment?`,
    TL: (b, n) => `Magandang araw po${n ? `, ${n}` : ''}. Si Kai po ito mula sa ${b}. Sandali lang po — may oras po ba kayo?`,
    TAGLISH: (b, n) => `Hi${n ? ` ${n}` : ''}, si Kai to from ${b}. Quick lang po — may time po kayo?`,
    AR: (b, n) => `مرحباً${n ? ` ${n}` : ''}، معك كاي من ${b}. سأكون سريعاً — هل لديك دقيقة؟`,
    HI: (b, n) => `नमस्ते${n ? ` ${n}` : ''}, मैं ${b} से काई बोल रहा हूँ। बस एक मिनट लूँगा — क्या आप बात कर सकते हैं?`,
  },
  FRIENDLY_TITO: {
    EN: (b, n) => `Hello${n ? ` ${n}` : ''}! Kai here from ${b}. How are you doing today? I just had a quick question.`,
    TL: (b, n) => `Hello po${n ? `, ${n}` : ''}! Si Kai po ito ng ${b}. Kumusta po kayo? May itatanong lang po sana ako.`,
    TAGLISH: (b, n) => `Hello po${n ? ` ${n}` : ''}! Si Kai to from ${b}. Kumusta po kayo? May quick question lang po ako.`,
    AR: (b, n) => `أهلاً${n ? ` ${n}` : ''}! معك كاي من ${b}. كيف حالك اليوم؟ عندي سؤال بسيط.`,
    HI: (b, n) => `नमस्ते${n ? ` ${n}` : ''}! मैं ${b} से काई। आप कैसे हैं? बस एक छोटा सा सवाल था।`,
  },
  GEN_Z_HYPE: {
    EN: (b, n) => `Hey${n ? ` ${n}` : ''}! It's Kai from ${b} — got like thirty seconds? I've got something you'll want to hear.`,
    TL: (b, n) => `Uy${n ? ` ${n}` : ''}! Si Kai to ng ${b} — thirty seconds lang po. May maganda akong balita.`,
    TAGLISH: (b, n) => `Uy${n ? ` ${n}` : ''}! Si Kai to from ${b} — thirty seconds lang, promise. May something ako na gugustuhin mo.`,
    AR: (b, n) => `هاي${n ? ` ${n}` : ''}! معك كاي من ${b} — عندك ثلاثين ثانية؟ عندي خبر بيعجبك.`,
    HI: (b, n) => `हे${n ? ` ${n}` : ''}! मैं ${b} से काई — बस तीस सेकंड? आपके लिए एक मज़ेदार बात है।`,
  },
  CALM_CARE: {
    EN: (b, n) => `Hi${n ? ` ${n}` : ''}, this is Kai calling from ${b}. I hope I'm not catching you at a bad time — do you have a moment?`,
    TL: (b, n) => `Magandang araw po${n ? `, ${n}` : ''}. Si Kai po ito mula sa ${b}. Sana po hindi ako nakakaabala — may sandali po ba kayo?`,
    TAGLISH: (b, n) => `Hi po${n ? ` ${n}` : ''}, si Kai to from ${b}. Sana hindi po ako nakaka-abala — may moment po kayo?`,
    AR: (b, n) => `مرحباً${n ? ` ${n}` : ''}، معك كاي من ${b}. أتمنى ألا أكون أزعجتك — هل لديك لحظة؟`,
    HI: (b, n) => `नमस्ते${n ? ` ${n}` : ''}, मैं ${b} से काई बोल रहा हूँ। उम्मीद है मैंने गलत समय पर कॉल नहीं किया — क्या आपके पास एक मिनट है?`,
  },
};

export function openerFor(
  vibe: VibeKey,
  language: LanguageKey,
  business: string,
  customerName: string | null
): string {
  return (OPENERS[vibe] ?? OPENERS.PRO_CLOSER)[language](business, customerName);
}

/* ── Sample lines shown in the Vibe Mode preview ──────────────────── */

export const SAMPLES: Record<VibeKey, Record<LanguageKey, string>> = {
  PRO_CLOSER: {
    EN: "Hi Renmar, this is Kai from Nova Aesthetics. I'll be quick — you asked about the December package. I have two slots left this week. Thursday 2pm or Friday 11am?",
    TL: 'Magandang araw po Renmar, si Kai po ito ng Nova Aesthetics. Sandali lang po — tungkol po sa December package. Dalawang slot na lang po ang natitira. Huwebes 2pm o Biyernes 11am po?',
    TAGLISH: 'Hi Renmar, si Kai to from Nova Aesthetics. Quick lang — about sa December package na tinanong mo. May two slots na lang left this week. Thursday 2pm or Friday 11am?',
    AR: 'مرحباً رنمار، معك كاي من نوفا أستيتيكس. سأكون سريعاً — بخصوص باقة ديسمبر. بقي موعدان فقط هذا الأسبوع. الخميس الساعة ٢ أم الجمعة الساعة ١١؟',
    HI: 'नमस्ते रेनमार, मैं नोवा एस्थेटिक्स से काई। बस एक मिनट — दिसंबर पैकेज के बारे में। इस हफ़्ते सिर्फ़ दो स्लॉट बचे हैं। गुरुवार दोपहर २ या शुक्रवार सुबह ११?',
  },
  FRIENDLY_TITO: {
    EN: "Hello Renmar! Kai here from Nova Aesthetics. How have you been? I saw you were asking about our package — no pressure at all, I just wanted to check if you had any questions.",
    TL: 'Hello po Renmar! Si Kai po ito ng Nova Aesthetics. Kumusta na po kayo? Nakita ko lang po na nag-inquire kayo tungkol sa package namin. Wala pong pressure, gusto ko lang pong malaman kung may tanong pa kayo.',
    TAGLISH: 'Hello po Renmar! Si Kai to from Nova Aesthetics. Kumusta po kayo? Nakita ko lang po na nag-inquire kayo about sa package namin. Wala pong pressure ha — gusto ko lang malaman kung may tanong pa kayo.',
    AR: 'أهلاً رنمار! معك كاي من نوفا أستيتيكس. كيف حالك؟ لاحظت أنك سألت عن الباقة — بدون أي ضغط، أردت فقط أن أعرف إن كان عندك أي سؤال.',
    HI: 'नमस्ते रेनमार! मैं नोवा एस्थेटिक्स से काई। आप कैसे हैं? मैंने देखा आपने हमारे पैकेज के बारे में पूछा था — कोई दबाव नहीं, बस जानना था कि कोई सवाल तो नहीं।',
  },
  GEN_Z_HYPE: {
    EN: "Heyy Renmar, it's Kai from Nova — okay so the thing you were eyeing? Back in stock and moving fast. I can lock one for you right now, takes ten seconds.",
    TL: 'Uy Renmar, si Kai to ng Nova — yung tinitingnan mo? Balik na sa stock at mabilis maubos. Pwede kong i-reserve para sayo ngayon, sampung segundo lang.',
    TAGLISH: 'Heyy Renmar, si Kai to from Nova — okay so yung tinitingnan mo? Back in stock na and honestly mabilis maubos. Pwede ko i-lock for you right now, ten seconds lang.',
    AR: 'هاي رنمار، معك كاي من نوفا — الشيء اللي كنت تبحث عنه؟ رجع متوفر وينفد بسرعة. أقدر أحجزه لك الحين، ما ياخذ عشر ثواني.',
    HI: 'हे रेनमार, मैं नोवा से काई — जो चीज़ आप देख रहे थे? वापस स्टॉक में है और तेज़ी से जा रही है। अभी लॉक कर सकता हूँ, दस सेकंड लगेंगे।',
  },
  CALM_CARE: {
    EN: "Hi Renmar, this is Kai calling from Nova Clinic. I hope I'm not catching you at a bad time. I just wanted to check in about your appointment, and answer anything you're unsure about. Take your time.",
    TL: 'Magandang araw po Renmar, si Kai po ito mula sa Nova Clinic. Sana po hindi ako nakakaabala. Gusto ko lang po sanang i-confirm ang appointment ninyo, at sagutin ang anumang tanong. Dahan-dahan lang po.',
    TAGLISH: 'Hi po Renmar, si Kai to from Nova Clinic. Sana hindi po ako nakaka-abala. Gusto ko lang po mag-check about sa appointment ninyo, and to answer kung may hindi po kayo sure. Take your time po.',
    AR: 'مرحباً رنمار، معك كاي من عيادة نوفا. أتمنى ألا أكون أزعجتك. أردت فقط الاطمئنان بخصوص موعدك، والإجابة على أي استفسار. خذ وقتك.',
    HI: 'नमस्ते रेनमार, मैं नोवा क्लिनिक से काई बोल रहा हूँ। उम्मीद है मैंने गलत समय पर कॉल नहीं किया। बस आपके अपॉइंटमेंट के बारे में जानना था, और कोई सवाल हो तो बताइए। आराम से।',
  },
};

/** Flag for a stored language code, for tables and feeds. */
export const languageFlag = (v: string | null | undefined): string =>
  v ? LANGUAGES[languageToKey(v)].flag : '';

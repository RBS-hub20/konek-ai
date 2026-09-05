/* ═══════════════════════════════════════════════════════════════════
   Which language is the caller speaking?

   Runs on each finished transcript turn. Deepgram is not configured on
   this deployment, so this works off the realtime transcription that is
   already there — no extra latency, no extra vendor.

   Script beats vocabulary: Arabic and Devanagari are decided by their
   characters and are effectively certain. Tagalog against English is a
   vocabulary judgement, so it carries a confidence the caller can fail
   to meet on a two-word answer.
   ═══════════════════════════════════════════════════════════════════ */

/* Function words carry the language even when the nouns are borrowed, which
   is exactly what happens in Taglish. */
const TAGALOG_MARKERS = new Set([
  'po', 'opo', 'ho', 'oho', 'ako', 'ikaw', 'kayo', 'siya', 'sila', 'kami', 'tayo', 'natin', 'namin',
  'ng', 'nang', 'mga', 'ang', 'sa', 'ay', 'na', 'pa', 'ba', 'raw', 'daw', 'lang', 'lamang',
  'naman', 'talaga', 'yung', 'iyong', 'ito', 'iyan', 'iyon', 'dito', 'diyan', 'doon',
  'kumusta', 'kamusta', 'magkano', 'saan', 'kailan', 'bakit', 'paano', 'sino', 'ano', 'alin',
  'salamat', 'walang', 'wala', 'meron', 'mayroon', 'hindi', 'oo', 'opo', 'pwede', 'puwede',
  'gusto', 'ayaw', 'kailangan', 'sige', 'tara', 'ingat', 'maganda', 'mabuti', 'masaya',
  'araw', 'gabi', 'umaga', 'hapon', 'bukas', 'kahapon', 'ngayon', 'mamaya', 'sandali',
  'kuya', 'ate', 'tita', 'tito', 'nga', 'eh', 'kasi', 'para', 'kung', 'pero', 'tapos',
  'akin', 'iyo', 'kanya', 'amin', 'atin', 'niya', 'nila', 'ninyo', 'ko', 'mo', 'natin',
]);

/* Common English function words. Content words are unreliable here because
   Taglish borrows them wholesale. */
const ENGLISH_MARKERS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did',
  'have', 'has', 'had', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'my', 'your', 'his', 'their', 'our', 'this', 'that', 'these', 'those',
  'and', 'or', 'but', 'if', 'so', 'because', 'when', 'where', 'what', 'which', 'who', 'how',
  'can', 'could', 'would', 'should', 'will', 'want', 'need', 'like', 'just', 'about',
  'for', 'with', 'from', 'to', 'of', 'in', 'on', 'at', 'by', 'not', 'no', 'yes', 'okay', 'ok',
  'right', 'good', 'much', 'many', 'there', 'here', 'also', 'still', 'then', 'than',
]);

/* Used identically inside Taglish — "okay po", "yes po", "sorry po" — so they
   are evidence of nothing and must not count toward an English streak. */
const AMBIGUOUS = new Set([
  'yes', 'no', 'ok', 'okay', 'okey', 'sige', 'hi', 'hello', 'hey', 'bye',
  'thanks', 'thank', 'sorry', 'please', 'sure', 'hmm', 'ah', 'ay', 'oh', 'uh',
]);

const ARABIC_RE = /[؀-ۿݐ-ݿ]/;
const DEVANAGARI_RE = /[ऀ-ॿ]/;

/* Someone asking outright always wins over counting words. "Hindi" is left out
   deliberately — in Tagalog it simply means "no", so a bare mention is not a
   request for the Hindi language. */
const EXPLICIT = [
  { lang: 'EN', re: /\b(in|speak|say it in|talk in|switch to)\s+english\b|\benglish\s+(please|na lang|nalang)\b|\bcan we speak english\b/i },
  { lang: 'TL', re: /\b(in|speak|say it in|talk in|switch to)\s+(tagalog|filipino)\b|\b(tagalog|filipino)\s+(please|na lang|nalang|po)\b|\bsa tagalog\b/i },
  { lang: 'TAGLISH', re: /\btaglish\b/i },
  { lang: 'AR', re: /\b(in|speak|switch to)\s+arabic\b|\barabic\s+please\b|بالعربي|بالعربية|تكلم عربي/i },
  { lang: 'HI', re: /\b(in|speak|switch to)\s+hindi\b|\bhindi\s+(please|mein|me)\b|हिंदी में/i },
];

/**
 * @param {string} text one finished transcript turn
 * @returns {{lang: 'EN'|'TL'|'TAGLISH'|'AR'|'HI'|null, confidence: number, explicit: boolean, reason: string}}
 */
export function detectLanguage(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { lang: null, confidence: 0, explicit: false, reason: 'empty' };

  for (const { lang, re } of EXPLICIT) {
    if (re.test(raw)) return { lang, confidence: 1, explicit: true, reason: 'asked for it' };
  }

  /* Script is decisive — no amount of word counting beats an alphabet. */
  const arabic = (raw.match(new RegExp(ARABIC_RE, 'g')) ?? []).length;
  const devanagari = (raw.match(new RegExp(DEVANAGARI_RE, 'g')) ?? []).length;
  const letters = (raw.match(/\p{L}/gu) ?? []).length || 1;
  if (arabic / letters > 0.3) return { lang: 'AR', confidence: 0.99, explicit: false, reason: 'arabic script' };
  if (devanagari / letters > 0.3) return { lang: 'HI', confidence: 0.99, explicit: false, reason: 'devanagari script' };

  const words = raw.toLowerCase().replace(/[^\p{L}\s']/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return { lang: null, confidence: 0, explicit: false, reason: 'no words' };

  let tl = 0;
  let en = 0;
  for (const w of words) {
    if (AMBIGUOUS.has(w)) continue;
    if (TAGALOG_MARKERS.has(w)) tl++;
    else if (ENGLISH_MARKERS.has(w)) en++;
  }
  const markers = tl + en;

  /* "Yes", "okay", "Thursday" — true of every language in the mix, so refuse
     to guess rather than flip the call on a one-word answer. */
  if (markers === 0) {
    return { lang: null, confidence: 0, explicit: false, reason: 'no marker words' };
  }
  /* A single marker is a coin toss. Report it, but never above the threshold
     a switch requires. */
  if (markers < 2) {
    const only = tl > 0 ? 'TL' : 'EN';
    return { lang: only, confidence: 0.45, explicit: false, reason: 'only one marker word' };
  }

  const tlShare = tl / markers;
  /* Longer turns are more trustworthy; three markers is roughly the point
     where the ratio stops being noise. */
  const weight = Math.min(1, markers / 3);

  if (tl > 0 && en > 0 && tlShare >= 0.25 && tlShare <= 0.75) {
    return { lang: 'TAGLISH', confidence: 0.6 + 0.35 * weight, explicit: false, reason: `mixed ${tl}tl/${en}en` };
  }
  if (tlShare > 0.75) {
    return { lang: 'TL', confidence: 0.6 + 0.38 * weight, explicit: false, reason: `${tl}tl/${en}en` };
  }
  return { lang: 'EN', confidence: 0.6 + 0.38 * weight, explicit: false, reason: `${tl}tl/${en}en` };
}

/**
 * Decides whether to actually switch.
 *
 * One turn is never enough — a caller says "okay" or drops an English noun
 * into a Tagalog sentence constantly. Two consecutive turns in the same new
 * language, or one explicit request, moves the call.
 */
export class LanguageTracker {
  constructor(initial) {
    this.current = initial;
    this.started = initial;
    this.streak = { lang: null, count: 0 };
    this.locked = false;      // set by an explicit request
    this.history = [];
    this.switches = 0;
  }

  /** @returns {{switched: boolean, to: string, explicit: boolean}} */
  observe(text, { minConfidence = 0.7, turnsToSwitch = 2 } = {}) {
    const d = detectLanguage(text);
    this.history.push(d.lang ?? '—');

    if (!d.lang || d.confidence < minConfidence) {
      /* An unreadable turn should not break a run that is building. */
      return { switched: false, to: this.current, explicit: false };
    }

    if (d.explicit) {
      this.locked = true;
      this.streak = { lang: d.lang, count: turnsToSwitch };
      if (d.lang !== this.current) {
        this.current = d.lang;
        this.switches += 1;
        return { switched: true, to: d.lang, explicit: true };
      }
      return { switched: false, to: this.current, explicit: true };
    }

    /* Once someone has asked for a language, stop second-guessing them. */
    if (this.locked) return { switched: false, to: this.current, explicit: false };

    this.streak = d.lang === this.streak.lang
      ? { lang: d.lang, count: this.streak.count + 1 }
      : { lang: d.lang, count: 1 };

    if (d.lang !== this.current && this.streak.count >= turnsToSwitch) {
      this.current = d.lang;
      this.switches += 1;
      return { switched: true, to: d.lang, explicit: false };
    }
    return { switched: false, to: this.current, explicit: false };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   "Can I speak to a person?"

   Handing off is the one thing a caller should never have to fight for,
   so the trigger is generous — but it only fires on the CUSTOMER's turn,
   never on Kai's own words, or the agent explaining that it can transfer
   would transfer the call.
   ═══════════════════════════════════════════════════════════════════ */

const HANDOFF_PATTERNS = [
  /\b(real|actual|live|human)\s+(person|human|agent|being)\b/i,
  /\b(speak|talk|chat)\s+(to|with)\s+(a\s+)?(real\s+)?(person|human|someone|agent|manager|supervisor|staff|owner)\b/i,
  /\b(put me through|transfer me|connect me)\b/i,
  /\b(get|give)\s+me\s+(a\s+)?(person|human|manager|supervisor)\b/i,
  /\bis (this|that) (a )?(robot|bot|ai|recording|machine)\b/i,
  /\b(i want|i need|can i)\s+(to\s+)?(speak|talk)\s+(to|with)\b.*\b(person|human|manager|someone)\b/i,
  /\bstop\b.*\b(bot|robot|ai)\b/i,
  /\bnot\b.*\btalking to\b.*\b(robot|bot|ai|machine)\b/i,
  /\bcustomer service\b/i,
  /\boperator\b/i,
  /\bmanager\b/i,
  /\bsupervisor\b/i,
  /\btao\b(?!\w)/i,
  /\b(makausap|kausapin|pakausap)\b/i,
  /\b(may|meron)\s+bang?\s+(tao|staff|empleyado)\b/i,
  /\bhindi ako\b.*\brobot\b/i,
  /(شخص|إنسان|موظف|مدير|خدمة العملاء)/,
  /(व्यक्ति|इंसान|मैनेजर|प्रतिनिधि)/,
];

/**
 * @param {string} text one customer turn
 * @returns {{wants: boolean, reason: string|null}}
 */
export function detectHandoff(text) {
  const t = String(text ?? '').trim();
  if (!t) return { wants: false, reason: null };
  for (const re of HANDOFF_PATTERNS) {
    const m = t.match(re);
    if (m) return { wants: true, reason: m[0] };
  }
  return { wants: false, reason: null };
}

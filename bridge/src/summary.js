/* ═══════════════════════════════════════════════════════════════════
   A short, redacted record of how each call sounded.

   "It sounded like a robot" is unanswerable after the fact unless the
   bridge says which voice it actually used. The full logs carry prompts
   and transcripts and stay behind the shared secret; this carries none
   of that — no phone numbers, no company names, no words spoken — so it
   can be read from a phone while someone is telling you it went wrong.
   ═══════════════════════════════════════════════════════════════════ */

const MAX = 20;
const calls = [];

export function recordCallSummary(entry) {
  calls.unshift(entry);
  if (calls.length > MAX) calls.length = MAX;
}

export function recentCallSummaries(n = MAX) {
  return calls.slice(0, Math.max(1, Math.min(n, MAX)));
}

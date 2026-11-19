// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — read-aloud (Web Speech API).
//
// For younger and low-literacy learners, hearing the question matters more
// than reading it. The browser's built-in speech synthesis runs on-device,
// costs nothing, needs no network — the same offline-first promise, applied
// to accessibility. This is deliberately NOT an AI Logic call; it is a free
// platform capability used where it fits.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

export function speechAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.speechSynthesis.speak === "function"
  );
}

/** Speaks text with the best available voice for the given language code
 *  (e.g. "en", "hi"). Cancels anything already queued first — buttons must
 *  always behave like a toggle, never a stack. Returns true when speech
 *  actually started. */
export function speak(text: string, lang = "en"): boolean {
  if (!speechAvailable() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = `${lang}-${lang === "en" ? "IN" : lang.toUpperCase()}`;
  utter.rate = 0.95;
  // Prefer a voice that actually matches the language (e.g. Hindi cards).
  const voices = synth.getVoices();
  const match = voices.find((v) => v.lang?.toLowerCase().startsWith(lang));
  if (match) utter.voice = match;
  synth.speak(utter);
  return true;
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

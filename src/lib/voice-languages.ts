/**
 * The languages voice entry can be told to expect. Shared by three consumers,
 * which is why it isn't `server-only`:
 *   - the settings picker (labels),
 *   - the browser's live preview (`bcp47`, the one language SpeechRecognition
 *     can be pinned to),
 *   - the server transcription prompt (`englishName`, listed for the model).
 *
 * ── Why a *multi*-select actually works here ──
 * Whisper-style APIs take a single `language` code or nothing at all, so a list
 * would be meaningless to them (see `ai-transcribe.ts`). The model this feature
 * targets takes a free-text instruction alongside the audio, so naming several
 * languages is a real instruction it honours — which is what makes code-mixed
 * speech ("groceries-க்கு 500 rupees") transcribe correctly instead of being
 * forced into one script.
 *
 * The browser's live preview is the one place that must still pick a single
 * language: `SpeechRecognition.lang` accepts exactly one BCP-47 tag. It uses the
 * first selected language, and that only affects the grey interim text — the
 * transcript that lands in the composer always comes from the server.
 */

export type VoiceLanguage = {
  /** Stable id stored in `user_settings.voice_languages` (ISO 639-1). */
  code: string;
  /** What the model is told to expect. */
  englishName: string;
  /** Shown in the settings picker, in the language itself. */
  nativeName: string;
  /** For `SpeechRecognition.lang` — one tag, region included where it matters. */
  bcp47: string;
};

/**
 * Curated rather than exhaustive: the languages a money tracker realistically
 * gets spoken to, weighted to the Indian subcontinent (where code-mixing with
 * English is the norm) plus the widely-spoken rest. Ordered as shown in
 * settings — English first, then Indian languages alphabetically, then the rest.
 */
export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: "en", englishName: "English", nativeName: "English", bcp47: "en-IN" },
  { code: "bn", englishName: "Bengali", nativeName: "বাংলা", bcp47: "bn-IN" },
  { code: "gu", englishName: "Gujarati", nativeName: "ગુજરાતી", bcp47: "gu-IN" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", bcp47: "hi-IN" },
  { code: "kn", englishName: "Kannada", nativeName: "ಕನ್ನಡ", bcp47: "kn-IN" },
  { code: "ml", englishName: "Malayalam", nativeName: "മലയാളം", bcp47: "ml-IN" },
  { code: "mr", englishName: "Marathi", nativeName: "मराठी", bcp47: "mr-IN" },
  { code: "or", englishName: "Odia", nativeName: "ଓଡ଼ିଆ", bcp47: "or-IN" },
  { code: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ", bcp47: "pa-IN" },
  { code: "ta", englishName: "Tamil", nativeName: "தமிழ்", bcp47: "ta-IN" },
  { code: "te", englishName: "Telugu", nativeName: "తెలుగు", bcp47: "te-IN" },
  { code: "ur", englishName: "Urdu", nativeName: "اردو", bcp47: "ur-IN" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", bcp47: "ar-SA" },
  { code: "de", englishName: "German", nativeName: "Deutsch", bcp47: "de-DE" },
  { code: "es", englishName: "Spanish", nativeName: "Español", bcp47: "es-ES" },
  { code: "fr", englishName: "French", nativeName: "Français", bcp47: "fr-FR" },
  { code: "id", englishName: "Indonesian", nativeName: "Bahasa Indonesia", bcp47: "id-ID" },
  { code: "it", englishName: "Italian", nativeName: "Italiano", bcp47: "it-IT" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語", bcp47: "ja-JP" },
  { code: "ko", englishName: "Korean", nativeName: "한국어", bcp47: "ko-KR" },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands", bcp47: "nl-NL" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português", bcp47: "pt-BR" },
  { code: "ru", englishName: "Russian", nativeName: "Русский", bcp47: "ru-RU" },
  { code: "th", englishName: "Thai", nativeName: "ไทย", bcp47: "th-TH" },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe", bcp47: "tr-TR" },
  { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt", bcp47: "vi-VN" },
  { code: "zh", englishName: "Chinese", nativeName: "中文", bcp47: "zh-CN" },
];

const BY_CODE = new Map(VOICE_LANGUAGES.map((l) => [l.code, l]));

/** Used when a user hasn't chosen any — the app's own interface language. */
export const DEFAULT_VOICE_LANGUAGES = ["en"];

/**
 * Cap on how many languages may be selected. Past a handful the hint stops
 * narrowing anything down and starts reading like "expect any language", which
 * is strictly worse than auto-detect: the model spends the instruction budget
 * on a list instead of on the domain vocabulary that actually helps.
 */
export const MAX_VOICE_LANGUAGES = 5;

export function getVoiceLanguage(code: string): VoiceLanguage | undefined {
  return BY_CODE.get(code);
}

/**
 * Clean a stored/submitted list: keep only known codes, drop duplicates, cap the
 * length, and fall back to the default when nothing valid survives. Applied on
 * both write and read, so a hand-edited DB row can't reach the prompt.
 */
export function normalizeVoiceLanguages(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const code = v.trim().toLowerCase();
    if (BY_CODE.has(code)) seen.add(code);
    if (seen.size >= MAX_VOICE_LANGUAGES) break;
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_VOICE_LANGUAGES];
}

/** English names for the transcription prompt, e.g. "Tamil, Telugu and English". */
export function describeVoiceLanguages(codes: string[]): string {
  const names = normalizeVoiceLanguages(codes).map((c) => BY_CODE.get(c)!.englishName);
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The single tag for the browser's live preview — the first selected language.
 * Only affects the interim grey text; the saved transcript comes from the server.
 */
export function primaryBcp47(codes: string[]): string {
  const [first] = normalizeVoiceLanguages(codes);
  return BY_CODE.get(first!)?.bcp47 ?? "en-IN";
}

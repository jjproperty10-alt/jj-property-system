/**
 * Browser speech-to-text helpers. No audio bytes are kept or uploaded.
 */

export const SPEECH_LANGS = [
  { id: 'he-IL', label: 'עברית', short: 'HE' },
  { id: 'en-US', label: 'English', short: 'EN' },
  { id: 'el-GR', label: 'Ελληνικά', short: 'EL' },
] as const

export type SpeechLangId = (typeof SPEECH_LANGS)[number]['id']

export function isSpeechRecognitionSupported(
  speechWindow: { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown } | undefined,
): boolean {
  if (!speechWindow) return false
  return typeof speechWindow.SpeechRecognition === 'function'
    || typeof speechWindow.webkitSpeechRecognition === 'function'
}

export function mergeFinalTranscript(current: string, incoming: string): string {
  const a = current.trim()
  const b = incoming.trim()
  if (!b) return current
  if (!a) return b
  if (a === b) return a
  if (a.endsWith(b)) return a
  if (b.startsWith(a) && b.length > a.length) return b
  return `${a} ${b}`.trim()
}

export const UNSUPPORTED_MIC_MESSAGE =
  'הדפדפן הזה לא תומך בהכתבה. אפשר להמשיך להקליד.'
export const PERMISSION_DENIED_MESSAGE =
  'אין הרשאת מיקרופון. אפשר להמשיך להקליד.'
export const MIC_PRIVACY_LABEL =
  'הקול אינו נשמר. רק הטקסט שתאשר לשלוח ייכנס לשיחה.'

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isSpeechRecognitionSupported,
  mergeFinalTranscript,
  PERMISSION_DENIED_MESSAGE,
  SPEECH_LANGS,
  UNSUPPORTED_MIC_MESSAGE,
  type SpeechLangId,
} from '@/lib/ops/assistant/speechTranscript'

type SpeechRec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeechToText(input: {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly enabled: boolean
}) {
  const [lang, setLang] = useState<SpeechLangId>('he-IL')
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRec | null>(null)
  const valueRef = useRef(input.value)
  valueRef.current = input.value

  const supported = typeof window === 'undefined'
    ? false
    : isSpeechRecognitionSupported(window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })

  const stop = useCallback(() => {
    const rec = recRef.current
    recRef.current = null
    try {
      rec?.stop()
    } catch {
      try { rec?.abort() } catch { /* ignore */ }
    }
    setListening(false)
  }, [])

  useEffect(() => () => { stop() }, [stop])

  const start = useCallback(() => {
    if (!input.enabled) return
    setError(null)
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError(UNSUPPORTED_MIC_MESSAGE)
      return
    }
    stop()
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (ev) => {
      let finals = ''
      for (let i = 0; i < ev.results.length; i += 1) {
        const row = ev.results[i]
        if (row.isFinal) finals += ` ${row[0].transcript}`
      }
      const merged = mergeFinalTranscript(valueRef.current, finals)
      if (merged !== valueRef.current) input.onChange(merged)
    }
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'permission-denied') {
        setError(PERMISSION_DENIED_MESSAGE)
      } else if (ev.error && ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setError(UNSUPPORTED_MIC_MESSAGE)
      }
      setListening(false)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setError(PERMISSION_DENIED_MESSAGE)
      setListening(false)
    }
  }, [input, lang, stop])

  return {
    supported,
    lang,
    setLang,
    listening,
    error,
    langs: SPEECH_LANGS,
    start,
    stop,
    unsupportedMessage: UNSUPPORTED_MIC_MESSAGE,
  }
}

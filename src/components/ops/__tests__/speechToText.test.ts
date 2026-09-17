import fs from 'fs'
import path from 'path'
import {
  isSpeechRecognitionSupported,
  mergeFinalTranscript,
  UNSUPPORTED_MIC_MESSAGE,
  PERMISSION_DENIED_MESSAGE,
  MIC_PRIVACY_LABEL,
} from '@/lib/ops/assistant/speechTranscript'

const ROOT = path.join(__dirname, '..', '..', '..', '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('assistant microphone helpers', () => {
  it('reports unsupported browsers', () => {
    expect(isSpeechRecognitionSupported(undefined)).toBe(false)
    expect(isSpeechRecognitionSupported({})).toBe(false)
    expect(isSpeechRecognitionSupported({ webkitSpeechRecognition: function Webkit() {} })).toBe(true)
    expect(UNSUPPORTED_MIC_MESSAGE.length).toBeGreaterThan(10)
    expect(PERMISSION_DENIED_MESSAGE.length).toBeGreaterThan(10)
  })

  it('keeps the transcript editable and does not duplicate finals', () => {
    expect(mergeFinalTranscript('', 'שילמתי 120')).toBe('שילמתי 120')
    expect(mergeFinalTranscript('שילמתי 120', 'שילמתי 120')).toBe('שילמתי 120')
    expect(mergeFinalTranscript('שילמתי', '120 אירו')).toBe('שילמתי 120 אירו')
  })

  it('never auto-sends, uploads, or stores audio', () => {
    const hook = read('src/components/ops/useSpeechToText.ts')
    const chat = read('src/components/ops/AssistantChat.tsx')
    const blob = hook + '\n' + chat
    expect(blob).not.toMatch(/MediaRecorder/)
    expect(blob).not.toMatch(/FormData/)
    expect(blob).not.toMatch(/upload\(/)
    expect(blob).not.toMatch(/getUserMedia/)
    expect(hook).toContain('stop()')
    expect(hook).toMatch(/useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{\s*stop\(\)/)
    expect(chat).toContain('onChange={(e) => setText(e.target.value)}')
    expect(chat).not.toMatch(/onresult[\s\S]{0,200}sendBody/)
    expect(chat).toContain('MIC_PRIVACY_LABEL')
    expect(hook).toContain('continuous = false')
  })
})

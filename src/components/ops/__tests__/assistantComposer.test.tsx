import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantChatHeader, ComposerClearButton } from '@/components/ops/AssistantChat'

describe('assistant composer clear button', () => {
  it('clears typed text and says so', () => {
    let value = 'שילמתי 500'
    let notice = ''
    const before = renderToStaticMarkup(
      <ComposerClearButton
        hasText={value.length > 0}
        notice={notice}
        onClear={() => {
          value = ''
          notice = 'הטקסט נוקה'
        }}
      />,
    )
    expect(before).toContain('נקה את הטקסט')
    expect(before).not.toContain('disabled')
    const onClear = () => {
      value = ''
      notice = 'הטקסט נוקה'
    }
    onClear()
    const after = renderToStaticMarkup(
      <ComposerClearButton hasText={value.length > 0} notice={notice} onClear={onClear} />,
    )
    expect(value).toBe('')
    expect(after).toContain('הטקסט נוקה')
    expect(after).toContain('disabled')
  })

  it('is disabled with a visible notice when there is no text', () => {
    const html = renderToStaticMarkup(
      <ComposerClearButton hasText={false} notice="" onClear={() => undefined} />,
    )
    expect(html).toContain('אין טקסט למחיקה')
    expect(html).toContain('disabled')
    expect(html).toContain('opacity-40')
  })

  it('keeps the assistant title clear of the mobile menu button', () => {
    const html = renderToStaticMarkup(<AssistantChatHeader />)
    expect(html).toContain('data-testid="assistant-header"')
    expect(html).toContain('pl-16')
    expect(html).toContain('pt-16')
    expect(html).toContain('JJ Assistant / העוזר שלי')
  })
})

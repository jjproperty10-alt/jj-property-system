import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantChatHeader, ComposerActionRow, ComposerClearButton, ComposerClearNotice } from '@/components/ops/AssistantChat'

describe('assistant composer clear button', () => {
  it('clears typed text and says so', () => {
    let value = 'שילמתי 500'
    let notice = ''
    const before = renderToStaticMarkup(
      <ComposerClearButton
        hasText={value.length > 0}
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
      <ComposerClearButton hasText={value.length > 0} onClear={onClear} />,
    )
    const noticeHtml = renderToStaticMarkup(<ComposerClearNotice hasText={false} notice={notice} />)
    expect(value).toBe('')
    expect(noticeHtml).toContain('הטקסט נוקה')
    expect(after).toContain('disabled')
  })

  it('is disabled with a visible notice when there is no text', () => {
    const html = renderToStaticMarkup(
      <ComposerClearButton hasText={false} onClear={() => undefined} />,
    )
    const noticeHtml = renderToStaticMarkup(<ComposerClearNotice hasText={false} notice="" />)
    expect(noticeHtml).toContain('אין טקסט למחיקה')
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

  it('keeps the send button on the composer action row', () => {
    const html = renderToStaticMarkup(
      <ComposerActionRow>
        <button type="button" data-testid="assistant-send">Send</button>
      </ComposerActionRow>,
    )
    expect(html).toContain('data-testid="assistant-composer-actions"')
    expect(html).toContain('flex-nowrap')
    expect(html).toContain('assistant-send')
  })
})

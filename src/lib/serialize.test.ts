import { describe, expect, it } from 'bun:test'
import { sanitizeEditorHtml } from './serialize'

describe('sanitizeEditorHtml', () => {
  it('removes script elements and their contents', () => {
    const html = '<p>Before</p><script data-label=">">alert(1)</script><p>After</p>'
    expect(sanitizeEditorHtml(html)).toBe('<p>Before</p><p>After</p>')
  })

  it('removes SVG namespaces and nested active content', () => {
    const html = '<svg onload="alert(1)"><a xlink:href="javascript:alert(2)"><text>Bad</text></a></svg><p>Safe</p>'
    expect(sanitizeEditorHtml(html)).toBe('<p>Safe</p>')
  })

  it('drops event handlers and unsafe URL attributes', () => {
    expect(sanitizeEditorHtml('<p onload=alert(1)>Safe <strong onclick="alert(2)">text</strong></p>')).toBe('<p>Safe <strong>text</strong></p>')
    for (const href of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', '&#106;avascript:alert(1)', 'javascript&colon;alert(1)']) {
      expect(sanitizeEditorHtml(`<a href="${href}">Link</a>`)).toBe('<a>Link</a>')
    }
    expect(sanitizeEditorHtml('<a href="https://example.com/?a=1&amp;b=2">Link</a>')).toBe('<a href="https://example.com/?a=1&amp;b=2">Link</a>')
  })

  it('removes style content and inline style attributes', () => {
    expect(sanitizeEditorHtml('<style>@import "javascript:alert(1)";</style><p style="background:url(javascript:alert(2))">Safe</p>')).toBe('<p>Safe</p>')
  })
  it('keeps only approved document font names', () => {
    expect(sanitizeEditorHtml('<font face="Times New Roman" onclick="alert(1)">Essay</font>'))
      .toBe('<font face="Times New Roman">Essay</font>')
    expect(sanitizeEditorHtml('<font face="Comic Sans MS">Essay</font>'))
      .toBe('<font>Essay</font>')
  })
  it('preserves safe AI rewrite highlights while dropping attributes', () => {
    expect(sanitizeEditorHtml('<p>Original <mark class="ai-rewrite" onclick="alert(1)">improved text</mark>.</p>'))
      .toBe('<p>Original <mark>improved text</mark>.</p>')
  })

  it('preserves only allowlisted highlight colors', () => {
    expect(sanitizeEditorHtml('<mark data-highlight="pink" style="color:red" onclick="alert(1)">Text</mark>'))
      .toBe('<mark data-highlight="pink">Text</mark>')
    expect(sanitizeEditorHtml('<mark data-highlight="javascript:alert(1)">Text</mark>'))
      .toBe('<mark>Text</mark>')
  })
})

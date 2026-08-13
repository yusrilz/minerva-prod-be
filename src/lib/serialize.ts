export function serializeDocument<T extends { _id?: unknown; id?: unknown }>(value: T) {
  const result = { ...value } as Record<string, unknown>
  result.id = String(value._id ?? value.id ?? '')
  delete result._id
  delete result.__v
  return result
}

export function stripHtml(value: string) {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const editorTags = new Set([
  'a', 'b', 'blockquote', 'br', 'div', 'em', 'font', 'h2', 'h3', 'i', 'li', 'mark',
  'ol', 'p', 's', 'strike', 'strong', 'u', 'ul',
])

const droppedContentTags = new Set([
  'button', 'form', 'iframe', 'math', 'object', 'script', 'select', 'style',
  'svg', 'template', 'textarea',
])

type EditorTag = {
  attributes: string
  closing: boolean
  name: string
}

function findTagEnd(value: string, start: number) {
  let quote = ''
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if (character === '>') return index
  }
  return -1
}

function parseEditorTag(value: string): EditorTag | undefined {
  const match = /^<\s*(\/?)\s*([a-z][a-z0-9-]*)(?=[\s/>])([\s\S]*?)>$/i.exec(value)
  if (!match) return undefined
  const closing = match[1] === '/'
  const attributes = match[3] || ''
  if (closing && attributes.trim()) return undefined
  return { attributes, closing, name: (match[2] || '').toLowerCase() }
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeEditorHref(value: string) {
  const href = value.trim().replace(/&amp;/gi, '&')
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return undefined
  if (!/^(?:https?:\/\/|mailto:|\/|\.\.?\/|#|\?)/i.test(href)) return undefined
  return escapeAttribute(href)
}

function editorHref(attributes: string) {
  const match = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attributes)
  return safeEditorHref(match?.[1] ?? match?.[2] ?? match?.[3] ?? '')
}

const editorHighlightColors = new Set(['yellow', 'green', 'blue', 'pink', 'purple'])

function editorHighlight(attributes: string) {
  const match = /(?:^|\s)data-highlight\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attributes)
  const value = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').toLowerCase()
  return editorHighlightColors.has(value) ? value : undefined
}

const editorFonts = new Map([
  ['arial', 'Arial'],
  ['calibri', 'Calibri'],
  ['cambria', 'Cambria'],
  ['courier new', 'Courier New'],
  ['garamond', 'Garamond'],
  ['georgia', 'Georgia'],
  ['times new roman', 'Times New Roman'],
  ['verdana', 'Verdana'],
])

function editorFont(attributes: string) {
  const match = /(?:^|\s)face\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attributes)
  return editorFonts.get((match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim().toLowerCase())
}
function skipElement(value: string, start: number, name: string) {
  const closingTag = new RegExp(`<\\s*\\/\\s*${name}\\s*>`, 'gi')
  closingTag.lastIndex = start
  const match = closingTag.exec(value)
  return match ? match.index + match[0].length : value.length
}

// Rebuild the editor's deliberately small HTML subset from an allowlist. This
// prevents browser-parsed event, style, namespace, and executable URL
// attributes from surviving as persisted markup.
export function sanitizeEditorHtml(value: string) {
  let result = ''
  let cursor = 0

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor)
    if (tagStart === -1) {
      result += value.slice(cursor)
      break
    }
    result += value.slice(cursor, tagStart)

    if (value.startsWith('<!--', tagStart)) {
      const commentEnd = value.indexOf('-->', tagStart + 4)
      if (commentEnd === -1) break
      cursor = commentEnd + 3
      continue
    }

    const tagEnd = findTagEnd(value, tagStart)
    if (tagEnd === -1) {
      result += value.slice(tagStart).replace(/</g, '&lt;')
      break
    }

    const rawTag = value.slice(tagStart, tagEnd + 1)
    const tag = parseEditorTag(rawTag)
    cursor = tagEnd + 1
    if (!tag) {
      if (!/^<\s*[!?]/.test(rawTag)) result += rawTag.replace(/</g, '&lt;')
      continue
    }
    if (!tag.closing && droppedContentTags.has(tag.name)) {
      cursor = skipElement(value, cursor, tag.name)
      continue
    }
    if (!editorTags.has(tag.name)) continue
    if (tag.closing) {
      if (tag.name !== 'br') result += `</${tag.name}>`
      continue
    }

    const href = tag.name === 'a' ? editorHref(tag.attributes) : undefined
    const highlight = tag.name === 'mark' ? editorHighlight(tag.attributes) : undefined
    const font = tag.name === 'font' ? editorFont(tag.attributes) : undefined
    if (href) result += `<a href="${href}">`
    else if (highlight) result += `<mark data-highlight="${highlight}">`
    else if (font) result += `<font face="${font}">`
    else result += `<${tag.name}>`
  }

  return result
}

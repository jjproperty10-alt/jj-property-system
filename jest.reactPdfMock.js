// Mock for @react-pdf/renderer in Jest.
// PDF rendering is not needed in unit tests — this stub prevents ESM parse errors
// from the library's ESM-only distribution.
const noop = () => {}
module.exports = {
  pdf: jest.fn(),
  renderToBuffer: jest.fn(),
  Document: 'Document',
  Page: 'Page',
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Link: 'Link',
  Font: { register: noop, getRegisteredFonts: () => [], getFont: noop },
  StyleSheet: { create: (s) => s },
}

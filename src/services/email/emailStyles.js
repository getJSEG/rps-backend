/**
 * Inline style tokens for transactional emails.
 * Email clients strip <style> blocks and external stylesheets, so every rule has to be
 * inlined on the element. These constants keep that styling in one place.
 *
 * Outlook renders with the Word engine: no flexbox, no box-shadow, no border-radius on
 * table cells. Layout is done with nested tables and these rules stay to what Word supports.
 */

const COLORS = {
  brand: '#0b6bcb',
  link: '#2563eb',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  border: '#eef2f7',
  borderStrong: '#e2e8f0',
  surface: '#ffffff',
  canvas: '#f8fafc',
};

const FONT = 'Arial,Helvetica,sans-serif';

const STYLES = {
  body: `margin:0;padding:0;background:${COLORS.canvas};font-family:${FONT};color:${COLORS.text};`,
  canvasTable: `background:${COLORS.canvas};`,
  canvasCell: 'padding:24px 12px;',
  card: `background:${COLORS.surface};border:1px solid ${COLORS.borderStrong};max-width:600px;`,
  cardInner: 'padding:24px;',
  logoRow: 'padding:0 0 16px;text-align:center;',
  logoImg: 'height:48px;max-width:220px;width:auto;display:block;margin:0 auto;border:0;',
  headingCell: 'vertical-align:middle;',
  // font-weight:normal — email clients bold <h1> by default; keep it plain like a bank alert.
  heading: `margin:0;font-size:18px;line-height:24px;font-weight:normal;color:${COLORS.text};font-family:${FONT};text-align:left;`,
  preheader: `margin:6px 0 0;color:${COLORS.muted};font-size:13px;font-weight:normal;font-family:${FONT};`,
  /** Inbox preview text: present in the DOM, never painted. */
  preheaderHidden: 'display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;',
  content: `margin-top:16px;font-size:14px;line-height:21px;font-weight:normal;color:${COLORS.text};`,
  footer: `text-align:center;color:${COLORS.faint};font-size:12px;margin:12px 0 0;font-family:${FONT};`,
  link: `color:${COLORS.link};`,
  urlText: `color:${COLORS.link};word-break:break-all;`,
  button: `display:inline-block;background:${COLORS.brand};color:${COLORS.surface};text-decoration:none;padding:12px 22px;font-weight:normal;font-size:14px;font-family:${FONT};`,
  buttonTable: 'margin:20px 0 4px;',
  buttonWrap: 'width:100%;margin:20px 0 4px;border-collapse:collapse;',
  buttonCell: `background:${COLORS.brand};`,
  note: `color:${COLORS.muted};font-size:13px;line-height:19px;font-weight:normal;margin-top:10px;`,
  signOffTable: 'width:100%;margin:18px 0 0;border-collapse:collapse;',
  signOffCell: `text-align:center;font-size:14px;line-height:21px;font-weight:normal;color:${COLORS.text};font-family:${FONT};`,
  sectionTitle: `margin:18px 0 4px;font-size:13px;font-weight:normal;color:${COLORS.muted};`,
  address: `margin:0;font-size:14px;line-height:20px;font-weight:normal;color:${COLORS.text};`,
  table: 'width:100%;border-collapse:collapse;margin-top:12px;',
  th: `text-align:left;padding:8px 0;border-bottom:1px solid ${COLORS.borderStrong};font-size:12px;font-weight:normal;color:${COLORS.muted};`,
  thRight: `text-align:right;padding:8px 0;border-bottom:1px solid ${COLORS.borderStrong};font-size:12px;font-weight:normal;color:${COLORS.muted};`,
  td: `padding:10px 0;border-bottom:1px solid ${COLORS.border};font-size:14px;font-weight:normal;`,
  tdRight: `padding:10px 0;border-bottom:1px solid ${COLORS.border};text-align:right;font-size:14px;font-weight:normal;`,
  itemMeta: `color:${COLORS.muted};font-size:12px;font-weight:normal;`,
  totalsTable: 'margin-top:12px;border-collapse:collapse;',
  totalLabel: `padding:4px 0 4px 16px;text-align:right;color:${COLORS.muted};font-size:13px;font-weight:normal;`,
  totalValue: 'padding:4px 0 4px 16px;text-align:right;font-size:13px;font-weight:normal;min-width:90px;',
  totalLabelStrong: `padding:8px 0 4px 16px;text-align:right;font-size:14px;font-weight:normal;border-top:1px solid ${COLORS.borderStrong};`,
  totalValueStrong: `padding:8px 0 4px 16px;text-align:right;font-size:14px;font-weight:normal;border-top:1px solid ${COLORS.borderStrong};min-width:90px;`,
  clear: 'clear:both;height:1px;line-height:1px;font-size:1px;',
  kvTable: 'margin-top:12px;border-collapse:collapse;',
  kvLabel: `padding:4px 16px 4px 0;color:${COLORS.muted};font-size:13px;font-weight:normal;vertical-align:top;`,
  kvValue: 'padding:4px 0;font-size:13px;font-weight:normal;vertical-align:top;',
};

module.exports = { STYLES };

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
  /** Tighter top padding for short auth emails (password reset). */
  canvasCellCompact: 'padding:12px 12px 24px;',
  card: `background:${COLORS.surface};border:1px solid ${COLORS.borderStrong};max-width:600px;`,
  /** Narrower card for password-reset (~540px within 500–550). */
  cardNarrow: `background:${COLORS.surface};border:1px solid ${COLORS.borderStrong};max-width:540px;`,
  cardInner: 'padding:24px;',
  logoRow: 'padding:0 0 20px;text-align:center;',
  logoImg: 'height:48px;max-width:220px;width:auto;display:block;margin:0 auto;border:0;',
  headingCell: 'vertical-align:middle;padding:0 0 8px;',
  // font-weight:normal — email clients bold <h1> by default; keep it plain like a bank alert.
  heading: `margin:0;font-size:20px;line-height:26px;font-weight:normal;color:${COLORS.text};font-family:${FONT};text-align:left;`,
  /** Status / auth headline — brand blue and bold to lead the message. */
  headingAccent: `font-weight:bold;color:${COLORS.brand};`,
  /** Password-reset title: slightly larger than status headlines. */
  headingAuth: `margin:0;font-size:24px;line-height:30px;font-weight:bold;color:${COLORS.brand};font-family:${FONT};text-align:center;`,
  preheader: `margin:6px 0 0;color:${COLORS.muted};font-size:13px;font-weight:normal;font-family:${FONT};`,
  /** Inbox preview text: present in the DOM, never painted. */
  preheaderHidden: 'display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;',
  content: `margin-top:20px;font-size:14px;line-height:21px;font-weight:normal;color:${COLORS.text};`,
  /** Password-reset body: a bit more breathing room between lines. */
  contentAuth: `margin-top:18px;font-size:14px;line-height:24px;font-weight:normal;color:${COLORS.text};`,
  contentAuthPara: `margin:0 0 14px;font-size:14px;line-height:24px;font-weight:normal;color:${COLORS.text};font-family:${FONT};`,
  /** Same visual weight as order-detail labels — not a second heading. */
  greeting: `margin:0 0 20px;font-size:13px;line-height:19px;font-weight:normal;color:${COLORS.muted};font-family:${FONT};`,
  footer: `text-align:center;color:${COLORS.faint};font-size:11px;line-height:16px;margin:0;padding:14px 0 0;border-top:1px solid ${COLORS.border};font-family:${FONT};`,
  footerTable: 'width:100%;margin:20px 0 0;border-collapse:collapse;',
  footerLink: `color:#a8b3c2;text-decoration:underline;`,
  link: `color:${COLORS.link};`,
  urlText: `margin:0 0 4px;color:${COLORS.link};word-break:break-all;font-size:13px;line-height:19px;`,
  button: `display:inline-block;background:${COLORS.brand};color:${COLORS.surface};text-decoration:none;padding:12px 22px;font-weight:normal;font-size:14px;font-family:${FONT};`,
  /** Password-reset CTA: more horizontal padding + bold label. */
  buttonAuth: `display:inline-block;background:${COLORS.brand};color:${COLORS.surface};text-decoration:none;padding:14px 36px;font-weight:bold;font-size:14px;font-family:${FONT};`,
  buttonTable: 'margin:16px 0 4px;',
  buttonWrap: 'width:100%;margin:16px 0 4px;border-collapse:collapse;',
  buttonCell: `background:${COLORS.brand};`,
  emphasis: 'font-weight:bold;',
  note: `color:${COLORS.muted};font-size:13px;line-height:19px;font-weight:normal;margin-top:10px;`,
  sectionMessage: `margin:0 0 12px;font-size:14px;line-height:21px;font-weight:normal;color:${COLORS.text};font-family:${FONT};`,
  /** Prominent refund amount line near the top of refund emails. */
  refundAmount: `margin:0 0 8px;font-size:18px;line-height:24px;font-weight:bold;color:${COLORS.text};font-family:${FONT};`,
  ctaSection: 'margin-top:28px;',
  thankYouSubtle: `text-align:center;font-size:12px;line-height:18px;font-weight:normal;color:${COLORS.muted};font-family:${FONT};`,
  thankYouTable: 'width:100%;margin:24px 0 0;border-collapse:collapse;',
  table: 'width:100%;border-collapse:collapse;margin-top:16px;',
  th: `text-align:left;padding:8px 0;border-bottom:1px solid ${COLORS.borderStrong};font-size:12px;font-weight:normal;color:${COLORS.muted};`,
  thRight: `text-align:right;padding:8px 0;border-bottom:1px solid ${COLORS.borderStrong};font-size:12px;font-weight:normal;color:${COLORS.muted};`,
  td: `padding:8px 0;border-bottom:1px solid ${COLORS.border};font-size:14px;font-weight:normal;`,
  tdRight: `padding:8px 0;border-bottom:1px solid ${COLORS.border};text-align:right;font-size:14px;font-weight:normal;`,
  itemMeta: `color:${COLORS.muted};font-size:12px;font-weight:normal;`,
  totalsTable: 'margin-top:12px;border-collapse:collapse;',
  totalLabel: `padding:4px 0 4px 16px;text-align:right;color:${COLORS.muted};font-size:13px;font-weight:normal;`,
  totalValue: 'padding:4px 0 4px 16px;text-align:right;font-size:13px;font-weight:normal;min-width:90px;',
  totalLabelStrong: `padding:8px 0 4px 16px;text-align:right;font-size:14px;font-weight:normal;border-top:1px solid ${COLORS.borderStrong};`,
  totalValueStrong: `padding:8px 0 4px 16px;text-align:right;font-size:14px;font-weight:normal;border-top:1px solid ${COLORS.borderStrong};min-width:90px;`,
  clear: 'clear:both;height:1px;line-height:1px;font-size:1px;',
  kvTable: 'margin:0 0 4px;border-collapse:collapse;',
  kvLabel: `padding:4px 16px 4px 0;color:${COLORS.muted};font-size:13px;font-weight:normal;vertical-align:top;`,
  kvValue: 'padding:4px 0;font-size:13px;font-weight:normal;vertical-align:top;',
};

module.exports = { STYLES };

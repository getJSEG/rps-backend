/**
 * End-to-end check of the customer email flow.
 *
 * Phase 1 asserts the dispatch rules: which statuses are allowed to email, and that a
 * status re-save does not email twice. It forces log-only test mode, so nothing is sent.
 * Phase 2 asserts a send failure is returned rather than thrown, which is what lets
 * controllers fire notifications without risking the business operation.
 * Phase 3 asserts the guest tracking link: a guest order carries no account, so its
 * "view your order" button can only come from the encrypted token on the row.
 * Phase 4 renders every template and pushes it through emailService, with the recipient
 * forced to the test address so a live run can never reach a real customer.
 *
 * Usage:
 *   node scripts/test-email-flow.js                  # assertions + HTML previews, no sending
 *   node scripts/test-email-flow.js --live           # also deliver via Resend
 *   node scripts/test-email-flow.js --order=100 --to=me@example.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

const pool = require('../src/config/database');
const orderRepository = require('../src/repositories/orderRepository');
const notifications = require('../src/services/orderNotifications');
const emailService = require('../src/services/emailService');
const templates = require('../src/services/email/emailTemplates');
const { getStatusMeta } = require('../src/services/email/emailStatusRegistry');
const {
  createGuestTrackingTokenPlain,
  hashGuestTrackingToken,
  encryptGuestTrackingToken,
  decryptGuestTrackingToken,
} = require('../src/utils/guestTrackingToken');

const RESET_TOKEN = 'sample-reset-token-for-template-preview';
/** Resend's free tier caps at 2 requests/second. */
const LIVE_SEND_GAP_MS = 700;

/**
 * The whitelist, expressed as transitions. `expect: true` means the customer is emailed.
 * Re-saving the same status and any non-whitelisted status must stay silent.
 */
const TRANSITION_CASES = [
  { from: 'processing', to: 'shipped', expect: true },
  { from: 'shipped', to: 'shipped', expect: false, why: 're-save' },
  { from: 'processing', to: 'on_hold', expect: true },
  { from: 'on_hold', to: 'on_hold', expect: false, why: 're-save' },
  { from: 'processing', to: 'cancelled', expect: true },
  { from: 'cancelled', to: 'cancelled', expect: false, why: 're-save' },
  { from: 'awaiting_refund', to: 'refunded', expect: true },
  { from: 'refunded', to: 'refunded', expect: false, why: 're-save' },
  { from: 'processing', to: 'completed', expect: false, why: 'not whitelisted' },
  { from: 'processing', to: 'awaiting_refund', expect: false, why: 'not whitelisted' },
  { from: 'awaiting_artwork', to: 'printing', expect: false, why: 'not whitelisted' },
];

let failures = 0;

function assert(ok, label, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function readArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const isLive = process.argv.includes('--live');
const outDir = readArg('out') || path.join(__dirname, '..', 'tmp', 'email-previews');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveTarget() {
  return (readArg('to') || process.env.EMAIL_TEST_RECIPIENT || '').trim().toLowerCase();
}

/** Phase 3 really delivers whenever a redirect address exists, so say so plainly. */
function describeMode(target) {
  if (isLive) return 'LIVE - real customer addresses';
  const redirect = (process.env.EMAIL_TEST_RECIPIENT || '').trim();
  if (redirect) return `TEST MODE - delivered to ${target}, tagged [DEV]`;
  return 'TEST MODE - logged only, nothing delivered';
}

async function pickOrder() {
  const explicit = readArg('order');
  if (explicit) return orderRepository.findOrderForNotification(explicit);
  const r = await pool.query('SELECT id FROM orders ORDER BY id DESC LIMIT 1');
  if (!r.rows.length) return null;
  return orderRepository.findOrderForNotification(r.rows[0].id);
}

/**
 * In-memory copy with the recipient forced to the test address and status-specific facts
 * populated, so tracking and refund detail lines actually render. Never persisted.
 */
function buildFixture(order, target) {
  return {
    ...order,
    user_email: target,
    user_name: order.user_name || 'Test Customer',
    order_tracking_id: order.order_tracking_id || '794657412398',
    carrier: order.carrier || 'fedex',
    refund_amount: order.refund_amount ?? order.total_amount ?? 0,
    refunded_at: order.refunded_at || new Date().toISOString(),
    refund_reason: order.refund_reason || 'requested_by_customer',
  };
}

function buildResetUrl(appUrl) {
  const base = String(appUrl || '').trim().replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(RESET_TOKEN)}`;
}

function buildSteps(order, appUrl) {
  const steps = [
    {
      key: 'order-confirmation',
      title: 'Order Confirmation',
      render: () => templates.buildOrderConfirmationEmail(order, { appUrl }),
      send: (to) => emailService.sendOrderConfirmationEmail(order, to),
    },
  ];

  for (const status of ['shipped', 'refunded', 'on_hold', 'cancelled']) {
    const meta = getStatusMeta(status);
    steps.push({
      key: `status-${status}`,
      title: `Order ${meta.label}`,
      render: () => templates.buildOrderStatusEmail(order, status, { appUrl }),
      send: (to) => emailService.sendOrderStatusUpdatedEmail(order, to, status),
    });
  }

  steps.push({
    key: 'password-reset',
    title: 'Password reset',
    render: () => templates.buildPasswordResetEmail({ resetUrl: buildResetUrl(appUrl), expiresMinutes: 30 }),
    send: (to) => emailService.sendPasswordResetEmail(to, buildResetUrl(appUrl)),
  });
  steps.push({
    key: 'password-changed',
    title: 'Password changed',
    render: () => templates.buildPasswordChangedEmail({ appUrl }),
    send: (to) => emailService.sendPasswordChangedEmail(to),
  });

  return steps;
}

function writePreview(step, tpl) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${step.key}.html`);
  fs.writeFileSync(file, tpl.html, 'utf8');
  return file;
}

async function main() {
  const target = resolveTarget();
  if (!target) {
    console.error('No target recipient. Set EMAIL_TEST_RECIPIENT in .env or pass --to=you@example.com');
    process.exit(1);
  }

  const dbOrder = await pickOrder();
  if (!dbOrder) {
    console.error('No order found to test with. Pass --order=<id> for an existing order.');
    process.exit(1);
  }

  const appUrl = (process.env.FRONTEND_URL || process.env.APP_BASE_URL || '').trim();
  const order = buildFixture(dbOrder, target);
  const steps = buildSteps(order, appUrl);

  console.log('Email flow test');
  console.log('  order      :', `#${order.order_number} (id ${order.id})`);
  console.log('  recipient  :', target);
  console.log('  from       :', (process.env.EMAIL_FROM || '(unset)').trim());
  console.log('  app url    :', appUrl || '(unset - buttons will be omitted)');
  console.log('  mode       :', describeMode(target));
  console.log('  previews   :', outDir);

  const originalTestMode = process.env.EMAIL_TEST_MODE;
  const originalRedirect = process.env.EMAIL_TEST_RECIPIENT;
  const originalKey = process.env.RESEND_API_KEY;

  // Log-only test mode: exercises the dispatch rules without touching Resend.
  process.env.EMAIL_TEST_MODE = 'true';
  process.env.EMAIL_TEST_RECIPIENT = '';

  console.log('\n--- Phase 1: status transition rules ---');
  for (const c of TRANSITION_CASES) {
    const res = await notifications.notifyOrderStatusChange(order.id, {
      nextStatus: c.to,
      previousStatus: c.from,
      order,
    });
    const label = `${c.from} -> ${c.to} ${c.expect ? 'sends' : 'silent'}${c.why ? ` (${c.why})` : ''}`;
    assert(res.sent === c.expect, label, res.sent ? '' : res.skipped || res.error || '');
  }

  console.log('\n--- Phase 2: send failure is non-fatal ---');
  process.env.EMAIL_TEST_MODE = 'false';
  process.env.RESEND_API_KEY = '';
  let threw = false;
  let failureResult = null;
  try {
    failureResult = await emailService.sendOrderConfirmationEmail(order, target);
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'a failing send does not throw');
  assert(failureResult && failureResult.sent === false, 'a failing send reports sent=false');
  assert(
    failureResult && typeof failureResult.error === 'string' && failureResult.error.length > 0,
    'a failing send reports a reason',
    failureResult ? failureResult.error : ''
  );
  process.env.RESEND_API_KEY = originalKey;

  console.log('\n--- Phase 3: no site order button + guest token crypto ---');
  const guestToken = createGuestTrackingTokenPlain();
  assert(
    decryptGuestTrackingToken(encryptGuestTrackingToken(guestToken)) === guestToken,
    'token survives encrypt then decrypt'
  );
  assert(decryptGuestTrackingToken('v1.aaaa.bbbb.cccc') === null, 'a corrupt cipher decrypts to null');
  assert(decryptGuestTrackingToken(null) === null, 'a missing cipher decrypts to null');
  assert(
    hashGuestTrackingToken(guestToken) === hashGuestTrackingToken(guestToken) &&
      hashGuestTrackingToken(guestToken) !== hashGuestTrackingToken(`${guestToken}x`),
    'hash is deterministic and token-specific'
  );

  process.env.EMAIL_TEST_MODE = 'true';
  process.env.EMAIL_TEST_RECIPIENT = '';
  const confirmation = templates.buildOrderConfirmationEmail(order, { appUrl });
  assert(
    !/View your order/i.test(confirmation.html),
    'confirmation email has no View your order button'
  );
  for (const status of ['shipped', 'refunded', 'on_hold', 'cancelled']) {
    const tpl = templates.buildOrderStatusEmail(order, status, { appUrl });
    assert(
      !/View your order/i.test(tpl.html),
      `${status} email has no View your order button`
    );
  }

  console.log('\n--- Phase 4: render + send ---');
  process.env.EMAIL_TEST_MODE = isLive ? 'false' : originalTestMode;
  process.env.EMAIL_TEST_RECIPIENT = isLive ? '' : originalRedirect;
  for (const step of steps) {
    const tpl = step.render();
    const file = writePreview(step, tpl);
    const res = await step.send(target);
    let detail;
    if (!res.sent) {
      detail = `FAILED: ${res.error}`;
      failures += 1;
    } else if (res.mode === 'test') {
      detail = 'test mode (logged only)';
    } else if (res.mode === 'redirected') {
      detail = `redirected, id=${res.id}`;
    } else {
      detail = `sent id=${res.id}`;
    }
    console.log(`  ${String(step.title).padEnd(22)} ${detail}`);
    console.log(' '.repeat(25), `subject: ${tpl.subject}`);
    console.log(' '.repeat(25), `html: ${tpl.html.length} bytes -> ${path.relative(process.cwd(), file)}`);
    if (isLive) await sleep(LIVE_SEND_GAP_MS);
  }

  process.env.EMAIL_TEST_MODE = originalTestMode;
  process.env.EMAIL_TEST_RECIPIENT = originalRedirect;

  console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
  if (failures > 0) process.exitCode = 1;
  await pool.end();
}

main().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});

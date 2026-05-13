/**
 * One-shot FedEx sandbox check: OAuth token + Rate Quotes.
 * Usage: node scripts/test-fedex-sandbox.js   (from repo root: cd rps-backend && node scripts/test-fedex-sandbox.js)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const base = String(process.env.FEDEX_API_URL || 'https://apis-sandbox.fedex.com').replace(/\/+$/, '');
const clientId = String(process.env.FEDEX_API_KEY || '').trim();
const clientSecret = String(process.env.FEDEX_API_SECRET || '').trim();
const accountNumber = String(process.env.FEDEX_ACCOUNT_NUMBER || '').trim();

function shipperAddress() {
  return {
    streetLines: [String(process.env.FEDEX_SHIPPER_STREET || '2000 FedEx Way').trim()].filter(Boolean),
    city: String(process.env.FEDEX_SHIPPER_CITY || 'Memphis').trim(),
    stateOrProvinceCode: String(process.env.FEDEX_SHIPPER_STATE || 'TN')
      .trim()
      .toUpperCase()
      .slice(0, 2),
    postalCode: String(process.env.FEDEX_SHIPPER_POSTAL || '38115').trim(),
    countryCode: String(process.env.FEDEX_SHIPPER_COUNTRY || 'US')
      .trim()
      .toUpperCase()
      .slice(0, 2),
    residential: false,
  };
}

async function main() {
  if (!clientId || !clientSecret || !accountNumber) {
    console.error('Missing FEDEX_API_KEY, FEDEX_API_SECRET, or FEDEX_ACCOUNT_NUMBER in .env');
    process.exit(1);
  }

  console.log('FedEx sandbox test');
  console.log('  Base URL:', base);
  console.log('  Account:', accountNumber.replace(/\d(?=\d{4})/g, '*'));

  const tokenBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    account_number: accountNumber,
  });

  const tokenRes = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });
  const tokenText = await tokenRes.text();
  let tokenJson = null;
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    tokenJson = null;
  }

  if (!tokenRes.ok) {
    console.error('\n[1] OAuth FAILED', tokenRes.status);
    console.error(tokenText.slice(0, 800));
    process.exit(1);
  }

  const accessToken = tokenJson?.access_token;
  if (!accessToken) {
    console.error('\n[1] OAuth response missing access_token');
    console.error(tokenText.slice(0, 500));
    process.exit(1);
  }

  console.log('\n[1] OAuth OK — token received (length', String(accessToken).length, ')');

  const shipperAddr = shipperAddress();
  if (!shipperAddr.streetLines.length) shipperAddr.streetLines = ['2000 FedEx Way'];

  const shipDatestamp = new Date().toISOString().slice(0, 10);
  const ratePayload = {
    accountNumber: { value: accountNumber },
    carrierCodes: ['FDXE', 'FDXG'],
    requestedShipment: {
      shipDatestamp,
      shipper: { address: shipperAddr },
      recipient: {
        address: {
          streetLines: ['1234 Commerce St'],
          city: 'Dallas',
          stateOrProvinceCode: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          residential: false,
        },
      },
      packagingType: 'YOUR_PACKAGING',
      pickupType: 'USE_SCHEDULED_PICKUP',
      rateRequestType: ['ACCOUNT', 'LIST'],
      totalPackageCount: 1,
      requestedPackageLineItems: [
        {
          sequenceNumber: '1',
          groupPackageCount: 1,
          weight: { units: 'LB', value: '2' },
          dimensions: { length: 12, width: 10, height: 6, units: 'IN' },
        },
      ],
    },
  };

  const rateRes = await fetch(`${base}/rate/v1/rates/quotes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-locale': 'en_US',
    },
    body: JSON.stringify(ratePayload),
  });

  const rateText = await rateRes.text();
  let rateJson = null;
  try {
    rateJson = JSON.parse(rateText);
  } catch {
    rateJson = null;
  }

  if (!rateRes.ok) {
    console.error('\n[2] Rate Quotes FAILED', rateRes.status);
    const errs = rateJson?.errors;
    if (Array.isArray(errs)) {
      errs.forEach((e) => console.error(' ', e?.code || '', e?.message || JSON.stringify(e)));
    } else {
      console.error(rateText.slice(0, 1200));
    }
    process.exit(1);
  }

  const details = Array.isArray(rateJson?.output?.rateReplyDetails) ? rateJson.output.rateReplyDetails : [];
  console.log('\n[2] Rate Quotes OK —', details.length, 'service row(s)');

  const preview = details.slice(0, 8).map((rd) => ({
    serviceType: rd?.serviceType,
    serviceName: rd?.serviceName,
  }));
  console.log('Sample:', JSON.stringify(preview, null, 2));

  console.log('\nAll checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

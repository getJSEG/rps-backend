const US_STATE_NAME_TO_CODE = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

/** "Texas" | "tx" | "TX" → "TX". Unknown values return "". */
function toUsStateCode(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  const upper = v.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return US_STATE_NAME_TO_CODE[v.toLowerCase()] || '';
}

/** Prefer a 2-letter code; keep the original string if it cannot be mapped. */
function normalizeUsStateForStorage(raw) {
  const v = String(raw ?? '').trim();
  return toUsStateCode(v) || v;
}

function withNormalizedState(row) {
  if (!row || typeof row !== 'object') return row;
  return { ...row, state: normalizeUsStateForStorage(row.state) };
}

module.exports = { toUsStateCode, normalizeUsStateForStorage, withNormalizedState };

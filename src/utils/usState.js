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

/** Map "Texas" / "tx" to "TX" for FedEx. Unknown values return "". */
function toUsStateCode(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  const upper = v.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return US_STATE_NAME_TO_CODE[v.toLowerCase()] || '';
}

/**
 * USPS 3-digit ZIP prefix ranges → state, [from, to, code], checked in order (exceptions first).
 * Military (AA/AE/AP) and territories other than PR are left out on purpose.
 */
const ZIP3_STATE_RANGES = [
  [5, 5, 'NY'],
  [6, 7, 'PR'],
  [9, 9, 'PR'],
  [55, 55, 'MA'],
  [10, 27, 'MA'],
  [28, 29, 'RI'],
  [30, 38, 'NH'],
  [39, 49, 'ME'],
  [50, 59, 'VT'],
  [60, 69, 'CT'],
  [70, 89, 'NJ'],
  [100, 149, 'NY'],
  [150, 196, 'PA'],
  [197, 199, 'DE'],
  [201, 201, 'VA'],
  [200, 205, 'DC'],
  [206, 219, 'MD'],
  [220, 246, 'VA'],
  [247, 268, 'WV'],
  [270, 289, 'NC'],
  [290, 299, 'SC'],
  [300, 319, 'GA'],
  [398, 399, 'GA'],
  [320, 339, 'FL'],
  [341, 349, 'FL'],
  [350, 369, 'AL'],
  [370, 385, 'TN'],
  [386, 397, 'MS'],
  [400, 427, 'KY'],
  [430, 459, 'OH'],
  [460, 479, 'IN'],
  [480, 499, 'MI'],
  [500, 528, 'IA'],
  [530, 549, 'WI'],
  [550, 567, 'MN'],
  [569, 569, 'DC'],
  [570, 577, 'SD'],
  [580, 588, 'ND'],
  [590, 599, 'MT'],
  [600, 629, 'IL'],
  [630, 658, 'MO'],
  [660, 679, 'KS'],
  [680, 693, 'NE'],
  [700, 714, 'LA'],
  [716, 729, 'AR'],
  [733, 733, 'TX'],
  [730, 749, 'OK'],
  [750, 799, 'TX'],
  [885, 885, 'TX'],
  [800, 816, 'CO'],
  [820, 831, 'WY'],
  [832, 838, 'ID'],
  [840, 847, 'UT'],
  [850, 865, 'AZ'],
  [870, 884, 'NM'],
  [889, 898, 'NV'],
  [900, 961, 'CA'],
  [967, 968, 'HI'],
  [970, 979, 'OR'],
  [980, 994, 'WA'],
  [995, 999, 'AK'],
];

/** "77002" / "77002-1234" → "TX". Unknown or non-US ZIPs return "". */
function stateCodeFromZip(raw) {
  const m = String(raw ?? '').trim().match(/^(\d{3})\d{2}(?:-\d{4})?$/);
  if (!m) return '';
  const prefix = Number(m[1]);
  const hit = ZIP3_STATE_RANGES.find(([from, to]) => prefix >= from && prefix <= to);
  return hit ? hit[2] : '';
}

module.exports = { toUsStateCode, stateCodeFromZip };

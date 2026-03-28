const shippingRatesRepository = require('../repositories/shippingRatesRepository');

const getShippingRates = async (req, res) => {
  try {
    const rates = await shippingRatesRepository.getRates();
    res.json({ rates });
  } catch (error) {
    console.error('getShippingRates:', error);
    res.status(500).json({ message: 'Failed to load shipping rates', error: error.message });
  }
};

const putShippingRatesAdmin = async (req, res) => {
  try {
    const g = parseFloat(req.body.ground);
    const e = parseFloat(req.body.express);
    const o = parseFloat(req.body.overnight);
    if (![g, e, o].every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ message: 'ground, express, and overnight must be non-negative numbers' });
    }
    const rates = await shippingRatesRepository.updateRates({ ground: g, express: e, overnight: o });
    res.json({ rates });
  } catch (error) {
    console.error('putShippingRatesAdmin:', error);
    res.status(500).json({ message: 'Failed to update shipping rates', error: error.message });
  }
};

module.exports = { getShippingRates, putShippingRatesAdmin };

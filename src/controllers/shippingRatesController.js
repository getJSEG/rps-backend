const shippingRatesRepository = require('../repositories/shippingRatesRepository');

const getShippingRates = async (req, res) => {
  try {
    const full = await shippingRatesRepository.getRates();
    res.json({
      rates: { ground: full.ground, express: full.express, overnight: full.overnight },
      freeShippingEnabled: full.freeShippingEnabled,
      freeShippingThreshold: full.freeShippingThreshold,
      tierDiscounts: full.tierDiscounts,
    });
  } catch (error) {
    console.error('getShippingRates:', error);
    res.status(500).json({ message: 'Failed to load shipping rates' });
  }
};

const putShippingRatesAdmin = async (req, res) => {
  try {
    const cur = await shippingRatesRepository.getRates();
    const g = req.body?.ground !== undefined ? parseFloat(req.body.ground) : cur.ground;
    const e = req.body?.express !== undefined ? parseFloat(req.body.express) : cur.express;
    const o = req.body?.overnight !== undefined ? parseFloat(req.body.overnight) : cur.overnight;
    if (![g, e, o].every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ message: 'ground, express, and overnight must be non-negative numbers' });
    }
    const freeShippingEnabled =
      req.body?.freeShippingEnabled !== undefined ? !!req.body.freeShippingEnabled : cur.freeShippingEnabled;
    const freeThRaw =
      req.body?.freeShippingThreshold !== undefined ? parseFloat(req.body.freeShippingThreshold) : cur.freeShippingThreshold;
    if (!Number.isFinite(freeThRaw) || freeThRaw < 0) {
      return res.status(400).json({ message: 'freeShippingThreshold must be a non-negative number' });
    }
    const tierDiscounts = {};
    for (const tier of ['economy', 'standard', 'express']) {
      const raw = req.body?.tierDiscounts?.[tier];
      if (raw === undefined) continue;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({ message: `The ${tier} shipping discount must be between 0 and 100.` });
      }
      tierDiscounts[tier] = n;
    }
    const full = await shippingRatesRepository.updateRates({
      ground: g,
      express: e,
      overnight: o,
      freeShippingEnabled,
      freeShippingThreshold: freeThRaw,
      tierDiscounts,
    });
    res.json({
      rates: { ground: full.ground, express: full.express, overnight: full.overnight },
      freeShippingEnabled: full.freeShippingEnabled,
      freeShippingThreshold: full.freeShippingThreshold,
      tierDiscounts: full.tierDiscounts,
    });
  } catch (error) {
    console.error('putShippingRatesAdmin:', error);
    res.status(500).json({ message: 'Failed to update shipping rates' });
  }
};

module.exports = {
  getShippingRates,
  putShippingRatesAdmin,
};

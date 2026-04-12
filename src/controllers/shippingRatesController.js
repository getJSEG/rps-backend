const shippingRatesRepository = require('../repositories/shippingRatesRepository');

const getShippingRates = async (req, res) => {
  try {
    const full = await shippingRatesRepository.getRates();
    const methods = await shippingRatesRepository.getAllMethods({ includeInactive: false });
    res.json({
      rates: { ground: full.ground, express: full.express, overnight: full.overnight },
      freeShippingEnabled: full.freeShippingEnabled,
      freeShippingThreshold: full.freeShippingThreshold,
      methods,
    });
  } catch (error) {
    console.error('getShippingRates:', error);
    res.status(500).json({ message: 'Failed to load shipping rates', error: error.message });
  }
};

const getShippingMethodsAdmin = async (req, res) => {
  try {
    const methods = await shippingRatesRepository.getAllMethods({ includeInactive: true });
    res.json({ methods });
  } catch (error) {
    console.error('getShippingMethodsAdmin:', error);
    res.status(500).json({ message: 'Failed to load shipping methods', error: error.message });
  }
};

const createShippingMethodAdmin = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const price = parseFloat(req.body?.price);
    const isActive = req.body?.isActive !== false;
    if (!name) return res.status(400).json({ message: 'name is required' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'price must be a non-negative number' });
    const method = await shippingRatesRepository.createMethod({ name, price, isActive });
    res.status(201).json({ method });
  } catch (error) {
    console.error('createShippingMethodAdmin:', error);
    res.status(500).json({ message: 'Failed to create shipping method', error: error.message });
  }
};

const updateShippingMethodAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const payload = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'name cannot be empty' });
      payload.name = name;
    }
    if (req.body?.price !== undefined) {
      const price = parseFloat(req.body.price);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ message: 'price must be a non-negative number' });
      }
      payload.price = price;
    }
    if (req.body?.isActive !== undefined) payload.isActive = !!req.body.isActive;
    const method = await shippingRatesRepository.updateMethod(id, payload);
    if (!method) return res.status(404).json({ message: 'Shipping method not found' });
    res.json({ method });
  } catch (error) {
    console.error('updateShippingMethodAdmin:', error);
    res.status(500).json({ message: 'Failed to update shipping method', error: error.message });
  }
};

const deleteShippingMethodAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const deleted = await shippingRatesRepository.deleteMethod(id);
    if (!deleted) return res.status(404).json({ message: 'Shipping method not found' });
    res.json({ message: 'Shipping method deleted' });
  } catch (error) {
    console.error('deleteShippingMethodAdmin:', error);
    res.status(500).json({ message: 'Failed to delete shipping method', error: error.message });
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
    const full = await shippingRatesRepository.updateRates({
      ground: g,
      express: e,
      overnight: o,
      freeShippingEnabled,
      freeShippingThreshold: freeThRaw,
    });
    res.json({
      rates: { ground: full.ground, express: full.express, overnight: full.overnight },
      freeShippingEnabled: full.freeShippingEnabled,
      freeShippingThreshold: full.freeShippingThreshold,
    });
  } catch (error) {
    console.error('putShippingRatesAdmin:', error);
    res.status(500).json({ message: 'Failed to update shipping rates', error: error.message });
  }
};

module.exports = {
  getShippingRates,
  putShippingRatesAdmin,
  getShippingMethodsAdmin,
  createShippingMethodAdmin,
  updateShippingMethodAdmin,
  deleteShippingMethodAdmin,
};

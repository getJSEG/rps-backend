const shippingRatesRepository = require('../repositories/shippingRatesRepository');

const getShippingRates = async (req, res) => {
  try {
    const rates = await shippingRatesRepository.getRates();
    const methods = await shippingRatesRepository.getAllMethods({ includeInactive: false });
    res.json({ rates, methods });
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

module.exports = {
  getShippingRates,
  putShippingRatesAdmin,
  getShippingMethodsAdmin,
  createShippingMethodAdmin,
  updateShippingMethodAdmin,
  deleteShippingMethodAdmin,
};

const shippingBoxesRepository = require('../repositories/shippingBoxesRepository');

function positiveNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    const error = new Error(`${label} must be greater than zero`);
    error.statusCode = 400;
    throw error;
  }
  return n;
}

const getShippingBoxesAdmin = async (req, res) => {
  try {
    const boxes = await shippingBoxesRepository.getAll({ includeInactive: true });
    res.json({ boxes });
  } catch (error) {
    console.error('getShippingBoxesAdmin:', error);
    res.status(500).json({ message: 'Failed to load shipping boxes' });
  }
};

const createShippingBoxAdmin = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'name is required' });
    const box = await shippingBoxesRepository.create({
      name,
      length: positiveNumber(req.body?.length, 'length'),
      width: positiveNumber(req.body?.width, 'width'),
      height: positiveNumber(req.body?.height, 'height'),
      isActive: req.body?.isActive !== false,
    });
    res.status(201).json({ box });
  } catch (error) {
    console.error('createShippingBoxAdmin:', error);
    res.status(Number(error.statusCode) || 500).json({
      message: error?.message || 'Failed to create shipping box',
    });
  }
};

const updateShippingBoxAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const payload = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'name cannot be empty' });
      payload.name = name;
    }
    if (req.body?.length !== undefined) payload.length = positiveNumber(req.body.length, 'length');
    if (req.body?.width !== undefined) payload.width = positiveNumber(req.body.width, 'width');
    if (req.body?.height !== undefined) payload.height = positiveNumber(req.body.height, 'height');
    if (req.body?.isActive !== undefined) payload.isActive = !!req.body.isActive;

    const box = await shippingBoxesRepository.update(id, payload);
    if (!box) return res.status(404).json({ message: 'Shipping box not found' });
    res.json({ box });
  } catch (error) {
    console.error('updateShippingBoxAdmin:', error);
    res.status(Number(error.statusCode) || 500).json({
      message: error?.message || 'Failed to update shipping box',
    });
  }
};

const deleteShippingBoxAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const deleted = await shippingBoxesRepository.remove(id);
    if (!deleted) return res.status(404).json({ message: 'Shipping box not found' });
    res.json({ message: 'Shipping box deleted' });
  } catch (error) {
    console.error('deleteShippingBoxAdmin:', error);
    if (error?.code === '23503') {
      return res.status(400).json({ message: 'This box is used by product rules. Deactivate it instead.' });
    }
    res.status(500).json({ message: 'Failed to delete shipping box' });
  }
};

module.exports = {
  getShippingBoxesAdmin,
  createShippingBoxAdmin,
  updateShippingBoxAdmin,
  deleteShippingBoxAdmin,
};

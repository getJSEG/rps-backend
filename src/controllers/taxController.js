const taxRepository = require('../repositories/taxRepository');

function parseTaxId(req) {
  const id = parseInt(req.params.id, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parsePercentage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

async function getTaxesAdmin(req, res) {
  try {
    const taxes = await taxRepository.getAllTaxes();
    res.json({ taxes });
  } catch (error) {
    console.error('getTaxesAdmin:', error);
    res.status(500).json({ message: 'Failed to load taxes' });
  }
}

async function getActiveTax(req, res) {
  try {
    const tax = await taxRepository.getActiveTax();
    res.json({ tax });
  } catch (error) {
    console.error('getActiveTax:', error);
    res.status(500).json({ message: 'Failed to load active tax' });
  }
}

async function createTaxAdmin(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const percentage = parsePercentage(req.body?.percentage);
    const isActive = req.body?.isActive === true;
    if (!name) return res.status(400).json({ message: 'name is required' });
    if (percentage == null) return res.status(400).json({ message: 'percentage must be a non-negative number' });
    const tax = await taxRepository.createTax({ name, percentage, isActive });
    res.status(201).json({ tax });
  } catch (error) {
    console.error('createTaxAdmin:', error);
    res.status(500).json({ message: 'Failed to create tax' });
  }
}

async function updateTaxAdmin(req, res) {
  try {
    const id = parseTaxId(req);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const payload = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'name cannot be empty' });
      payload.name = name;
    }
    if (req.body?.percentage !== undefined) {
      const percentage = parsePercentage(req.body.percentage);
      if (percentage == null) return res.status(400).json({ message: 'percentage must be a non-negative number' });
      payload.percentage = percentage;
    }
    if (req.body?.isActive !== undefined) payload.isActive = !!req.body.isActive;
    const tax = await taxRepository.updateTax(id, payload);
    if (!tax) return res.status(404).json({ message: 'Tax not found' });
    res.json({ tax });
  } catch (error) {
    console.error('updateTaxAdmin:', error);
    res.status(500).json({ message: 'Failed to update tax' });
  }
}

async function deleteTaxAdmin(req, res) {
  try {
    const id = parseTaxId(req);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const deleted = await taxRepository.deleteTax(id);
    if (!deleted) return res.status(404).json({ message: 'Tax not found' });
    res.json({ message: 'Tax deleted' });
  } catch (error) {
    console.error('deleteTaxAdmin:', error);
    res.status(500).json({ message: 'Failed to delete tax' });
  }
}

async function activateTaxAdmin(req, res) {
  try {
    const id = parseTaxId(req);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const tax = await taxRepository.activateTax(id);
    if (!tax) return res.status(404).json({ message: 'Tax not found' });
    res.json({ tax });
  } catch (error) {
    console.error('activateTaxAdmin:', error);
    res.status(500).json({ message: 'Failed to activate tax' });
  }
}

module.exports = {
  getTaxesAdmin,
  getActiveTax,
  createTaxAdmin,
  updateTaxAdmin,
  deleteTaxAdmin,
  activateTaxAdmin,
};

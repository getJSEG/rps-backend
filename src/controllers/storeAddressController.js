const repo = require('../repositories/storeAddressRepository');

function toBool(v, fallback = true) {
  if (v === undefined || v === null) return fallback;
  if (v === true || v === false) return v;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function optionalString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
}

function readPayload(body = {}) {
  return {
    label: String(body.label ?? '').trim(),
    company: optionalString(body.company),
    contact_name: optionalString(body.contactName ?? body.contact_name),
    phone: optionalString(body.phone),
    street_address: String(body.streetAddress ?? body.street_address ?? '').trim(),
    address_line2: optionalString(body.addressLine2 ?? body.address_line2),
    city: String(body.city ?? '').trim(),
    state: String(body.state ?? '').trim(),
    postcode: String(body.postcode ?? '').trim(),
    country: String(body.country ?? 'United States').trim() || 'United States',
    is_default: toBool(body.isDefault ?? body.is_default, false),
    is_active: toBool(body.isActive ?? body.is_active, true),
  };
}

function validateRequired(payload) {
  if (!payload.label || !payload.street_address || !payload.city || !payload.state || !payload.postcode) {
    return 'label, streetAddress, city, state and postcode are required';
  }
  return null;
}

const getStoreAddressesAdmin = async (_req, res) => {
  try {
    const addresses = await repo.listAllAdmin();
    res.json({ addresses });
  } catch (error) {
    console.error('getStoreAddressesAdmin:', error);
    res.status(500).json({ message: 'Failed to load store addresses' });
  }
};

const createStoreAddressAdmin = async (req, res) => {
  try {
    const payload = readPayload(req.body);
    const validationError = validateRequired(payload);
    if (validationError) return res.status(400).json({ message: validationError });
    const address = await repo.createAddress(payload);
    res.status(201).json({ address });
  } catch (error) {
    console.error('createStoreAddressAdmin:', error);
    res.status(500).json({ message: 'Failed to create store address' });
  }
};

const updateStoreAddressAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
    const payload = readPayload(req.body);
    const validationError = validateRequired(payload);
    if (validationError) return res.status(400).json({ message: validationError });
    const address = await repo.updateAddress(id, payload);
    if (!address) return res.status(404).json({ message: 'Address not found' });
    res.json({ address });
  } catch (error) {
    console.error('updateStoreAddressAdmin:', error);
    res.status(500).json({ message: 'Failed to update store address' });
  }
};

const setDefaultStoreAddressAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
    const address = await repo.setDefault(id);
    if (!address) return res.status(404).json({ message: 'Address not found' });
    res.json({ address });
  } catch (error) {
    console.error('setDefaultStoreAddressAdmin:', error);
    res.status(500).json({ message: 'Failed to set default store address' });
  }
};

const deleteStoreAddressAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
    const deletedId = await repo.archiveAddress(id);
    if (!deletedId) return res.status(404).json({ message: 'Address not found' });
    res.json({ message: 'Address archived', id: deletedId });
  } catch (error) {
    console.error('deleteStoreAddressAdmin:', error);
    res.status(500).json({ message: 'Failed to delete store address' });
  }
};

module.exports = {
  getStoreAddressesAdmin,
  createStoreAddressAdmin,
  updateStoreAddressAdmin,
  setDefaultStoreAddressAdmin,
  deleteStoreAddressAdmin,
};

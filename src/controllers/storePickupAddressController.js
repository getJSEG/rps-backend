const repo = require('../repositories/storePickupAddressRepository');

function toBool(v, fallback = true) {
  if (v === undefined || v === null) return fallback;
  if (v === true || v === false) return v;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function readPayload(body = {}) {
  return {
    label: String(body.label ?? '').trim(),
    street_address: String(body.streetAddress ?? body.street_address ?? '').trim(),
    address_line2:
      body.addressLine2 ?? body.address_line2 ? String(body.addressLine2 ?? body.address_line2).trim() : null,
    city: String(body.city ?? '').trim(),
    state: String(body.state ?? '').trim(),
    postcode: String(body.postcode ?? '').trim(),
    country: String(body.country ?? 'United States').trim() || 'United States',
    is_active: toBool(body.is_active ?? body.isActive, true),
  };
}

const getPublicStorePickupAddresses = async (_req, res) => {
  try {
    const addresses = await repo.listActive();
    res.json({ addresses });
  } catch (error) {
    console.error('getPublicStorePickupAddresses:', error);
    res.status(500).json({ message: 'Failed to load store pickup addresses' });
  }
};

const getStorePickupAddressesAdmin = async (_req, res) => {
  try {
    const addresses = await repo.listAllAdmin();
    res.json({ addresses });
  } catch (error) {
    console.error('getStorePickupAddressesAdmin:', error);
    res.status(500).json({ message: 'Failed to load store pickup addresses' });
  }
};

const createStorePickupAddressAdmin = async (req, res) => {
  try {
    const payload = readPayload(req.body);
    if (!payload.label || !payload.street_address || !payload.city || !payload.state || !payload.postcode) {
      return res.status(400).json({ message: 'label, streetAddress, city, state and postcode are required' });
    }
    const address = await repo.createAddress(payload);
    res.status(201).json({ address });
  } catch (error) {
    console.error('createStorePickupAddressAdmin:', error);
    res.status(500).json({ message: 'Failed to create store pickup address' });
  }
};

const updateStorePickupAddressAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
    const payload = readPayload(req.body);
    const address = await repo.updateAddress(id, payload);
    if (!address) return res.status(404).json({ message: 'Address not found' });
    res.json({ address });
  } catch (error) {
    console.error('updateStorePickupAddressAdmin:', error);
    res.status(500).json({ message: 'Failed to update store pickup address' });
  }
};

const deleteStorePickupAddressAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
    const deletedId = await repo.deleteAddress(id);
    if (!deletedId) return res.status(404).json({ message: 'Address not found' });
    res.json({ message: 'Address archived', id: deletedId });
  } catch (error) {
    console.error('deleteStorePickupAddressAdmin:', error);
    res.status(500).json({ message: 'Failed to delete store pickup address' });
  }
};

module.exports = {
  getPublicStorePickupAddresses,
  getStorePickupAddressesAdmin,
  createStorePickupAddressAdmin,
  updateStorePickupAddressAdmin,
  deleteStorePickupAddressAdmin,
};

const fedexService = require('../services/fedexService');
const orderRepository = require('../repositories/orderRepository');

function validateDestination(destination) {
  const postalCode = String(destination?.postalCode || '').trim();
  if (!postalCode) {
    return 'destination.postalCode is required';
  }
  return null;
}

function validatePackages(packages) {
  if (!Array.isArray(packages) || packages.length === 0) {
    return 'packages must be a non-empty array';
  }
  return null;
}

const getFedexRates = async (req, res) => {
  try {
    const { destination, packages } = req.body || {};
    const destinationErr = validateDestination(destination);
    if (destinationErr) return res.status(400).json({ message: destinationErr });
    const packagesErr = validatePackages(packages);
    if (packagesErr) return res.status(400).json({ message: packagesErr });

    const rates = await fedexService.getRateQuotes(destination, packages);
    return res.json({ rates });
  } catch (error) {
    console.error('FedEx rates error:', error);
    return res.status(500).json({
      message: error?.message || 'Failed to fetch FedEx rates',
    });
  }
};

function isOrderPaidForShipping(order) {
  return String(order.payment_status || '').toLowerCase() === 'paid';
}

function normalizeFedexServiceType(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  return /^FEDEX_[A-Z0-9_]+$/.test(s) ? s : '';
}

const createShipmentForOrder = async (req, res) => {
  try {
    const orderId = parseInt(String(req.params.orderId || ''), 10);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await orderRepository.findOrderByIdAdmin(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!isOrderPaidForShipping(order)) {
      return res.status(400).json({ message: 'Order must be paid before creating a shipment.' });
    }
    const mode = String(order.shipping_mode || '').toLowerCase();
    if (mode === 'store_pickup') {
      return res.status(400).json({ message: 'Store pickup orders do not use FedEx shipment.' });
    }
    const bodyServiceType = normalizeFedexServiceType(req.body?.serviceType);
    const normalizedOrderService = normalizeFedexServiceType(order.carrier_service_type);
    const serviceType = normalizedOrderService || bodyServiceType;
    if (!serviceType) {
      return res.status(400).json({
        message:
          'Order is missing FedEx service (carrier_service_type). Provide body.serviceType like FEDEX_GROUND.',
      });
    }
    if (bodyServiceType && bodyServiceType !== normalizedOrderService) {
      await orderRepository.updateOrderCarrierServiceType(orderId, bodyServiceType);
      order.carrier_service_type = bodyServiceType;
    }
    if (String(order.fedex_shipment_id || '').trim()) {
      return res.status(400).json({ message: 'A FedEx shipment is already recorded for this order.' });
    }

    const shipResult = await fedexService.createShipment(order);
    let labelUrl = null;
    if (shipResult.labelEncoded) {
      labelUrl = await fedexService.saveFedexLabelPdf(orderId, shipResult.labelEncoded);
    }

    const trackingNumber = String(shipResult.masterTrackingNumber || shipResult.trackingNumber || '').trim();

    await orderRepository.updateOrderAfterFedexShipmentCreated(orderId, {
      fedexShipmentId: shipResult.shipmentId,
      shippingLabelUrl: labelUrl,
      trackingNumber,
      orderStatus: 'shipped',
    });

    const updated = await orderRepository.findOrderByIdAdmin(orderId);
    return res.status(201).json({
      trackingNumber: shipResult.trackingNumber,
      masterTrackingNumber: shipResult.masterTrackingNumber,
      shippingLabelUrl: labelUrl,
      shipmentId: shipResult.shipmentId,
      order: updated,
    });
  } catch (error) {
    console.error('FedEx create shipment error:', error);
    return res.status(500).json({ message: error?.message || 'Failed to create FedEx shipment' });
  }
};

const getTrackingForOrder = async (req, res) => {
  try {
    const orderId = parseInt(String(req.params.orderId || ''), 10);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await orderRepository.findOrderByIdAdmin(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const tn = String(order.order_tracking_id || '').trim();
    if (!tn) {
      return res.status(400).json({ message: 'Order has no tracking number yet.' });
    }
    const tr = await fedexService.trackShipment(tn);
    await orderRepository.updateOrderShipmentTracking(orderId, {
      shipmentStatus: tr.status,
      shipmentLastEvent: tr.latestEvent || { summary: tr.status },
    });
    const updated = await orderRepository.findOrderByIdAdmin(orderId);
    return res.json({
      status: tr.status,
      latestEvent: tr.latestEvent,
      deliveryDate: tr.deliveryDate,
      order: updated,
    });
  } catch (error) {
    console.error('FedEx tracking error:', error);
    return res.status(500).json({ message: error?.message || 'Failed to refresh tracking' });
  }
};

module.exports = {
  getFedexRates,
  createShipmentForOrder,
  getTrackingForOrder,
};

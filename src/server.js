const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const pool = require('./config/database');

/** Create base tables (users, addresses, etc.) if they do not exist - for fresh Railway DB */
async function ensureBaseTables() {
  try {
    const r = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')"
    );
    if (r.rows[0].exists) return;
    console.log('Creating base tables (users, addresses, etc.)...');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'createTables.sql'), 'utf8');
    await pool.query(sql);
    console.log('Base tables created.');
  } catch (err) {
    console.warn('ensureBaseTables:', err.message);
  }
}

async function ensureEmployeeColumns() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(path.join(migrationsDir, 'addUserFullName.sql'))) {
      const sql1 = fs.readFileSync(path.join(migrationsDir, 'addUserFullName.sql'), 'utf8');
      await pool.query(sql1);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addUserProfileImageAndHireDate.sql'))) {
      const sql2 = fs.readFileSync(path.join(migrationsDir, 'addUserProfileImageAndHireDate.sql'), 'utf8');
      await pool.query(sql2);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addProductProperties.sql'))) {
      const sql3 = fs.readFileSync(path.join(migrationsDir, 'addProductProperties.sql'), 'utf8');
      await pool.query(sql3);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addOrderItemJobName.sql'))) {
      const sql4 = fs.readFileSync(path.join(migrationsDir, 'addOrderItemJobName.sql'), 'utf8');
      await pool.query(sql4);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addOrderItemImageUrl.sql'))) {
      const sql5 = fs.readFileSync(path.join(migrationsDir, 'addOrderItemImageUrl.sql'), 'utf8');
      await pool.query(sql5);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addCartItems.sql'))) {
      const sql6 = fs.readFileSync(path.join(migrationsDir, 'addCartItems.sql'), 'utf8');
      await pool.query(sql6);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addPasswordResetCodes.sql'))) {
      const sql7 = fs.readFileSync(path.join(migrationsDir, 'addPasswordResetCodes.sql'), 'utf8');
      await pool.query(sql7);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addGuestCheckout.sql'))) {
      const sql8 = fs.readFileSync(path.join(migrationsDir, 'addGuestCheckout.sql'), 'utf8');
      await pool.query(sql8);
    }
    if (fs.existsSync(path.join(migrationsDir, 'fixAddressSingleDefaultPerUser.sql'))) {
      const sql9 = fs.readFileSync(path.join(migrationsDir, 'fixAddressSingleDefaultPerUser.sql'), 'utf8');
      await pool.query(sql9);
    }
    if (fs.existsSync(path.join(migrationsDir, 'widenOrderDecimalColumns.sql'))) {
      const sql10 = fs.readFileSync(path.join(migrationsDir, 'widenOrderDecimalColumns.sql'), 'utf8');
      await pool.query(sql10);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addShippingRatesAndOrderShipping.sql'))) {
      const sql11 = fs.readFileSync(path.join(migrationsDir, 'addShippingRatesAndOrderShipping.sql'), 'utf8');
      await pool.query(sql11);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addProductGalleryImages.sql'))) {
      const sql12 = fs.readFileSync(path.join(migrationsDir, 'addProductGalleryImages.sql'), 'utf8');
      await pool.query(sql12);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addProductPricingEnginePhase1.sql'))) {
      const sql13 = fs.readFileSync(path.join(migrationsDir, 'addProductPricingEnginePhase1.sql'), 'utf8');
      await pool.query(sql13);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addStorePickupAddressesAndOrderMode.sql'))) {
      const sql14 = fs.readFileSync(path.join(migrationsDir, 'addStorePickupAddressesAndOrderMode.sql'), 'utf8');
      await pool.query(sql14);
    }
    if (fs.existsSync(path.join(migrationsDir, 'addShippingRateOptions.sql'))) {
      const sql15 = fs.readFileSync(path.join(migrationsDir, 'addShippingRateOptions.sql'), 'utf8');
      await pool.query(sql15);
    }
  } catch (err) {
    console.warn('Migrations (optional):', err.message);
  }
}

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const cardRoutes = require('./routes/cards');
const claimRoutes = require('./routes/claims');
const estimateRoutes = require('./routes/estimates');
const favoriteRoutes = require('./routes/favorites');
const messageRoutes = require('./routes/messages');
const materialRoutes = require('./routes/materials');
const employeeRoutes = require('./routes/employees');
const cartRoutes = require('./routes/cart');
const shippingRatesRoutes = require('./routes/shippingRates');
const storePickupAddressRoutes = require('./routes/storePickupAddresses');

const app = express();
const PORT = process.env.PORT || 8080;

// CORS: must run first. Allow all origins so Vercel/localhost work.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Guest-Session-Id');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Session-Id'],
}));
app.use(morgan('dev'));
// Stripe webhook needs raw body (must be before express.json())
const { handleStripeWebhook } = require('./controllers/orderController');
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (employee profile images - multer saves to backend/uploads/employees)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Root route - so Railway / browser GET / does not return 404
app.get('/', (req, res) => {
  res.send('Backend is running successfully!');
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      message: 'Server is running',
      database: 'Connected'
    });
  } catch (error) {
    const errMsg = error.message || error.code || String(error);
    console.error('Health check DB error:', errMsg);
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'production' ? errMsg : errMsg
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/estimates', estimateRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/admin/employees', employeeRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/shipping-rates', shippingRatesRoutes);
app.use('/api/store-pickup-addresses', storePickupAddressRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler - hide DB/connection errors in production
app.use((err, req, res, next) => {
  console.error(err.stack);
  const isDbError = /ECONNREFUSED|ETIMEDOUT|connection|connect/i.test(err.message || '');
  const message = (process.env.NODE_ENV === 'production' && isDbError)
    ? 'Service temporarily unavailable. Please try again later.'
    : (err.message || 'Internal server error');
  res.status(err.status || 500).json({
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server (ensure employee columns exist, then listen)
ensureBaseTables()
  .then(() => ensureEmployeeColumns())
  .then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Error: Port ${PORT} is already in use!`);
      console.error(`   Please either:`);
      console.error(`   1. Kill the process using port ${PORT}: lsof -ti:${PORT} | xargs kill -9`);
      console.error(`   2. Change PORT in .env file to a different port\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });
});

module.exports = app;


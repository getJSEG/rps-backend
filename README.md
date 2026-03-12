Backend API for the E-commerce platform built with Node.js, Express.js, and PostgreSQL.

## Features

- User authentication and authorization (JWT)
- User registration and profile management
- Product catalog with categories and subcategories
- Order management
- Address book management
- Credit card management
- Claims/Support system
- Estimates/Quotes
- Favorites/Wishlist
- Messaging system
- Materials catalog (Canvas Roll, etc.)

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the backend directory (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update the `.env` file with your database credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
```

4. Create the PostgreSQL database:
```bash
createdb db
```

5. Run database migrations:
```bash
npm run migrate
```

6. (Optional) Seed the database with sample data:
```bash
npm run seed
```

## Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will run on `http://localhost:5000` by default.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user profile (protected)

### Users
- `PUT /api/users/profile` - Update user profile (protected)
- `PUT /api/users/password` - Change password (protected)

### Products
- `GET /api/products` - Get all products (with optional filters)
- `GET /api/products/categories` - Get all categories
- `GET /api/products/:id` - Get product by ID

### Orders
- `POST /api/orders` - Create a new order (protected)
- `GET /api/orders` - Get user's orders (protected)
- `GET /api/orders/:id` - Get order by ID (protected)

### Addresses
- `GET /api/addresses` - Get user's addresses (protected)
- `POST /api/addresses` - Create a new address (protected)
- `PUT /api/addresses/:id` - Update address (protected)
- `DELETE /api/addresses/:id` - Delete address (protected)

### Credit Cards
- `GET /api/cards` - Get user's credit cards (protected)
- `POST /api/cards` - Add a credit card (protected)
- `DELETE /api/cards/:id` - Delete credit card (protected)

### Claims
- `GET /api/claims` - Get user's claims (protected)
- `POST /api/claims` - Create a new claim (protected)
- `GET /api/claims/:id` - Get claim by ID (protected)

### Estimates
- `GET /api/estimates` - Get user's estimates (protected)
- `POST /api/estimates` - Create a new estimate (protected)
- `GET /api/estimates/:id` - Get estimate by ID (protected)

### Favorites
- `GET /api/favorites` - Get user's favorites (protected)
- `POST /api/favorites` - Add product to favorites (protected)
- `DELETE /api/favorites/:id` - Remove favorite (protected)

### Messages
- `GET /api/messages` - Get user's messages (protected)
- `POST /api/messages` - Send a message (protected)
- `PUT /api/messages/:id/read` - Mark message as read (protected)

### Materials
- `GET /api/materials` - Get all materials
- `GET /api/materials/:id` - Get material by ID

## Authentication

Protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Database Schema

The database includes the following main tables:
- `users` - User accounts
- `addresses` - User addresses (billing/shipping)
- `credit_cards` - User credit cards
- `categories` - Product categories
- `products` - Product catalog
- `orders` - Customer orders
- `order_items` - Order line items
- `favorites` - User favorites/wishlist
- `claims` - Support claims
- `estimates` - Price estimates/quotes
- `estimate_items` - Estimate line items
- `messages` - User messages
- `materials` - Material catalog

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── controllers/              # Route controllers
│   ├── middleware/
│   │   └── auth.js               # Authentication middleware
│   ├── migrations/
│   │   ├── createTables.sql      # Database schema
│   │   ├── runMigrations.js      # Migration runner
│   │   └── seed.js               # Database seeder
│   ├── routes/                   # API routes
│   ├── utils/
│   │   └── jwt.js                # JWT utilities
│   └── server.js                 # Express app entry point
├── .env.example                  # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

## Development

### Environment Variables

- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_EXPIRE` - JWT expiration time (default: 7d)
- `CORS_ORIGIN` - Allowed CORS origin

## License

ISC


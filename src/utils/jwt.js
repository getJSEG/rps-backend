const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || (typeof secret === 'string' && !secret.trim())) {
    throw new Error('Server misconfiguration: JWT_SECRET is not set in .env');
  }
  return secret;
}

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    getSecret(),
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = { generateToken };


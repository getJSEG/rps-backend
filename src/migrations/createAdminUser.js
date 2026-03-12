const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function createAdminUser() {
  try {
    console.log('Creating admin user...');

    const email = 'sumara@gmail.com';
    const password = 'sumara@123';
    const fullName = 'Admin User';
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Check if admin user already exists
    const existingUser = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      
      // Update existing user to admin if not already
      if (user.role !== 'admin') {
        await pool.query(
          'UPDATE users SET role = $1, password_hash = $2, is_active = $3, is_approved = $4 WHERE id = $5',
          ['admin', passwordHash, true, true, user.id]
        );
        console.log(`✅ Updated user ${email} to admin role`);
      } else {
        // Update password if user is already admin
        await pool.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [passwordHash, user.id]
        );
        console.log(`✅ Updated admin user ${email} password`);
      }
    } else {
      // Create new admin user (try with full_name first; fallback if column missing)
      let result;
      try {
        result = await pool.query(
          `INSERT INTO users (email, password_hash, full_name, role, is_active, is_approved)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, email, role`,
          [email, passwordHash, fullName, 'admin', true, true]
        );
      } catch (err) {
        if (err.message && err.message.includes('full_name')) {
          result = await pool.query(
            `INSERT INTO users (email, password_hash, role, is_active, is_approved)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, role`,
            [email, passwordHash, 'admin', true, true]
          );
        } else {
          throw err;
        }
      }

      console.log(`✅ Admin user created successfully:`);
      console.log(`   Email: ${result.rows[0].email}`);
      console.log(`   Role: ${result.rows[0].role}`);
    }

    console.log('\n📋 Admin Login Credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log('\n✅ Admin user setup complete!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createAdminUser();
}

module.exports = createAdminUser;


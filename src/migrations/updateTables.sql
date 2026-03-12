-- Update Users table to remove NOT NULL constraint from company_name
ALTER TABLE IF EXISTS users 
ALTER COLUMN company_name DROP NOT NULL;

-- DECIMAL(10,2) max is 99,999,999.99; large print orders or qty*price can overflow.
ALTER TABLE orders ALTER COLUMN total_amount TYPE DECIMAL(14, 2);
ALTER TABLE order_items ALTER COLUMN unit_price TYPE DECIMAL(14, 2);
ALTER TABLE order_items ALTER COLUMN total_price TYPE DECIMAL(14, 2);

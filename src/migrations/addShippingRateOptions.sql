-- Saved shipping methods (Add Shipping Method / Saved Methods) are unused.
-- Checkout prices come from FedEx tiers, not shipping_rate_options.
DROP INDEX IF EXISTS shipping_rate_options_name_unique_lower;
DROP TABLE IF EXISTS shipping_rate_options;

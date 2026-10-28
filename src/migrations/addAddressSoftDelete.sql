-- Customers can delete address-book entries. Addresses already used on an order are only marked
-- deleted (orders keep joining them for the delivery address and FedEx labels); unused ones are
-- removed outright. Deleted addresses are hidden from the address book, checkout and tax lookups.
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

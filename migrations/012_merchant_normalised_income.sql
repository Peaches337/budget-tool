-- Add merchant_normalised to imported_transactions for manual matching

ALTER TABLE imported_transactions ADD COLUMN IF NOT EXISTS merchant_normalised TEXT;

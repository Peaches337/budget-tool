-- Link imported files to net worth entries
ALTER TABLE imported_files
  ADD COLUMN IF NOT EXISTS net_worth_entry_id UUID REFERENCES net_worth_entries(id) ON DELETE SET NULL;

-- Clean merchant descriptions (original kept in description)
ALTER TABLE imported_transactions
  ADD COLUMN IF NOT EXISTS clean_description TEXT;

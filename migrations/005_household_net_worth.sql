-- Household-level setting to aggregate shared member net worth
ALTER TABLE households ADD COLUMN IF NOT EXISTS include_net_worth BOOLEAN NOT NULL DEFAULT false;

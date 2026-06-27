export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually';
export type Visibility = 'private' | 'amount_only' | 'full';
export type HouseholdRole = 'owner' | 'member';
export type Taxable = 'taxed' | 'taxfree';
export type TaxTreatment = 'taxable' | 'tax_free' | 'already_taxed';
export type NetWorthVisibility = 'private' | 'shared';
export type EntryType = 'asset' | 'liability';

export type User = {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  wizard_completed: boolean;
};

export type BudgetCategory = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_income: boolean;
  sort_order: number;
  visibility: Visibility;
  enabled: boolean;
  canonical_key: string | null;
  created_at: string;
  items?: BudgetItem[];
};

export type BudgetItem = {
  id: string;
  category_id: string;
  user_id: string;
  label: string;
  amount: number;
  frequency: Frequency;
  taxable: Taxable;
  sort_order: number;
  service_key: string | null;
  is_irregular: boolean;
  declared_annual: number | null;
  rolling_avg_months: number;
  tax_treatment: TaxTreatment;
  nudge_dismissed_until: string | null;
};

export type IncomeActual = {
  id: string;
  budget_item_id: string;
  user_id: string;
  paid_on: string;
  amount: number;
  notes: string | null;
  created_at: string;
};

export type Household = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  members?: HouseholdMember[];
};

export type HouseholdMember = {
  household_id: string;
  user_id: string;
  username: string;
  email: string;
  role: HouseholdRole;
  joined_at: string;
};

export type HouseholdInvite = {
  id: string;
  household_id: string;
  code: string;
  created_by: string;
  expires_at: string | null;
  used_at: string | null;
};

export type Template = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  visibility: 'private' | 'household' | 'public';
  created_by: string | null;
  categories?: TemplateCategory[];
};

export type TemplateCategory = {
  id: string;
  template_id: string;
  name: string;
  color: string;
  is_income: boolean;
  sort_order: number;
  canonical_key: string | null;
  items?: TemplateItem[];
};

export type TemplateItem = {
  id: string;
  category_id: string;
  label: string;
  frequency: Frequency;
  taxable: Taxable;
  service_key: string | null;
};

export type SubscriptionTier = {
  id: string;
  service: string;
  tier_name: string;
  amount: number;
  frequency: Frequency;
  sort_order: number;
  active: boolean;
};

export type AppConfig = {
  instance_name: string;
  registration_open: string;
  default_template: string;
  session_timeout_days: string;
};

export type NetWorthEntry = {
  id: string;
  user_id: string;
  entry_type: EntryType;
  category: string;
  label: string;
  institution: string | null;
  amount: number;
  visibility: NetWorthVisibility;
  last_updated: string;
  created_at: string;
};

export type NetWorthSnapshot = {
  id: string;
  user_id: string;
  snapped_at: string;
  total_assets: number;
  total_liab: number;
  net_worth: number;
};

// Bank integration
export type BankConnectionStatus = 'active' | 'disconnected';
export type MatchConfidence = 'high' | 'medium' | 'low' | 'unmatched';

export type BankConnection = {
  id: string;
  provider: string;
  status: BankConnectionStatus;
  last_synced_at: string | null;
  display_name: string | null;
  balances: BankAccountBalance[];
};

export type BankAccountBalance = {
  id: string;
  external_account_id: string;
  display_name: string;
  account_type: string;
  balance_cents: number;
  currency: string;
  synced_at: string;
};

export type BankTransaction = {
  id: string;
  external_id: string;
  merchant_raw: string;
  merchant_normalised: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  up_category: string | null;
  status: string;
  settled_at: string | null;
  source: string;
  match_confidence: MatchConfidence | null;
  match_confirmed: boolean | null;
  budget_item_id: string | null;
  budget_item_label: string | null;
  created_at: string;
};

export type BankActual = {
  budget_item_id: string;
  total_cents: number;
  tx_count: number;
};

// CoinSpot integration
export type CoinspotBalance = {
  coin_type: string;
  balance: string;
  aud_balance: string;
  rate: string;
  synced_at: string;
};

export type CoinspotConnection = {
  id: string;
  status: string;
  last_synced_at: string | null;
  balances: CoinspotBalance[];
};

// Tax tool
export type TaxRole = 'payg' | 'sole_trader' | 'both';
export type HomeOfficeMethod = 'fixed_rate' | 'actual_cost';
export type TaxModuleType =
  | 'work_expense' | 'client_expense' | 'vehicle_service'
  | 'fuel' | 'professional_dev' | 'interest'
  | 'business_income' | 'business_expense'
  | 'depreciation' | 'super' | 'insurance' | 'accounting';

export type TaxSettings = {
  id: string;
  user_id: string;
  financial_year: number;
  tax_role: TaxRole;
  home_office_method: HomeOfficeMethod | null;
  travel_method: 'cents_per_km' | 'logbook';
  mod_work_expenses: boolean;
  mod_vehicle: boolean;
  mod_home_office: boolean;
  mod_internet: boolean;
  mod_mobile: boolean;
  mod_electricity: boolean;
  mod_gas: boolean;
  mod_water: boolean;
  mod_fuel: boolean;
  mod_interest: boolean;
  mod_professional: boolean;
  mod_vehicle_service: boolean;
  wizard_complete: boolean;
};

export type TaxEntry = {
  id: string;
  user_id: string;
  financial_year: number;
  module_type: TaxModuleType;
  entry_date: string;
  description: string;
  supplier: string | null;
  amount_cents: number;
  work_pct: number;
  deductible_cents: number;
  receipt_url: string | null;
  linked_tx_id: string | null;
  notes: string | null;
  created_at: string;
};

export type TaxHomeOffice = {
  id: string;
  user_id: string;
  financial_year: number;
  method: HomeOfficeMethod;
  hours_per_week: number | null;
  weeks_in_fy: number;
  office_area_m2: number | null;
  total_area_m2: number | null;
};

export type TaxUtilityBill = {
  id: string;
  user_id: string;
  financial_year: number;
  utility_type: 'electricity' | 'gas' | 'internet' | 'mobile' | 'water';
  bill_month: number;
  bill_year: number;
  amount_cents: number;
  work_pct: number;
  deductible_cents: number;
};

export type TaxTravelEntry = {
  id: string;
  user_id: string;
  financial_year: number;
  travel_date: string;
  origin: string | null;
  destination: string;
  purpose: string;
  kilometres: number;
  rate_cents: number;
  deductible_cents: number;
  created_at: string;
};

export type BusinessProfile = {
  id: string;
  user_id: string;
  abn: string | null;
  gst_registered: boolean;
  gst_number: string | null;
  usi: string | null;
};

// API response wrapper
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

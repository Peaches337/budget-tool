<script lang="ts">
  import { onMount } from 'svelte';
  import type { TaxSettings, TaxEntry, TaxHomeOffice, TaxTravelEntry, TaxUtilityBill } from '$lib/types.js';

  // ── FY helpers ──────────────────────────────────────────────────────────────
  function currentFY(): number {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  }
  function fyLabel(fy: number) { return `FY${fy} (${fy - 1}–${fy})`; }
  function fyYears() {
    const c = currentFY();
    return [c + 1, c, c - 1, c - 2];
  }

  // ── State ───────────────────────────────────────────────────────────────────
  let showEarlyBuildBanner = true;
  let fy = currentFY();
  let settings: TaxSettings | null = null;
  let loading = true;
  let activeSection: 'deductions' | 'travel' | 'tax_settings' = 'deductions';
  let activeModule = 'work_expense';
  let error = '';
  let success = '';

  // Wizard
  let wizardStep = 1;
  let wizardRole: 'payg' | 'sole_trader' | 'both' = 'payg';
  let wizardHomeOffice = false;
  let wizardHomeOfficeMethod: 'fixed_rate' | 'actual_cost' = 'fixed_rate';
  let wizardVehicle = false;
  let wizardVehicleService = false;
  let wizardFuel = false;
  let wizardInterest = false;
  let wizardProfessional = false;

  // Entries
  let entries: TaxEntry[] = [];
  let entriesLoading = false;

  // New entry form
  let newDate = '';
  let newDesc = '';
  let newSupplier = '';
  let newAmount = '';
  let newWorkPct = 100;
  let newNotes = '';
  let submitting = false;

  // Home office
  let homeOffice: TaxHomeOffice | null = null;
  let hoMethod: 'fixed_rate' | 'actual_cost' = 'fixed_rate';
  let hoHours = '';
  let hoWeeks = '52';
  let hoOfficeArea = '';
  let hoTotalArea = '';
  let hoSaving = false;

  // Travel
  let travelData: { entries: TaxTravelEntry[]; rate_cents: number; total_km: number; cap_km: number; remaining_km: number } | null = null;
  let travelLoading = false;
  let tvDate = '';
  let tvOrigin = '';
  let tvDest = '';
  let tvPurpose = '';
  let tvKm = '';
  let tvSubmitting = false;

  // Utility bills
  type UtilType = 'electricity' | 'gas' | 'internet' | 'mobile' | 'water';
  let utilBills: TaxUtilityBill[] = [];
  let utilLoading = false;
  let utilType: UtilType = 'electricity';
  let utilMonth = new Date().getMonth() + 1;
  let utilYear = new Date().getFullYear();
  let utilAmount = '';
  let utilWorkPct = 50;
  let utilSubmitting = false;

  // Settings saving
  let settingsSaving = false;

  // ── Derived ─────────────────────────────────────────────────────────────────
  $: totalDeductible = entries.reduce((s, e) => s + e.deductible_cents, 0);
  $: travelDeductible = travelData?.entries.reduce((s, e) => s + e.deductible_cents, 0) ?? 0;
  $: utilDeductible = utilBills.reduce((s, b) => s + b.deductible_cents, 0);

  $: fixedRateLockout = settings?.home_office_method === 'fixed_rate' && settings?.mod_home_office;
  $: hoDeductible = homeOffice
    ? homeOffice.method === 'fixed_rate'
      ? Math.round((homeOffice.hours_per_week ?? 0) * (homeOffice.weeks_in_fy ?? 52) * 67)
      : 0
    : 0;

  // Sidebar — always 3 items (Deductions / Travel / Tax Settings)
  const sidebarItems = [
    { key: 'deductions',   label: 'Deductions',   icon: '◈' },
    { key: 'travel',       label: 'Travel',       icon: '↗' },
    { key: 'tax_settings', label: 'Tax Settings', icon: '⚙' },
  ] as const;

  // Sub-tabs within Deductions
  $: deductionTabs = settings ? [
    { key: 'work_expense',    label: 'Work',          enabled: settings.mod_work_expenses },
    { key: 'client_expense',  label: 'Client',        enabled: settings.mod_work_expenses },
    { key: 'home_office',     label: 'Home Office',   enabled: settings.mod_home_office },
    { key: 'utilities',       label: 'Utilities',     enabled: !!(settings.mod_electricity || settings.mod_gas || settings.mod_internet || settings.mod_mobile || settings.mod_water) },
    { key: 'professional_dev',label: 'Professional',  enabled: settings.mod_professional },
    { key: 'interest',        label: 'Bank Interest', enabled: settings.mod_interest },
  ].filter(t => t.enabled) : [];

  // Sub-tabs within Travel
  $: travelTabs = settings ? [
    { key: 'travel',          label: 'Km Log',      enabled: settings.mod_vehicle },
    { key: 'vehicle_service', label: 'Servicing',   enabled: settings.mod_vehicle_service },
    { key: 'fuel',            label: 'Fuel',        enabled: settings.mod_fuel },
  ].filter(t => t.enabled) : [];

  // Active utility sub-type within Utilities tab
  let activeUtility: UtilType = 'electricity';
  $: utilitySubTabs = settings ? [
    { key: 'electricity', label: 'Electricity', enabled: settings.mod_electricity && !fixedRateLockout },
    { key: 'gas',         label: 'Gas',         enabled: settings.mod_gas && !fixedRateLockout },
    { key: 'internet',    label: 'Internet',    enabled: settings.mod_internet && !fixedRateLockout },
    { key: 'mobile',      label: 'Mobile',      enabled: settings.mod_mobile && !fixedRateLockout },
    { key: 'water',       label: 'Water',       enabled: settings.mod_water },
  ].filter(t => t.enabled) : [];

  // ── API helpers ──────────────────────────────────────────────────────────────
  async function loadSettings() {
    loading = true;
    const res = await fetch(`/api/tax/settings?fy=${fy}`).then(r => r.json()).catch(() => ({ ok: false }));
    settings = res.ok ? res.data : null;
    loading = false;
  }

  async function loadEntries(moduleKey?: string) {
    entriesLoading = true;
    const mod = moduleKey ?? activeModule;
    const apiModule = mod === 'client_expense' ? 'client_expense'
      : mod === 'vehicle_service' ? 'vehicle_service'
      : mod === 'fuel' ? 'fuel'
      : mod === 'interest' ? 'interest'
      : mod === 'professional_dev' ? 'professional_dev'
      : 'work_expense';
    const res = await fetch(`/api/tax/entries?fy=${fy}&module=${apiModule}`).then(r => r.json()).catch(() => ({ ok: false }));
    entries = res.ok ? res.data : [];
    entriesLoading = false;
  }

  async function loadHomeOffice() {
    const res = await fetch(`/api/tax/home-office?fy=${fy}`).then(r => r.json()).catch(() => ({ ok: false }));
    homeOffice = res.ok ? res.data : null;
    if (homeOffice) {
      hoMethod = homeOffice.method;
      hoHours = homeOffice.hours_per_week?.toString() ?? '';
      hoWeeks = homeOffice.weeks_in_fy?.toString() ?? '52';
      hoOfficeArea = homeOffice.office_area_m2?.toString() ?? '';
      hoTotalArea = homeOffice.total_area_m2?.toString() ?? '';
    }
  }

  async function loadTravel() {
    travelLoading = true;
    const res = await fetch(`/api/tax/travel?fy=${fy}`).then(r => r.json()).catch(() => ({ ok: false }));
    travelData = res.ok ? res.data : null;
    travelLoading = false;
  }

  async function loadUtilBills(type?: UtilType) {
    utilLoading = true;
    const t = type ?? activeUtility;
    const res = await fetch(`/api/tax/utility-bills?fy=${fy}&type=${t}`).then(r => r.json()).catch(() => ({ ok: false }));
    utilBills = res.ok ? res.data : [];
    utilLoading = false;
  }

  onMount(async () => {
    await loadSettings();
    if (settings?.wizard_complete) {
      await switchModule(activeModule);
    }
  });

  async function switchSection(section: typeof activeSection) {
    activeSection = section;
    error = '';
    success = '';
    if (section === 'deductions') {
      const firstTab = deductionTabs[0]?.key ?? 'work_expense';
      await switchModule(firstTab);
    } else if (section === 'travel') {
      const firstTab = travelTabs[0]?.key ?? 'travel';
      await switchModule(firstTab);
    }
    // tax_settings needs no data load
  }

  async function switchModule(key: string) {
    activeModule = key;
    error = '';
    success = '';
    if (['work_expense', 'client_expense', 'vehicle_service', 'fuel', 'interest', 'professional_dev'].includes(key)) {
      await loadEntries(key);
    } else if (key === 'home_office') {
      await loadHomeOffice();
    } else if (key === 'travel') {
      await loadTravel();
    } else if (key === 'utilities') {
      const firstUtil = utilitySubTabs[0]?.key as UtilType ?? 'electricity';
      activeUtility = firstUtil;
      utilType = firstUtil;
      await loadUtilBills(firstUtil);
    } else if (['electricity', 'gas', 'internet', 'mobile', 'water'].includes(key)) {
      activeUtility = key as UtilType;
      utilType = key as UtilType;
      await loadUtilBills(key as UtilType);
    }
  }

  async function switchUtility(type: UtilType) {
    activeUtility = type;
    utilType = type;
    await loadUtilBills(type);
  }

  // ── Wizard ───────────────────────────────────────────────────────────────────
  async function completeWizard() {
    submitting = true;
    const body: Record<string, unknown> = {
      financial_year: fy,
      tax_role: wizardRole,
      home_office_method: wizardHomeOffice ? wizardHomeOfficeMethod : null,
      mod_work_expenses: true,
      mod_vehicle: wizardVehicle,
      mod_vehicle_service: wizardVehicleService,
      mod_home_office: wizardHomeOffice,
      mod_internet: wizardHomeOffice && wizardHomeOfficeMethod === 'actual_cost',
      mod_mobile: wizardHomeOffice && wizardHomeOfficeMethod === 'actual_cost',
      mod_electricity: wizardHomeOffice && wizardHomeOfficeMethod === 'actual_cost',
      mod_gas: wizardHomeOffice && wizardHomeOfficeMethod === 'actual_cost',
      mod_water: false,
      mod_fuel: wizardFuel,
      mod_interest: wizardInterest,
      mod_professional: wizardProfessional,
      wizard_complete: true,
    };
    const res = await fetch('/api/tax/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.ok) {
      settings = json.data;
      activeModule = 'work_expense';
      await loadEntries('work_expense');
    }
    submitting = false;
  }

  // ── Entry submit ─────────────────────────────────────────────────────────────
  async function submitEntry() {
    if (!newDate || !newDesc || !newAmount) return;
    submitting = true;
    error = '';
    const moduleType = activeModule === 'client_expense' ? 'client_expense'
      : activeModule === 'vehicle_service' ? 'vehicle_service'
      : activeModule === 'fuel' ? 'fuel'
      : activeModule === 'interest' ? 'interest'
      : activeModule === 'professional_dev' ? 'professional_dev'
      : 'work_expense';
    const body = {
      financial_year: fy,
      module_type: moduleType,
      entry_date: newDate,
      description: newDesc,
      supplier: newSupplier || null,
      amount_cents: Math.round(parseFloat(newAmount) * 100),
      work_pct: newWorkPct,
      notes: newNotes || null,
    };
    const res = await fetch('/api/tax/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.ok) {
      newDate = ''; newDesc = ''; newSupplier = ''; newAmount = ''; newWorkPct = 100; newNotes = '';
      success = 'Entry added.';
      await loadEntries();
    } else {
      error = json.error ?? 'Failed to add entry';
    }
    submitting = false;
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/tax/entries/${id}`, { method: 'DELETE' });
    entries = entries.filter(e => e.id !== id);
  }

  // ── Home office save ──────────────────────────────────────────────────────────
  async function saveHomeOffice() {
    hoSaving = true;
    error = '';
    const body = {
      financial_year: fy,
      method: hoMethod,
      hours_per_week: hoHours ? parseFloat(hoHours) : null,
      weeks_in_fy: parseInt(hoWeeks) || 52,
      office_area_m2: hoOfficeArea ? parseFloat(hoOfficeArea) : null,
      total_area_m2: hoTotalArea ? parseFloat(hoTotalArea) : null,
    };
    const res = await fetch('/api/tax/home-office', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.ok) {
      homeOffice = json.data;
      success = 'Home office saved.';
      // Update settings method
      if (settings) {
        await fetch('/api/tax/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ financial_year: fy, home_office_method: hoMethod }) });
        settings = { ...settings, home_office_method: hoMethod };
      }
    } else {
      error = json.error ?? 'Failed to save';
    }
    hoSaving = false;
  }

  // ── Travel submit ─────────────────────────────────────────────────────────────
  async function submitTravel() {
    if (!tvDate || !tvDest || !tvPurpose || !tvKm) return;
    tvSubmitting = true;
    error = '';
    const body = { financial_year: fy, travel_date: tvDate, origin: tvOrigin || null, destination: tvDest, purpose: tvPurpose, kilometres: parseFloat(tvKm) };
    const res = await fetch('/api/tax/travel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.ok) {
      tvDate = ''; tvOrigin = ''; tvDest = ''; tvPurpose = ''; tvKm = '';
      success = 'Trip logged.';
      await loadTravel();
    } else {
      error = json.error ?? 'Failed to add trip';
    }
    tvSubmitting = false;
  }

  async function deleteTravel(id: string) {
    await fetch(`/api/tax/travel?id=${id}`, { method: 'DELETE' });
    await loadTravel();
  }

  // ── Utility submit ─────────────────────────────────────────────────────────────
  async function submitUtil() {
    if (!utilAmount) return;
    utilSubmitting = true;
    error = '';
    const body = { financial_year: fy, utility_type: activeUtility, bill_month: utilMonth, bill_year: utilYear, amount_cents: Math.round(parseFloat(utilAmount) * 100), work_pct: utilWorkPct };
    const res = await fetch('/api/tax/utility-bills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.ok) {
      utilAmount = '';
      success = 'Bill saved.';
      await loadUtilBills();
    } else {
      error = json.error ?? 'Failed to save';
    }
    utilSubmitting = false;
  }

  async function deleteUtil(id: string) {
    await fetch(`/api/tax/utility-bills?id=${id}`, { method: 'DELETE' });
    await loadUtilBills();
  }

  // ── Settings save ─────────────────────────────────────────────────────────────
  async function saveSettings() {
    if (!settings) return;
    settingsSaving = true;
    const res = await fetch('/api/tax/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, financial_year: fy }) });
    const json = await res.json();
    if (json.ok) { settings = json.data; success = 'Settings saved.'; }
    settingsSaving = false;
  }

  // ── Format helpers ─────────────────────────────────────────────────────────────
  function fmt(cents: number) {
    return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  }
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
</script>

<div class="page">
  {#if showEarlyBuildBanner}
    <div class="early-build-banner">
      <span class="early-build-icon">🚧</span>
      <div class="early-build-text">
        <strong>Early build</strong>
        <span>Tax Hub is under active development. Features may change or be incomplete.</span>
      </div>
      <button class="early-build-dismiss" on:click={() => { showEarlyBuildBanner = false; }}>✕</button>
    </div>
  {/if}
  <div class="page-header">
    <div>
      <h1>Tax Tool</h1>
      {#if settings}
        <div class="sub-text">{fyLabel(fy)} · {settings.tax_role === 'payg' ? 'PAYG Employee' : settings.tax_role === 'sole_trader' ? 'Sole Trader' : 'PAYG + Sole Trader'}</div>
      {/if}
    </div>
    <div class="header-actions">
      <select class="fy-select" bind:value={fy} on:change={async () => { await loadSettings(); if (settings?.wizard_complete) await switchModule(activeModule); }}>
        {#each fyYears() as y}
          <option value={y}>{fyLabel(y)}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if loading}
    <div class="loading-state">Loading…</div>

  {:else if !settings?.wizard_complete}
    <!-- ── WIZARD ── -->
    <div class="wizard-shell">
      <div class="wizard-card">
        <div class="wizard-progress">
          <div class="wizard-step" class:active={wizardStep >= 1} class:done={wizardStep > 1}>1</div>
          <div class="wizard-line" class:done={wizardStep > 1}></div>
          <div class="wizard-step" class:active={wizardStep >= 2} class:done={wizardStep > 2}>2</div>
          <div class="wizard-line" class:done={wizardStep > 2}></div>
          <div class="wizard-step" class:active={wizardStep >= 3}>3</div>
        </div>

        {#if wizardStep === 1}
          <h2>Welcome to Tax Tool</h2>
          <p class="wizard-sub">Let's set up your tax profile for {fyLabel(fy)}. This takes about 2 minutes.</p>
          <div class="wizard-field">
            <label>What is your employment situation?</label>
            <div class="role-cards">
              {#each [['payg','PAYG Employee','Salary or wages from an employer'],['sole_trader','Sole Trader','Self-employed, ABN holder'],['both','Both','Employee + running a business']] as [val, title, desc]}
                <button class="role-card" class:selected={wizardRole === val} on:click={() => wizardRole = val as typeof wizardRole}>
                  <div class="role-title">{title}</div>
                  <div class="role-desc">{desc}</div>
                </button>
              {/each}
            </div>
          </div>
          <button class="btn-primary" on:click={() => wizardStep = 2}>Next →</button>

        {:else if wizardStep === 2}
          <h2>Which modules do you need?</h2>
          <p class="wizard-sub">You can change these any time in Tax Settings.</p>
          <div class="wizard-modules">
            <label class="module-toggle">
              <input type="checkbox" bind:checked={wizardHomeOffice} />
              <div class="module-toggle-body">
                <div class="module-toggle-label">Home Office</div>
                <div class="module-toggle-desc">Claim home office running costs</div>
              </div>
            </label>
            <label class="module-toggle">
              <input type="checkbox" bind:checked={wizardVehicle} />
              <div class="module-toggle-body">
                <div class="module-toggle-label">Vehicle Travel</div>
                <div class="module-toggle-desc">Log work-related km (cents per km)</div>
              </div>
            </label>
            <label class="module-toggle">
              <input type="checkbox" bind:checked={wizardVehicleService} />
              <div class="module-toggle-body">
                <div class="module-toggle-label">Vehicle Servicing</div>
                <div class="module-toggle-desc">Car repairs, tyres, rego, insurance</div>
              </div>
            </label>
            <label class="module-toggle">
              <input type="checkbox" bind:checked={wizardFuel} />
              <div class="module-toggle-body">
                <div class="module-toggle-label">Fuel</div>
                <div class="module-toggle-desc">Fuel receipts for work vehicles</div>
              </div>
            </label>
            <label class="module-toggle">
              <input type="checkbox" bind:checked={wizardInterest} />
              <div class="module-toggle-body">
                <div class="module-toggle-label">Bank Interest</div>
                <div class="module-toggle-desc">Flag interest-earning transactions</div>
              </div>
            </label>
            <label class="module-toggle">
              <input type="checkbox" bind:checked={wizardProfessional} />
              <div class="module-toggle-body">
                <div class="module-toggle-label">Professional Development</div>
                <div class="module-toggle-desc">Courses, memberships, conferences</div>
              </div>
            </label>
          </div>
          <div class="wizard-btns">
            <button class="btn-secondary" on:click={() => wizardStep = 1}>← Back</button>
            <button class="btn-primary" on:click={() => wizardStep = 3}>Next →</button>
          </div>

        {:else}
          <h2>Home office method</h2>
          {#if wizardHomeOffice}
            <p class="wizard-sub">Choose how you'll calculate your home office deduction.</p>
            <div class="role-cards">
              <button class="role-card" class:selected={wizardHomeOfficeMethod === 'fixed_rate'} on:click={() => wizardHomeOfficeMethod = 'fixed_rate'}>
                <div class="role-title">Fixed Rate — 67c/hr</div>
                <div class="role-desc">Simple: log hours worked from home. Covers electricity, gas, internet and mobile.</div>
              </button>
              <button class="role-card" class:selected={wizardHomeOfficeMethod === 'actual_cost'} on:click={() => wizardHomeOfficeMethod = 'actual_cost'}>
                <div class="role-title">Actual Cost</div>
                <div class="role-desc">More complex: uses occupancy % × actual bills. Potentially higher deduction.</div>
              </button>
            </div>
          {:else}
            <p class="wizard-sub">Home office not selected — skipping this step.</p>
          {/if}
          <div class="wizard-btns">
            <button class="btn-secondary" on:click={() => wizardStep = 2}>← Back</button>
            <button class="btn-primary" disabled={submitting} on:click={completeWizard}>
              {submitting ? 'Setting up…' : 'Get started →'}
            </button>
          </div>
        {/if}
      </div>
    </div>

  {:else}
    <!-- ── MAIN TAX UI ── -->
    <div class="tax-layout">
      <!-- Sidebar -->
      <aside class="tax-sidebar">
        <div class="sidebar-fy">
          <div class="fy-label">{fyLabel(fy)}</div>
          <div class="fy-total">{fmt(totalDeductible + travelDeductible + utilDeductible + hoDeductible)} deductible</div>
        </div>
        {#each sidebarItems as item}
          <button
            class="mod-btn"
            class:active={activeSection === item.key}
            on:click={() => switchSection(item.key as typeof activeSection)}
          >
            <span class="mod-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        {/each}
      </aside>

      <!-- Main content -->
      <div class="tax-main">
        {#if error}<div class="banner banner--err">{error}</div>{/if}
        {#if success}<div class="banner banner--ok">{success}</div>{/if}

        <!-- ── Sub-tabs ── -->
        {#if activeSection === 'deductions' && deductionTabs.length > 1}
          <div class="sub-tabs">
            {#each deductionTabs as tab}
              <button class="sub-tab" class:active={activeModule === tab.key} on:click={() => switchModule(tab.key)}>{tab.label}</button>
            {/each}
          </div>
        {:else if activeSection === 'travel' && travelTabs.length > 1}
          <div class="sub-tabs">
            {#each travelTabs as tab}
              <button class="sub-tab" class:active={activeModule === tab.key} on:click={() => switchModule(tab.key)}>{tab.label}</button>
            {/each}
          </div>
        {/if}

        <!-- ── Utilities utility sub-tabs ── -->
        {#if activeModule === 'utilities' && utilitySubTabs.length > 0}
          <div class="sub-tabs sub-tabs--sm">
            {#each utilitySubTabs as tab}
              <button class="sub-tab" class:active={activeUtility === tab.key} on:click={() => switchUtility(tab.key as UtilType)}>{tab.label}</button>
            {/each}
          </div>
        {/if}

        <!-- ── WORK / CLIENT / VEHICLE SERVICE / FUEL / INTEREST / PROFESSIONAL ── -->
        {#if ['work_expense','client_expense','vehicle_service','fuel','interest','professional_dev'].includes(activeModule)}
          {@const modLabels: Record<string, string> = {
            work_expense: 'Work Expenses',
            client_expense: 'Client Expenses',
            vehicle_service: 'Vehicle Servicing',
            fuel: 'Fuel Expenses',
            interest: 'Bank Interest',
            professional_dev: 'Professional Development',
          }}
          <div class="module-header">
            <h2>{modLabels[activeModule]}</h2>
            <div class="module-total">{fmt(totalDeductible)} deductible</div>
          </div>

          {#if activeModule === 'client_expense'}
            <div class="guidance-note">
              Client entertainment expenses are generally <strong>not deductible</strong> under Australian tax law (s32-5 ITAA 1997) unless a specific exception applies. Record them here for reference and discuss with your tax agent.
            </div>
          {/if}
          {#if activeModule === 'interest'}
            <div class="guidance-note">
              Bank interest is <strong>assessable income</strong>, not a deduction. Record it here so it appears in your tax summary and is not forgotten at lodgement time.
            </div>
          {/if}

          <!-- Add entry form -->
          <div class="entry-form">
            <div class="form-row">
              <div class="form-field">
                <label for="entry-date">Date</label>
                <input id="entry-date" name="entry-date" type="date" bind:value={newDate} />
              </div>
              <div class="form-field form-field--grow">
                <label for="entry-desc">Description</label>
                <input id="entry-desc" name="entry-desc" type="text" placeholder={activeModule === 'vehicle_service' ? 'e.g. Brake pad replacement' : activeModule === 'fuel' ? 'e.g. Fuel fill-up' : 'e.g. Laptop stand'} bind:value={newDesc} />
              </div>
            </div>
            <div class="form-row">
              <div class="form-field form-field--grow">
                <label for="entry-supplier">Supplier / Merchant</label>
                <input id="entry-supplier" name="entry-supplier" type="text" placeholder={activeModule === 'vehicle_service' ? 'e.g. Bob\'s Auto' : 'e.g. Officeworks'} bind:value={newSupplier} />
              </div>
              <div class="form-field">
                <label for="entry-amount">Amount ($)</label>
                <input id="entry-amount" name="entry-amount" type="number" min="0" step="0.01" placeholder="0.00" bind:value={newAmount} />
              </div>
              {#if activeModule !== 'interest'}
                <div class="form-field form-field--sm">
                  <label for="entry-pct">Work %</label>
                  <input id="entry-pct" name="entry-pct" type="number" min="0" max="100" bind:value={newWorkPct} />
                </div>
              {/if}
            </div>
            <div class="form-row">
              <div class="form-field form-field--grow">
                <label for="entry-notes">Notes (optional)</label>
                <input id="entry-notes" name="entry-notes" type="text" placeholder="Any additional context" bind:value={newNotes} />
              </div>
              <button class="btn-primary" disabled={submitting || !newDate || !newDesc || !newAmount} on:click={submitEntry}>
                {submitting ? 'Adding…' : '+ Add'}
              </button>
            </div>
          </div>

          <!-- Entries table -->
          {#if entriesLoading}
            <div class="loading-state">Loading…</div>
          {:else if entries.length === 0}
            <div class="empty-state">No entries yet. Add your first one above.</div>
          {:else}
            <div class="table-wrap">
              <table class="entry-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Description</th><th>Supplier</th>
                    <th class="th-right">Amount</th>
                    {#if activeModule !== 'interest'}<th class="th-right">Work %</th><th class="th-right">Deductible</th>{/if}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {#each entries as e (e.id)}
                    <tr>
                      <td class="td-date">{fmtDate(e.entry_date)}</td>
                      <td>{e.description}</td>
                      <td class="td-muted">{e.supplier ?? '—'}</td>
                      <td class="td-right">{fmt(e.amount_cents)}</td>
                      {#if activeModule !== 'interest'}
                        <td class="td-right td-muted">{e.work_pct}%</td>
                        <td class="td-right td-accent">{fmt(e.deductible_cents)}</td>
                      {/if}
                      <td class="td-actions">
                        <button class="act-btn act-btn--del" on:click={() => deleteEntry(e.id)}>✕</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan={activeModule === 'interest' ? 3 : 5} class="total-label">Total deductible</td>
                    <td class="td-right td-accent total-val">{fmt(totalDeductible)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {/if}

        <!-- ── HOME OFFICE ── -->
        {:else if activeModule === 'home_office'}
          <div class="module-header">
            <h2>Home Office</h2>
            {#if homeOffice}
              <div class="module-total">{fmt(hoDeductible)} deductible</div>
            {/if}
          </div>

          <div class="ho-method-tabs">
            <button class="method-tab" class:active={hoMethod === 'fixed_rate'} on:click={() => hoMethod = 'fixed_rate'}>
              Fixed Rate (67c/hr)
            </button>
            <button class="method-tab" class:active={hoMethod === 'actual_cost'} on:click={() => hoMethod = 'actual_cost'}>
              Actual Cost
            </button>
          </div>

          {#if hoMethod === 'fixed_rate'}
            <div class="guidance-note">
              67c per hour covers electricity, gas, internet and mobile. You cannot claim those separately when using this method. No dedicated work area is required.
            </div>
            <div class="entry-form">
              <div class="form-row">
                <div class="form-field">
                  <label for="ho-hours">Avg hours/week worked from home</label>
                  <input id="ho-hours" name="ho-hours" type="number" min="0" max="168" step="0.5" placeholder="e.g. 20" bind:value={hoHours} />
                </div>
                <div class="form-field">
                  <label for="ho-weeks">Weeks in FY</label>
                  <input id="ho-weeks" name="ho-weeks" type="number" min="1" max="52" bind:value={hoWeeks} />
                </div>
              </div>
              {#if hoHours}
                <div class="ho-calc">
                  {parseFloat(hoHours)} hrs × {hoWeeks} weeks × 67c = <strong>{fmt(Math.round(parseFloat(hoHours) * parseInt(hoWeeks) * 67))}</strong>
                </div>
              {/if}
              <button class="btn-primary" disabled={hoSaving || !hoHours} on:click={saveHomeOffice}>
                {hoSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          {:else}
            <div class="guidance-note">
              Deduction = occupancy % × actual bills. Enable electricity, gas, internet and mobile modules to log your bills. Occupancy % = home office floor area ÷ total floor area.
            </div>
            <div class="entry-form">
              <div class="form-row">
                <div class="form-field">
                  <label for="ho-office">Home office area (m²)</label>
                  <input id="ho-office" name="ho-office" type="number" min="0" step="0.1" placeholder="e.g. 12" bind:value={hoOfficeArea} />
                </div>
                <div class="form-field">
                  <label for="ho-total">Total home area (m²)</label>
                  <input id="ho-total" name="ho-total" type="number" min="0" step="0.1" placeholder="e.g. 180" bind:value={hoTotalArea} />
                </div>
              </div>
              {#if hoOfficeArea && hoTotalArea && parseFloat(hoTotalArea) > 0}
                <div class="ho-calc">
                  Occupancy %: <strong>{(parseFloat(hoOfficeArea) / parseFloat(hoTotalArea) * 100).toFixed(1)}%</strong>
                </div>
              {/if}
              <button class="btn-primary" disabled={hoSaving || !hoOfficeArea || !hoTotalArea} on:click={saveHomeOffice}>
                {hoSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          {/if}

        <!-- ── VEHICLE TRAVEL ── -->
        {:else if activeModule === 'travel'}
          <div class="module-header">
            <h2>Vehicle Travel</h2>
            {#if travelData}
              <div class="module-total">{fmt(travelDeductible)} deductible · {travelData.total_km.toFixed(1)} km of {travelData.cap_km.toLocaleString()} km cap</div>
            {/if}
          </div>

          {#if travelData && travelData.total_km >= travelData.cap_km}
            <div class="banner banner--warn">You have reached the 5,000 km annual cap. Additional trips cannot be claimed under the cents per km method.</div>
          {/if}

          <div class="entry-form">
            <div class="form-row">
              <div class="form-field">
                <label for="tv-date">Date</label>
                <input id="tv-date" name="tv-date" type="date" bind:value={tvDate} />
              </div>
              <div class="form-field form-field--grow">
                <label for="tv-dest">Destination</label>
                <input id="tv-dest" name="tv-dest" type="text" placeholder="e.g. Client site, Sydney CBD" bind:value={tvDest} />
              </div>
            </div>
            <div class="form-row">
              <div class="form-field form-field--grow">
                <label for="tv-origin">Origin (optional)</label>
                <input id="tv-origin" name="tv-origin" type="text" placeholder="e.g. Home" bind:value={tvOrigin} />
              </div>
              <div class="form-field form-field--grow">
                <label for="tv-purpose">Purpose</label>
                <input id="tv-purpose" name="tv-purpose" type="text" placeholder="e.g. Client meeting" bind:value={tvPurpose} />
              </div>
              <div class="form-field form-field--sm">
                <label for="tv-km">Kilometres</label>
                <input id="tv-km" name="tv-km" type="number" min="0" step="0.1" placeholder="0.0" bind:value={tvKm} />
              </div>
            </div>
            {#if tvKm && travelData}
              <div class="ho-calc">
                {tvKm} km × {travelData.rate_cents}c = <strong>{fmt(Math.round(parseFloat(tvKm) * travelData.rate_cents))}</strong>
              </div>
            {/if}
            <button class="btn-primary" disabled={tvSubmitting || !tvDate || !tvDest || !tvPurpose || !tvKm} on:click={submitTravel}>
              {tvSubmitting ? 'Logging…' : '+ Log trip'}
            </button>
          </div>

          {#if travelLoading}
            <div class="loading-state">Loading…</div>
          {:else if travelData && travelData.entries.length > 0}
            <div class="table-wrap">
              <table class="entry-table">
                <thead>
                  <tr><th>Date</th><th>Destination</th><th>Purpose</th><th class="th-right">km</th><th class="th-right">Deductible</th><th></th></tr>
                </thead>
                <tbody>
                  {#each travelData.entries as e (e.id)}
                    <tr>
                      <td class="td-date">{fmtDate(e.travel_date)}</td>
                      <td>{e.destination}{#if e.origin} <span class="td-muted">from {e.origin}</span>{/if}</td>
                      <td class="td-muted">{e.purpose}</td>
                      <td class="td-right">{parseFloat(e.kilometres.toString()).toFixed(1)}</td>
                      <td class="td-right td-accent">{fmt(e.deductible_cents)}</td>
                      <td class="td-actions"><button class="act-btn act-btn--del" on:click={() => deleteTravel(e.id)}>✕</button></td>
                    </tr>
                  {/each}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan="3" class="total-label">Total</td>
                    <td class="td-right">{travelData.total_km.toFixed(1)} km</td>
                    <td class="td-right td-accent total-val">{fmt(travelDeductible)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {:else}
            <div class="empty-state">No trips logged yet.</div>
          {/if}

        <!-- ── UTILITIES ── -->
        {:else if activeModule === 'utilities' || ['electricity','gas','internet','mobile','water'].includes(activeModule)}
          {@const utilLabel: Record<string, string> = { electricity: 'Electricity', gas: 'Gas', internet: 'Internet', mobile: 'Mobile Phone', water: 'Water' }}
          <div class="module-header">
            <h2>{utilLabel[activeUtility]}</h2>
            <div class="module-total">{fmt(utilDeductible)} deductible</div>
          </div>

          {#if fixedRateLockout && ['electricity','gas','internet','mobile'].includes(activeUtility)}
            <div class="banner banner--warn">
              You are using the Fixed Rate home office method (67c/hr), which already covers {activeUtility} costs. Switch to Actual Cost in Home Office to claim these separately.
            </div>
          {/if}

          {#if activeUtility === 'water'}
            <div class="guidance-note">
              Water is rarely deductible for home office purposes. The ATO generally does not accept water as a home office running expense. Record here for reference only.
            </div>
          {/if}

          <div class="entry-form">
            <div class="form-row">
              <div class="form-field">
                <label for="util-month">Month</label>
                <select id="util-month" name="util-month" bind:value={utilMonth}>
                  {#each MONTHS as m, i}
                    <option value={i + 1}>{m}</option>
                  {/each}
                </select>
              </div>
              <div class="form-field">
                <label for="util-year">Year</label>
                <input id="util-year" name="util-year" type="number" min="2020" max="2030" bind:value={utilYear} />
              </div>
              <div class="form-field">
                <label for="util-amount">Bill amount ($)</label>
                <input id="util-amount" name="util-amount" type="number" min="0" step="0.01" placeholder="0.00" bind:value={utilAmount} />
              </div>
              <div class="form-field form-field--sm">
                <label for="util-pct">Work %</label>
                <input id="util-pct" name="util-pct" type="number" min="0" max="100" bind:value={utilWorkPct} />
              </div>
            </div>
            {#if utilAmount}
              <div class="ho-calc">
                {fmt(Math.round(parseFloat(utilAmount) * 100))} × {utilWorkPct}% = <strong>{fmt(Math.round(parseFloat(utilAmount) * utilWorkPct))}</strong>
              </div>
            {/if}
            <button class="btn-primary" disabled={utilSubmitting || !utilAmount} on:click={submitUtil}>
              {utilSubmitting ? 'Saving…' : '+ Save bill'}
            </button>
          </div>

          {#if utilLoading}
            <div class="loading-state">Loading…</div>
          {:else if utilBills.length > 0}
            <div class="table-wrap">
              <table class="entry-table">
                <thead>
                  <tr><th>Month</th><th class="th-right">Bill</th><th class="th-right">Work %</th><th class="th-right">Deductible</th><th></th></tr>
                </thead>
                <tbody>
                  {#each utilBills as b (b.id)}
                    <tr>
                      <td>{MONTHS[b.bill_month - 1]} {b.bill_year}</td>
                      <td class="td-right">{fmt(b.amount_cents)}</td>
                      <td class="td-right td-muted">{b.work_pct}%</td>
                      <td class="td-right td-accent">{fmt(b.deductible_cents)}</td>
                      <td class="td-actions"><button class="act-btn act-btn--del" on:click={() => deleteUtil(b.id)}>✕</button></td>
                    </tr>
                  {/each}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan="3" class="total-label">Total deductible</td>
                    <td class="td-right td-accent total-val">{fmt(utilDeductible)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {:else}
            <div class="empty-state">No bills entered yet.</div>
          {/if}

        <!-- ── TAX SETTINGS ── -->
        {:else if activeSection === 'tax_settings' && settings}
          <div class="module-header"><h2>Tax Settings</h2></div>

          <div class="settings-grid">
            <div class="settings-section">
              <h3>Tax Role</h3>
              <div class="role-cards role-cards--compact">
                {#each [['payg','PAYG Employee'],['sole_trader','Sole Trader'],['both','Both']] as [val, label]}
                  <button class="role-card" class:selected={settings.tax_role === val} on:click={() => { settings = { ...settings!, tax_role: val as typeof settings.tax_role }; }}>
                    {label}
                  </button>
                {/each}
              </div>
            </div>

            <div class="settings-section">
              <h3>Active Modules</h3>
              <div class="module-toggles">
                {#each [
                  ['mod_vehicle', 'Vehicle Travel'],
                  ['mod_vehicle_service', 'Vehicle Servicing'],
                  ['mod_home_office', 'Home Office'],
                  ['mod_internet', 'Internet'],
                  ['mod_mobile', 'Mobile'],
                  ['mod_electricity', 'Electricity'],
                  ['mod_gas', 'Gas'],
                  ['mod_water', 'Water'],
                  ['mod_fuel', 'Fuel'],
                  ['mod_interest', 'Bank Interest'],
                  ['mod_professional', 'Professional Dev'],
                ] as [key, label]}
                  <label class="toggle-row">
                    <input type="checkbox"
                      checked={settings[key as keyof TaxSettings] as boolean}
                      on:change={(e) => { settings = { ...settings!, [key]: e.currentTarget.checked }; }}
                    />
                    <span>{label}</span>
                  </label>
                {/each}
              </div>
            </div>
          </div>

          <button class="btn-primary" disabled={settingsSaving} on:click={saveSettings}>
            {settingsSaving ? 'Saving…' : 'Save settings'}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .page { padding: 2rem; max-width: 1100px; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.75rem; }
  h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 .25rem; }
  .sub-text { font-size: .85rem; color: var(--fg-muted); }
  .header-actions { display: flex; gap: .75rem; align-items: center; }

  .fy-select {
    padding: .45rem .75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    font-size: .875rem;
    cursor: pointer;
  }

  .loading-state, .empty-state {
    padding: 3rem;
    text-align: center;
    color: var(--fg-muted);
    font-size: .9rem;
  }

  /* ── Wizard ── */
  .wizard-shell { display: flex; justify-content: center; padding: 2rem 0; }
  .wizard-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 2rem; width: 100%; max-width: 600px; }
  .wizard-card h2 { font-size: 1.2rem; font-weight: 700; margin-bottom: .5rem; }
  .wizard-sub { color: var(--fg-muted); font-size: .9rem; margin-bottom: 1.5rem; }
  .wizard-progress { display: flex; align-items: center; margin-bottom: 1.75rem; }
  .wizard-step { width: 28px; height: 28px; border-radius: 50%; background: var(--surface-2); border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 700; color: var(--fg-muted); flex-shrink: 0; }
  .wizard-step.active { border-color: var(--accent); color: var(--accent); }
  .wizard-step.done { background: var(--accent); border-color: var(--accent); color: #fff; }
  .wizard-line { flex: 1; height: 2px; background: var(--border); margin: 0 4px; }
  .wizard-line.done { background: var(--accent); }
  .wizard-field { margin-bottom: 1.5rem; }
  .wizard-field label { display: block; font-size: .85rem; font-weight: 500; color: var(--fg-muted); margin-bottom: .75rem; }
  .wizard-btns { display: flex; gap: .75rem; margin-top: 1.5rem; }
  .wizard-modules { display: flex; flex-direction: column; gap: .5rem; margin-bottom: 1.5rem; }

  .role-cards { display: flex; flex-direction: column; gap: .5rem; }
  .role-cards--compact { flex-direction: row; flex-wrap: wrap; }
  .role-card { background: var(--surface-2); border: 2px solid var(--border); border-radius: var(--radius-sm); padding: .75rem 1rem; text-align: left; cursor: pointer; transition: border-color 150ms; }
  .role-card:hover { border-color: var(--accent); }
  .role-card.selected { border-color: var(--accent); background: rgba(99,102,241,.08); }
  .role-cards--compact .role-card { flex: 1; min-width: 120px; }
  .role-title { font-weight: 600; font-size: .9rem; margin-bottom: .25rem; }
  .role-desc { font-size: .8rem; color: var(--fg-muted); }

  .module-toggle { display: flex; gap: .75rem; align-items: flex-start; padding: .6rem .75rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface-2); cursor: pointer; }
  .module-toggle input { margin-top: 2px; flex-shrink: 0; }
  .module-toggle-label { font-size: .875rem; font-weight: 500; }
  .module-toggle-desc { font-size: .78rem; color: var(--fg-muted); margin-top: 1px; }

  /* ── Main layout ── */
  .tax-layout { display: flex; gap: 1.5rem; align-items: flex-start; }
  .tax-sidebar { width: 200px; flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .75rem; position: sticky; top: 1rem; }
  .sidebar-fy { padding: .5rem .5rem .75rem; border-bottom: 1px solid var(--border); margin-bottom: .5rem; }
  .fy-label { font-size: .75rem; color: var(--fg-muted); font-weight: 500; }
  .fy-total { font-size: .95rem; font-weight: 700; color: var(--accent); margin-top: 2px; }
  .mod-btn { display: flex; align-items: center; gap: .5rem; width: 100%; padding: .5rem .6rem; border: none; background: none; border-radius: 6px; font-size: .83rem; color: var(--fg-muted); cursor: pointer; text-align: left; transition: background 120ms, color 120ms; }
  .mod-btn:hover { background: var(--surface-2); color: var(--fg); }
  .mod-btn.active { background: rgba(99,102,241,.12); color: var(--accent); font-weight: 600; }
  .mod-icon { width: 18px; text-align: center; font-size: .9rem; }

  .tax-main { flex: 1; min-width: 0; }

  /* ── Sub-tabs ── */
  .sub-tabs { display: flex; gap: .25rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border); padding-bottom: .5rem; flex-wrap: wrap; }
  .sub-tabs--sm { margin-top: -.5rem; }
  .sub-tab { padding: .35rem .85rem; border: 1px solid transparent; border-radius: 20px; background: none; color: var(--fg-muted); font-size: .83rem; cursor: pointer; transition: all 150ms; }
  .sub-tab:hover { color: var(--fg); background: var(--surface-2); }
  .sub-tab.active { border-color: var(--accent); color: var(--accent); background: rgba(99,102,241,.08); font-weight: 600; }

  /* ── Module ── */
  .module-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.25rem; }
  .module-header h2 { font-size: 1.15rem; font-weight: 700; margin: 0; }
  .module-total { font-size: .85rem; color: var(--accent); font-weight: 600; }

  /* ── Forms ── */
  .entry-form { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  .form-row { display: flex; gap: .75rem; align-items: flex-end; margin-bottom: .75rem; flex-wrap: wrap; }
  .form-row:last-child { margin-bottom: 0; }
  .form-field { display: flex; flex-direction: column; gap: 4px; }
  .form-field--grow { flex: 1; }
  .form-field--sm { width: 80px; }
  .form-field label { font-size: .78rem; font-weight: 500; color: var(--fg-muted); }
  .form-field input, .form-field select {
    padding: .45rem .65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    font-size: .875rem;
  }
  .form-field input:focus, .form-field select:focus { outline: none; border-color: var(--accent); }

  .ho-calc { font-size: .85rem; color: var(--fg-muted); margin: .25rem 0 .75rem; }
  .ho-calc strong { color: var(--accent); }

  .ho-method-tabs { display: flex; gap: .5rem; margin-bottom: 1rem; }
  .method-tab { padding: .4rem .9rem; border: 1px solid var(--border); border-radius: 20px; background: var(--surface-2); color: var(--fg-muted); font-size: .83rem; cursor: pointer; transition: all 150ms; }
  .method-tab.active { border-color: var(--accent); color: var(--accent); background: rgba(99,102,241,.08); font-weight: 600; }

  /* ── Tables ── */
  .table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
  .entry-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .entry-table thead th { padding: .6rem .85rem; text-align: left; font-size: .75rem; font-weight: 600; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); background: var(--surface); }
  .entry-table tbody tr { border-bottom: 1px solid var(--border); transition: background 100ms; }
  .entry-table tbody tr:last-child { border-bottom: none; }
  .entry-table tbody tr:hover { background: var(--surface-2); }
  .entry-table td { padding: .6rem .85rem; }
  .th-right, .td-right { text-align: right; }
  .td-date { white-space: nowrap; color: var(--fg-muted); font-size: .82rem; }
  .td-muted { color: var(--fg-muted); }
  .td-accent { color: var(--accent); font-weight: 600; }
  .td-actions { text-align: right; white-space: nowrap; }
  .total-row td { padding: .65rem .85rem; background: var(--surface); border-top: 2px solid var(--border); font-weight: 600; }
  .total-label { color: var(--fg-muted); font-size: .85rem; }
  .total-val { font-size: 1rem; }

  .act-btn { padding: .3rem .6rem; border: 1px solid var(--border); border-radius: 5px; background: none; color: var(--fg-muted); font-size: .78rem; cursor: pointer; transition: all 120ms; }
  .act-btn:hover { background: var(--surface-2); color: var(--fg); }
  .act-btn--del:hover { border-color: #E24B4A; color: #E24B4A; }

  /* ── Settings ── */
  .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  .settings-section h3 { font-size: .9rem; font-weight: 600; margin-bottom: .75rem; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .04em; }
  .module-toggles { display: flex; flex-direction: column; gap: .35rem; }
  .toggle-row { display: flex; align-items: center; gap: .6rem; font-size: .875rem; cursor: pointer; padding: .3rem 0; }

  /* ── Banners ── */
  .banner { padding: .6rem .85rem; border-radius: var(--radius-sm); font-size: .85rem; margin-bottom: 1rem; }
  .banner--err { background: rgba(226,75,74,.1); border: 1px solid rgba(226,75,74,.3); color: #E24B4A; }
  .banner--ok { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); color: #16a34a; }
  .banner--warn { background: rgba(251,191,36,.1); border: 1px solid rgba(251,191,36,.3); color: #b45309; }

  .guidance-note { background: rgba(99,102,241,.06); border: 1px solid rgba(99,102,241,.2); border-radius: var(--radius-sm); padding: .65rem .85rem; font-size: .83rem; color: var(--fg-muted); margin-bottom: 1rem; }

  /* ── Early build banner ── */
  .early-build-banner {
    display: flex; align-items: center; gap: .75rem;
    background: color-mix(in srgb, #f59e0b 12%, var(--surface));
    border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
    border-radius: 8px; padding: .75rem 1rem;
    margin-bottom: 1.25rem;
  }
  .early-build-icon { font-size: 1.1rem; flex-shrink: 0; }
  .early-build-text { flex: 1; display: flex; flex-direction: column; gap: .1rem; font-size: .83rem; }
  .early-build-text strong { color: #f59e0b; font-weight: 600; }
  .early-build-text span { color: var(--fg-muted); }
  .early-build-dismiss {
    background: none; border: none; cursor: pointer;
    color: var(--fg-muted); font-size: .85rem; padding: .2rem .4rem;
    border-radius: 4px; flex-shrink: 0;
  }
  .early-build-dismiss:hover { background: rgba(255,255,255,.08); color: var(--fg); }

  /* ── Buttons ── */
  .btn-primary { padding: .5rem 1rem; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); font-size: .875rem; font-weight: 500; cursor: pointer; transition: background 150ms, opacity 150ms; white-space: nowrap; }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-secondary { padding: .5rem 1rem; background: var(--surface-2); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: .875rem; font-weight: 500; cursor: pointer; transition: background 150ms; white-space: nowrap; }
  .btn-secondary:hover { background: var(--surface); }
</style>

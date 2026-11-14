(() => {
  'use strict';

  const OWNER_ONLY_MESSAGE = 'Company financial data is available only in the owner-authenticated workspace.';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const minor = value => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) {
      throw new Error('Enter a valid non-negative amount.');
    }
    return Math.round(amount * 100);
  };
  const money = (value,currency='USD') => {
    const amount = Number(value || 0) / 100;
    try { return new Intl.NumberFormat(undefined,{style:'currency',currency:String(currency||'USD').toUpperCase()}).format(amount); }
    catch { return String(currency || 'USD') + ' ' + amount.toFixed(2); }
  };
  const dateLabel = value => {
    if (!value) return 'Not recorded';
    const date = new Date(String(value) + (String(value).length === 10 ? 'T12:00:00' : ''));
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
  };
  const today = () => { const date=new Date(); return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); };
  const empty = text => '<p class="admin-finance-empty">' + esc(text) + '</p>';
  const field = (label,name,type='text',attrs='') =>
    '<label class="admin-finance-field"><span>' + esc(label) + '</span><input name="' + esc(name) +
    '" type="' + esc(type) + '" ' + attrs + '></label>';
  const select = (label,name,options,attrs='') =>
    '<label class="admin-finance-field"><span>' + esc(label) + '</span><select name="' + esc(name) +
    '" ' + attrs + '>' + options.map(item => '<option value="' + esc(item[0]) + '">' + esc(item[1]) + '</option>').join('') +
    '</select></label>';
  const textarea = (label,name,rows=2) =>
    '<label class="admin-finance-field admin-finance-field-wide"><span>' + esc(label) + '</span><textarea name="' +
    esc(name) + '" rows="' + rows + '" maxlength="2000"></textarea></label>';
  const button = (text,kind='secondary') =>
    '<button type="submit" class="' + esc(kind) + '">' + esc(text) + '</button>';
  const statusPill = value => {
    const normalized = String(value || 'not_recorded').replace(/_/g,' ');
    return '<span class="admin-finance-status">' + esc(normalized) + '</span>';
  };

  function mount(panel, api) {
    if (!panel || panel.querySelector('#admin-finance-control') || typeof api !== 'function') return;
    const section = document.createElement('section');
    section.className = 'admin-finance-control admin-control-centre-section';
    section.id = 'admin-finance-control';
    section.setAttribute('aria-labelledby','admin-finance-title');
    section.innerHTML =
      '<header class="admin-finance-heading"><div><h3 id="admin-finance-title">Company finance &amp; service management</h3>' +
      '<p>Operating costs, provider directory, subscription records, approved budgets, invoices and expenses. Existing creator and seller balances remain in their separate ledgers.</p></div>' +
      '<button type="button" id="admin-finance-refresh" class="secondary">Refresh records</button></header>' +
      '<div class="admin-finance-safety" role="note"><strong>Payments are not connected.</strong> No company bank balance, card, payment vault or provider billing API is connected here. This workspace records verified information and links to provider websites; it does not initiate charges, transfers or automatic renewals. Invoices can only be marked paid after a provider confirmation is integrated and verified.</div>' +
      '<p id="admin-finance-status" class="admin-finance-status-line" role="status" aria-live="polite">Loading saved company finance records…</p>' +
      '<div id="admin-finance-metrics" class="admin-finance-metrics" aria-live="polite"></div>' +
      '<nav class="admin-finance-tabs" role="tablist" aria-label="Company finance pages">' +
      '<button type="button" data-finance-tab="overview" aria-selected="true">Overview</button>' +
      '<button type="button" data-finance-tab="providers" aria-selected="false">Providers</button>' +
      '<button type="button" data-finance-tab="subscriptions" aria-selected="false">Subscriptions</button>' +
      '<button type="button" data-finance-tab="budgets" aria-selected="false">Budgets</button>' +
      '<button type="button" data-finance-tab="invoices" aria-selected="false">Invoices</button>' +
      '<button type="button" data-finance-tab="expenses" aria-selected="false">Expenses</button></nav>' +
      '<div id="admin-finance-tab-panel" class="admin-finance-tab-panel" aria-live="polite"></div>' +
      '<footer class="admin-finance-footer"><span>Amounts are stored in integer minor units with the original invoice currency preserved.</span>' +
      '<button type="button" id="admin-finance-export" class="secondary">Export finance records (CSV)</button></footer>';

    panel.append(section);
    const status = section.querySelector('#admin-finance-status');
    const metrics = section.querySelector('#admin-finance-metrics');
    const content = section.querySelector('#admin-finance-tab-panel');
    let activeTab = 'overview';
    let records = {providers:[],subscriptions:[],budgets:[],invoices:[],expenses:[],auditEvents:[]};
    let loading = false;

    const setStatus = (message, error=false) => {
      status.textContent = message;
      status.dataset.state = error ? 'error' : 'normal';
    };
    const providerById = id => records.providers.find(item => item.id === id) || null;
    const subscriptionById = id => records.subscriptions.find(item => item.id === id) || null;
    const providerOptions = () => records.providers.map(item => [item.id,item.provider_name + ' · ' + item.connection_status.replace(/_/g,' ')]);
    const metric = (label,value,note='') => '<article class="admin-finance-metric"><small>' + esc(label) +
      '</small><strong>' + esc(value) + '</strong>' + (note ? '<span>' + esc(note) + '</span>' : '') + '</article>';
    const subscriptionOptions = () => records.subscriptions.map(item => [item.id,item.service_name]);
    const editAction = (kind,id) => '<button type="button" class="secondary admin-finance-edit" data-finance-edit="' +
      esc(kind) + '" data-id="' + esc(id) + '">Edit</button>';
    const budgetActual = budget => records.expenses.reduce((total,item) => {
      if (item.expense_status !== 'actual' || item.department_key !== budget.department_key ||
          String(item.currency_code || '').toUpperCase() !== String(budget.currency_code || '').toUpperCase()) return total;
      const date = String(item.expense_date || '');
      if (date < String(budget.period_start || '') || date > String(budget.period_end || '')) return total;
      return total + Number(item.amount_minor || 0);
    },0);
    const reminderLabel = value => {
      if (!value) return 'No date recorded';
      const due = new Date(String(value).slice(0,10) + 'T12:00:00');
      const base = new Date(today() + 'T12:00:00');
      if (Number.isNaN(due.getTime())) return 'Date unavailable';
      const days = Math.round((due.getTime() - base.getTime()) / 86400000);
      if (days < 0) return 'Overdue by ' + Math.abs(days) + ' day(s)';
      const threshold = [7,14,30,60,90].find(limit => days <= limit);
      return threshold ? threshold + '-day renewal notice · ' + days + ' day(s) remaining' : 'More than 90 days';
    };

    function renderMetrics() {
      const connected = records.providers.filter(item => item.connection_status === 'active' ||
        item.connection_status === 'free_plan' || item.connection_status === 'paid_plan').length;
      const activeSubscriptions = records.subscriptions.filter(item => ['active','free_plan','paid_plan'].includes(item.subscription_status)).length;
      const unpaid = records.invoices.filter(item => !['paid','cancelled'].includes(item.payment_status));
      const expensesByCurrency = {};
      records.expenses.filter(item => item.expense_status === 'actual').forEach(item => {
        const currency = String(item.currency_code || 'USD');
        expensesByCurrency[currency] = (expensesByCurrency[currency] || 0) + Number(item.amount_minor || 0);
      });
      const expenseSummary = Object.keys(expensesByCurrency).length
        ? Object.entries(expensesByCurrency).map(([currency,amount]) => money(amount,currency)).join(' · ')
        : 'No expenses recorded';
      metrics.innerHTML =
        metric('Directory entries',records.providers.length,'Candidate records are not connected accounts') +
        metric('Verified active services',connected,'Only confirmed provider status should be recorded') +
        metric('Active subscriptions',activeSubscriptions,'From saved subscription records') +
        metric('Outstanding invoices',unpaid.length,'Excludes cancelled and provider-confirmed paid invoices') +
        metric('Actual recorded expenses',records.expenses.filter(item => item.expense_status === 'actual').length,expenseSummary) +
        metric('Company cash balance','NOT CONNECTED','No company bank account is linked');
    }

    function table(headers, rows, emptyText) {
      if (!rows.length) return empty(emptyText);
      return '<div class="admin-finance-table-wrap"><table class="admin-finance-table"><thead><tr>' +
        headers.map(item => '<th>' + esc(item) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.join('') + '</tbody></table></div>';
    }

        function renderOverview() {
      const upcoming = records.subscriptions.filter(item => item.next_payment_date || item.renewal_date)
        .sort((a,b) => String(a.next_payment_date || a.renewal_date).localeCompare(String(b.next_payment_date || b.renewal_date))).slice(0,8);
      const invoices = records.invoices.filter(item => !['paid','cancelled'].includes(item.payment_status))
        .sort((a,b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))).slice(0,8);
      const budgetRows = records.budgets.filter(item => item.approval_status === 'approved').slice(0,8).map(item => {
        const actual = budgetActual(item);
        const remaining = Number(item.allocated_amount_minor || 0) - actual;
        const utilization = Number(item.allocated_amount_minor || 0) > 0
          ? Math.round(actual / Number(item.allocated_amount_minor) * 100) + '%'
          : 'No allocation';
        return '<tr><td>' + esc(item.department_name) + '</td><td>' +
          esc(money(item.allocated_amount_minor,item.currency_code)) + '</td><td>' +
          esc(money(actual,item.currency_code)) + '</td><td>' +
          esc(money(remaining,item.currency_code)) + '</td><td>' + esc(utilization) + '</td></tr>';
      });
      content.innerHTML =
        '<div class="admin-finance-overview-grid"><article><h4>Upcoming subscription dates</h4>' +
        (upcoming.length ? table(['Service','Next payment / renewal','Reminder window'],upcoming.map(item => {
          const provider = providerById(item.provider_id);
          const due = item.next_payment_date || item.renewal_date;
          return '<tr><td>' + esc(item.service_name) + '<small>' + esc(provider?.provider_name || 'Provider unavailable') +
            '</small></td><td>' + esc(dateLabel(due)) + '</td><td>' + statusPill(reminderLabel(due)) + '</td></tr>';
        }),'No subscription dates have been recorded.') : empty('No subscription dates have been recorded.')) +
        '</article><article><h4>Invoices requiring attention</h4>' +
        (invoices.length ? table(['Invoice','Due','Status'],invoices.map(item => '<tr><td>' + esc(item.invoice_number) +
          '<small>' + esc(item.description) + '</small></td><td>' + esc(dateLabel(item.due_date)) +
          '</td><td>' + statusPill(item.payment_status) + '</td></tr>'),'No invoices have been recorded.') :
          empty('No invoices have been recorded.')) +
        '</article></div><article class="admin-finance-budget-summary"><h4>Approved budget vs actual expenses</h4>' +
        (budgetRows.length ? table(['Department','Budget','Actual','Remaining','Used'],budgetRows,'No approved budgets are recorded.') :
          empty('No approved budgets are recorded. Actual expenses are kept separate from creator and seller balances.')) +
        '<p class="admin-finance-form-note">Renewal notice windows are calculated from saved dates; this screen does not send email or push notifications. Budget comparisons use only actual expenses in the same department, currency and date range.</p></article>' +
        '<div class="admin-finance-provider-note"><strong>Provider integrations:</strong> ' +
        esc(records.providers.filter(item => item.api_connection_status === 'connected').length) +
        ' provider API connection(s) are recorded. Provider health is not inferred from the directory listing.</div>' +
        '<p class="admin-finance-muted">Creator earnings, creator payout liabilities, seller liabilities, refunds and customer funds are not included in company operating expenses or cash-balance calculations.</p>';
    }

        function renderProviders() {
      const rows = records.providers.map(item => {
        const canEdit = ['not_registered','planned','registration_pending','disconnected','requires_attention'].includes(item.connection_status);
        return '<tr><td><strong>' + esc(item.provider_name) + '</strong><small>' +
          esc(item.service_category.replace(/_/g,' ')) + (item.is_candidate ? ' · Candidate' : '') + '</small></td><td>' +
          statusPill(item.connection_status) + '<small>API: ' + esc(item.api_connection_status.replace(/_/g,' ')) +
          '</small></td><td>' + esc(item.department.replace(/_/g,' ')) + '</td><td><a href="' + esc(item.website_url) +
          '" target="_blank" rel="noopener noreferrer">Official website</a></td><td>' +
          (canEdit ? editAction('provider',item.id) : '<span class="admin-finance-manual">Managed by verified provider connection</span>') +
          '</td></tr>';
      });
      content.innerHTML =
        '<div class="admin-finance-section-heading"><div><h4>Service provider directory</h4><p>Listed vendors are candidates supplied in the specification. Their status remains not registered until independently verified.</p></div></div>' +
        table(['Provider','Connection status','Department','Website','Record'],rows,'No providers are registered yet.') +
        '<details class="admin-finance-form-details"><summary>Add a provider record</summary><form id="admin-finance-provider-form" class="admin-finance-form">' +
        field('Provider key (lowercase)','provider_key','text','required pattern="[a-z0-9][a-z0-9_-]{1,63}" maxlength="64"') +
        field('Provider name','provider_name','text','required maxlength="160"') +
        field('Official HTTPS website','website_url','url','required placeholder="https://example.com"') +
        field('Service category','service_category','text','required maxlength="80"') +
        field('Department','department','text','required value="infrastructure" maxlength="80"') +
        select('Directory status','connection_status',[['not_registered','Not registered'],['planned','Planned'],['registration_pending','Registration pending'],['disconnected','Disconnected'],['requires_attention','Requires attention']]) +
        select('Importance','service_importance',[['normal','Normal'],['low','Low'],['high','High'],['critical','Critical']]) +
        textarea('Notes (no passwords, API keys or credentials)','notes') + button('Save provider') + '</form></details>';
      section.querySelector('#admin-finance-provider-form')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form = event.currentTarget, values = new FormData(form);
        await save('save_provider',{
          id:form.dataset.editId || undefined,
          provider_key:String(values.get('provider_key')||'').trim().toLowerCase(),
          provider_name:String(values.get('provider_name')||'').trim(),
          website_url:String(values.get('website_url')||'').trim(),
          service_category:String(values.get('service_category')||'').trim(),
          department:String(values.get('department')||'infrastructure').trim().toLowerCase().replace(/\s+/g,'_'),
          connection_status:String(values.get('connection_status')||'not_registered'),
          service_importance:String(values.get('service_importance')||'normal'),
          integration_method:'manual',api_available:false,api_connection_status:'not_connected',notes:String(values.get('notes')||'').trim()
        },form);
      });
    }

        function renderSubscriptions() {
      const rows = records.subscriptions.map(item => {
        const provider = providerById(item.provider_id);
        const billingLink = item.billing_portal_url
          ? '<a href="' + esc(item.billing_portal_url) + '" target="_blank" rel="noopener noreferrer">OPEN PROVIDER BILLING PORTAL</a>'
          : '<span class="admin-finance-manual">MANUAL PROVIDER ACTION REQUIRED</span>';
        const fee = item.monthly_fee_minor !== null && item.monthly_fee_minor !== undefined
          ? money(item.monthly_fee_minor,item.currency_code) + ' / month'
          : item.annual_fee_minor !== null && item.annual_fee_minor !== undefined
            ? money(item.annual_fee_minor,item.currency_code) + ' / year' : 'Price not recorded';
        return '<tr><td><strong>' + esc(item.service_name) + '</strong><small>' + esc(provider?.provider_name || 'Provider unavailable') +
          '</small></td><td>' + esc(item.package_name || item.plan_type) + '</td><td>' + esc(fee) +
          '</td><td>' + esc(dateLabel(item.next_payment_date)) + '</td><td>' + statusPill(item.subscription_status) +
          '</td><td>' + billingLink + '</td><td>' + editAction('subscription',item.id) + '</td></tr>';
      });
      content.innerHTML =
        '<div class="admin-finance-section-heading"><div><h4>Subscription register</h4><p>Record only packages, prices and dates you have verified. Auto-renewal is disabled until a supported approval workflow exists.</p></div></div>' +
        table(['Service','Package','Recorded price','Next payment','Status','Billing action','Record'],rows,'No subscriptions have been recorded.') +
        '<details class="admin-finance-form-details"><summary>Add a subscription record</summary><form id="admin-finance-subscription-form" class="admin-finance-form">' +
        select('Provider','provider_id',providerOptions(),'required') +
        field('Service name','service_name','text','required maxlength="160"') +
        field('Package / plan','package_name','text','maxlength="120"') +
        select('Plan type','plan_type',[['unknown','Unknown'],['free','Free'],['paid','Paid'],['usage_based','Usage based'],['one_time','One time']]) +
        select('Subscription status','subscription_status',[['planned','Planned'],['not_registered','Not registered'],['registration_pending','Registration pending'],['active','Active (verified record)'],['free_plan','Free plan (verified record)'],['paid_plan','Paid plan (verified record)'],['payment_pending','Payment pending'],['overdue','Overdue'],['suspended','Suspended'],['cancelled','Cancelled'],['disconnected','Disconnected'],['requires_attention','Requires attention']]) +
        select('Billing currency','currency_code',[['USD','USD'],['JMD','JMD'],['EUR','EUR'],['GBP','GBP'],['CAD','CAD']]) +
        field('Monthly fee','monthly_fee','number','min="0" step="0.01" inputmode="decimal"') +
        field('Annual fee','annual_fee','number','min="0" step="0.01" inputmode="decimal"') +
        field('Setup fee','setup_fee','number','min="0" step="0.01" inputmode="decimal"') +
        field('Renewal fee','renewal_fee','number','min="0" step="0.01" inputmode="decimal"') +
        select('Billing frequency','billing_frequency',[['unknown','Unknown'],['monthly','Monthly'],['quarterly','Quarterly'],['annually','Annually'],['weekly','Weekly'],['one_time','One time'],['usage_based','Usage based']]) +
        field('Next payment date','next_payment_date','date','') +
        field('Renewal date','renewal_date','date','') +
        field('Billing portal HTTPS URL','billing_portal_url','url','placeholder="Only paste a verified provider billing portal URL"') +
        textarea('Cancellation terms / notes','notes') +
        '<p class="admin-finance-form-note">Auto-renewal remains off. This form does not activate a vendor account, change a provider plan or initiate payment.</p>' +
        button('Save subscription') + '</form></details>';
      section.querySelector('#admin-finance-subscription-form')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form=event.currentTarget, values=new FormData(form);
        try {
          await save('save_subscription',{
            id:form.dataset.editId || undefined,
            provider_id:String(values.get('provider_id')||''),
            service_name:String(values.get('service_name')||'').trim(),
            package_name:String(values.get('package_name')||'').trim(),
            plan_type:String(values.get('plan_type')||'unknown'),
            subscription_status:String(values.get('subscription_status')||'planned'),
            currency_code:String(values.get('currency_code')||'USD'),
            monthly_fee_minor:minor(values.get('monthly_fee')||0),
            annual_fee_minor:minor(values.get('annual_fee')||0),
            setup_fee_minor:minor(values.get('setup_fee')||0),
            renewal_fee_minor:minor(values.get('renewal_fee')||0),
            billing_frequency:String(values.get('billing_frequency')||'unknown'),
            next_payment_date:String(values.get('next_payment_date')||'')||null,
            renewal_date:String(values.get('renewal_date')||'')||null,
            billing_portal_url:String(values.get('billing_portal_url')||'').trim()||null,
            auto_renewal_enabled:false,auto_renewal_approved:false,
            notes:String(values.get('notes')||'').trim()
          },form);
        } catch(error) { setStatus(error.message || 'Enter valid subscription values.',true); }
      });
    }

        function renderBudgets() {
      const rows=records.budgets.map(item => {
        const actual=budgetActual(item);
        const allocation=Number(item.allocated_amount_minor || 0);
        const remaining=allocation-actual;
        const utilization=allocation>0 ? Math.round(actual/allocation*100)+'%' : 'No allocation';
        return '<tr><td><strong>' + esc(item.department_name) + '</strong><small>' +
          esc(item.department_key) + '</small></td><td>' + esc(item.period_type) + '</td><td>' +
          esc(dateLabel(item.period_start)) + ' – ' + esc(dateLabel(item.period_end)) + '</td><td>' +
          esc(money(allocation,item.currency_code)) + '</td><td>' + esc(money(actual,item.currency_code)) +
          '</td><td>' + esc(money(remaining,item.currency_code)) + '</td><td>' + esc(utilization) +
          '</td><td>' + statusPill(item.approval_status) + '</td><td>' +
          (item.approval_status === 'approved' ? '<span class="admin-finance-manual">Locked</span>' : editAction('budget',item.id)) +
          '</td></tr>';
      });
      content.innerHTML =
        '<div class="admin-finance-section-heading"><div><h4>Operating budgets</h4><p>Actuals include only recorded expenses matching the budget department, currency and date period. They do not include creator or seller liabilities.</p></div></div>' +
        table(['Department','Period','Dates','Budget','Actual expenses','Remaining','Used','Approval','Record'],rows,'No operating budgets have been recorded.') +
        '<details class="admin-finance-form-details"><summary>Create a budget allocation</summary><form id="admin-finance-budget-form" class="admin-finance-form">' +
        field('Department key','department_key','text','required maxlength="80" pattern="[a-z0-9][a-z0-9_-]{1,79}"') +
        field('Department name','department_name','text','required maxlength="120"') +
        select('Period','period_type',[['monthly','Monthly'],['quarterly','Quarterly'],['annual','Annual']]) +
        field('Period start','period_start','date','required value="' + today() + '"') +
        field('Period end','period_end','date','required') +
        select('Currency','currency_code',[['USD','USD'],['JMD','JMD']]) +
        field('Approved allocation amount','allocated_amount','number','required min="0" step="0.01" inputmode="decimal"') +
        select('Approval status','approval_status',[['draft','Draft'],['pending','Pending'],['rejected','Rejected']]) +
        textarea('Notes','notes') + button('Save budget') + '</form></details>';
      section.querySelector('#admin-finance-budget-form')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form=event.currentTarget, values=new FormData(form);
        try {
          await save('save_budget',{
            id:form.dataset.editId || undefined,
            department_key:String(values.get('department_key')||'').trim().toLowerCase(),
            department_name:String(values.get('department_name')||'').trim(),
            period_type:String(values.get('period_type')||'monthly'),
            period_start:String(values.get('period_start')||''),
            period_end:String(values.get('period_end')||''),
            currency_code:String(values.get('currency_code')||'USD'),
            allocated_amount_minor:minor(values.get('allocated_amount')),
            approval_status:String(values.get('approval_status')||'draft'),
            notes:String(values.get('notes')||'').trim()
          },form);
        } catch(error) { setStatus(error.message || 'Enter a valid budget.',true); }
      });
    }

        function renderInvoices() {
      const rows=records.invoices.map(item => {
        const provider=providerById(item.provider_id);
        const sub=subscriptionById(item.subscription_id);
        const portal=sub?.billing_portal_url;
        const action=portal
          ? '<a href="' + esc(portal) + '" target="_blank" rel="noopener noreferrer">OPEN PROVIDER BILLING PORTAL</a>'
          : '<span class="admin-finance-manual">MANUAL PROVIDER ACTION REQUIRED</span>' +
            '<a href="' + esc(provider?.website_url || '#') + '" target="_blank" rel="noopener noreferrer">Provider website</a>';
        const locked=['paid','paid_pending_verification','payment_initiated','payment_scheduled'].includes(item.payment_status);
        return '<tr><td><strong>' + esc(item.invoice_number) + '</strong><small>' + esc(provider?.provider_name || 'Provider unavailable') +
          '</small></td><td>' + esc(money(item.total_minor,item.currency_code)) + '</td><td>' +
          esc(dateLabel(item.due_date)) + '</td><td>' + statusPill(item.payment_status) + '</td><td>' + action +
          '</td><td>' + (locked ? '<span class="admin-finance-manual">Locked</span>' : editAction('invoice',item.id)) + '</td></tr>';
      });
      content.innerHTML =
        '<div class="admin-finance-section-heading"><div><h4>Invoice center</h4><p>Paid or payment-in-progress invoices are locked against editing. Upload storage and provider import are not configured yet.</p></div></div>' +
        table(['Invoice / provider','Total','Due date','Payment status','Next action','Record'],rows,'No invoices have been recorded.') +
        '<details class="admin-finance-form-details"><summary>Record an invoice</summary><form id="admin-finance-invoice-form" class="admin-finance-form">' +
        select('Provider','provider_id',providerOptions(),'required') +
        select('Related subscription','subscription_id',[['','No subscription'],...subscriptionOptions()]) +
        field('Invoice number','invoice_number','text','required maxlength="120"') +
        field('Description','description','text','required maxlength="500"') +
        field('Department key','department_key','text','required maxlength="80" value="infrastructure"') +
        field('Invoice date','invoice_date','date','') +
        field('Due date','due_date','date','') +
        select('Currency','currency_code',[['USD','USD'],['JMD','JMD']]) +
        field('Amount before tax','amount','number','required min="0" step="0.01" inputmode="decimal"') +
        field('Tax amount','tax','number','min="0" step="0.01" inputmode="decimal"') +
        select('Payment status','payment_status',[['received','Received'],['under_review','Under review'],['awaiting_approval','Awaiting approval'],['approved','Approved'],['payment_scheduled','Payment scheduled'],['payment_initiated','Payment initiated'],['paid_pending_verification','Paid — awaiting provider verification'],['partially_paid','Partially paid'],['failed','Failed'],['disputed','Disputed'],['overdue','Overdue'],['cancelled','Cancelled']]) +
        select('Approval status','approval_status',[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['not_required','Not required']]) +
        field('External payment reference (not a card number)','payment_reference','text','maxlength="160"') +
        textarea('Notes','notes') +
        '<p class="admin-finance-form-note">Do not enter card numbers, CVV codes, bank credentials or API secrets. Marking an invoice Paid is not available until provider verification is implemented.</p>' +
        button('Save invoice') + '</form></details>';
      const form=section.querySelector('#admin-finance-invoice-form');
      form?.addEventListener('submit',async event => {
        event.preventDefault();
        const values=new FormData(form);
        try {
          const amount=minor(values.get('amount')), tax=minor(values.get('tax')||0);
          await save('save_invoice',{
            id:form.dataset.editId || undefined,
            provider_id:String(values.get('provider_id')||''),
            subscription_id:String(values.get('subscription_id')||'')||null,
            invoice_number:String(values.get('invoice_number')||'').trim(),
            description:String(values.get('description')||'').trim(),
            department_key:String(values.get('department_key')||'infrastructure').trim().toLowerCase().replace(/\s+/g,'_'),
            invoice_date:String(values.get('invoice_date')||'')||null,
            due_date:String(values.get('due_date')||'')||null,
            currency_code:String(values.get('currency_code')||'USD'),
            amount_minor:amount,tax_minor:tax,total_minor:amount+tax,
            payment_status:String(values.get('payment_status')||'received'),
            approval_status:String(values.get('approval_status')||'pending'),
            payment_reference:String(values.get('payment_reference')||'').trim()||null,
            notes:String(values.get('notes')||'').trim()
          },form);
        } catch(error) { setStatus(error.message || 'Enter a valid invoice.',true); }
      });
    }

        function renderExpenses() {
      const rows=records.expenses.map(item => {
        const provider=providerById(item.provider_id);
        return '<tr><td><strong>' + esc(item.description) + '</strong><small>' + esc(provider?.provider_name || 'Provider unavailable') +
          '</small></td><td>' + esc(item.expense_category.replace(/_/g,' ')) + '</td><td>' +
          esc(dateLabel(item.expense_date)) + '</td><td>' + esc(money(item.amount_minor,item.currency_code)) +
          '</td><td>' + statusPill(item.expense_status) + '</td><td>' +
          (item.expense_status === 'reversed' ? '<span class="admin-finance-manual">Reversed</span>' : editAction('expense',item.id)) +
          '</td></tr>';
      });
      content.innerHTML =
        '<div class="admin-finance-section-heading"><div><h4>Operating expense register</h4><p>Record real company expenses only. Unpaid invoices and creator/seller liabilities are not counted as expenses.</p></div></div>' +
        table(['Expense','Category','Date','Amount','Status','Record'],rows,'No operating expenses have been recorded.') +
        '<details class="admin-finance-form-details"><summary>Record an actual expense</summary><form id="admin-finance-expense-form" class="admin-finance-form">' +
        select('Provider / vendor','provider_id',providerOptions(),'required') +
        select('Category','expense_category',[['domain','Domain'],['hosting','Hosting'],['database','Database'],['storage','Storage'],['media','Media'],['communications','Communications'],['software','Software'],['security','Security'],['legal','Legal'],['accounting','Accounting'],['marketing','Marketing'],['support','Support'],['tax','Tax'],['fee','Fee'],['other','Other']]) +
        field('Department key','department_key','text','required maxlength="80" value="infrastructure"') +
        field('Description','description','text','required maxlength="500"') +
        field('Date paid / incurred','expense_date','date','required value="' + today() + '"') +
        select('Currency','currency_code',[['USD','USD'],['JMD','JMD']]) +
        field('Amount','amount','number','required min="0" step="0.01" inputmode="decimal"') +
        field('Invoice ID (optional UUID)','invoice_id','text','maxlength="36"') +
        textarea('Notes','notes') + button('Save expense') + '</form></details>';
      section.querySelector('#admin-finance-expense-form')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form=event.currentTarget, values=new FormData(form);
        try {
          await save('save_expense',{
            id:form.dataset.editId || undefined,
            provider_id:String(values.get('provider_id')||''),
            expense_category:String(values.get('expense_category')||'other'),
            department_key:String(values.get('department_key')||'infrastructure').trim().toLowerCase().replace(/\s+/g,'_'),
            description:String(values.get('description')||'').trim(),
            expense_date:String(values.get('expense_date')||''),
            currency_code:String(values.get('currency_code')||'USD'),
            amount_minor:minor(values.get('amount')),
            invoice_id:String(values.get('invoice_id')||'').trim()||null,
            expense_status:'actual',
            notes:String(values.get('notes')||'').trim()
          },form);
        } catch(error) { setStatus(error.message || 'Enter a valid expense.',true); }
      });
    }

    function beginEdit(kind,id) {
      const definitions = {
        provider: {
          rows:records.providers,formId:'#admin-finance-provider-form',saveLabel:'Save provider',
          locked:record => !['not_registered','planned','registration_pending','disconnected','requires_attention'].includes(record.connection_status),
          aliases:{}
        },
        subscription: {
          rows:records.subscriptions,formId:'#admin-finance-subscription-form',saveLabel:'Save subscription',
          locked:() => false,
          aliases:{monthly_fee:'monthly_fee_minor',annual_fee:'annual_fee_minor',setup_fee:'setup_fee_minor',renewal_fee:'renewal_fee_minor'}
        },
        budget: {
          rows:records.budgets,formId:'#admin-finance-budget-form',saveLabel:'Save budget',
          locked:record => record.approval_status === 'approved',
          aliases:{allocated_amount:'allocated_amount_minor'}
        },
        invoice: {
          rows:records.invoices,formId:'#admin-finance-invoice-form',saveLabel:'Save invoice',
          locked:record => ['paid','paid_pending_verification','payment_initiated','payment_scheduled'].includes(record.payment_status),
          aliases:{amount:'amount_minor',tax:'tax_minor'}
        },
        expense: {
          rows:records.expenses,formId:'#admin-finance-expense-form',saveLabel:'Save expense',
          locked:record => record.expense_status === 'reversed',
          aliases:{amount:'amount_minor'}
        }
      };
      const definition=definitions[kind];
      const record=definition?.rows.find(item => String(item.id) === String(id));
      if (!definition || !record) {
        setStatus('The selected finance record is no longer available. Refresh the records.',true);
        return;
      }
      if (definition.locked(record)) {
        setStatus('This record is locked by its approval or payment state.',true);
        return;
      }
      const form=content.querySelector(definition.formId);
      if (!form) {
        setStatus('Open the matching record form first, then retry Edit.',true);
        return;
      }
      const details=form.closest('details');
      if (details) details.open=true;
      Array.from(form.elements).forEach(control => {
        if (!control.name) return;
        const key=definition.aliases[control.name] || control.name;
        if (!(key in record)) return;
        let value=record[key];
        if (value === null || value === undefined) value='';
        if (control.type === 'number' && key.endsWith('_minor') && value !== '') {
          value=(Number(value)/100).toFixed(2);
        }
        if (control.type === 'date' && value) value=String(value).slice(0,10);
        const stringValue=String(value);
        if (control.tagName === 'SELECT' && !Array.from(control.options).some(option => option.value === stringValue)) return;
        control.value=stringValue;
      });
      form.dataset.editId=String(record.id);
      const submit=form.querySelector('button[type="submit"]');
      if (submit) submit.textContent='Save changes';
      if (!form.querySelector('[data-finance-cancel-edit]')) {
        const cancel=document.createElement('button');
        cancel.type='button';
        cancel.className='secondary admin-finance-cancel-edit';
        cancel.dataset.financeCancelEdit='true';
        cancel.textContent='Cancel edit';
        cancel.addEventListener('click',()=>{
          form.reset();
          delete form.dataset.editId;
          if (submit) submit.textContent=definition.saveLabel;
          cancel.remove();
          setStatus('Edit cancelled. No database changes were made.');
        });
        submit?.before(cancel);
      }
      setStatus('Editing saved ' + kind + ' record. Save changes to update the existing record.');
      form.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    }

    function renderTab() {
      section.querySelectorAll('[data-finance-tab]').forEach(tab => {
        tab.setAttribute('aria-selected',String(tab.dataset.financeTab===activeTab));
      });
      if (activeTab==='overview') renderOverview();
      else if (activeTab==='providers') renderProviders();
      else if (activeTab==='subscriptions') renderSubscriptions();
      else if (activeTab==='budgets') renderBudgets();
      else if (activeTab==='invoices') renderInvoices();
      else if (activeTab==='expenses') renderExpenses();
    }

    async function refresh() {
      if (loading) return;
      loading = true;
      const button=section.querySelector('#admin-finance-refresh');
      if (button) button.disabled=true;
      setStatus('Syncing company finance records from Minglora Supabase…');
      try {
        const result=await api('/admin/finance',{method:'GET'});
        records={
          providers:Array.isArray(result.providers)?result.providers:[],
          subscriptions:Array.isArray(result.subscriptions)?result.subscriptions:[],
          budgets:Array.isArray(result.budgets)?result.budgets:[],
          invoices:Array.isArray(result.invoices)?result.invoices:[],
          expenses:Array.isArray(result.expenses)?result.expenses:[],
          auditEvents:Array.isArray(result.auditEvents)?result.auditEvents:[]
        };
        renderMetrics();
        renderTab();
        setStatus('Synced ' + (result.syncedAt ? new Date(result.syncedAt).toLocaleString() : 'saved database records') +
          ' · ' + records.providers.length + ' providers · ' + records.invoices.length + ' invoices.');
      } catch(error) {
        setStatus(error.message || 'Company finance records are unavailable.',true);
        metrics.innerHTML=metric('Company balance','NOT CONNECTED','No bank feed is connected.');
        content.innerHTML=empty('Finance data could not be loaded. No local demonstration records were substituted.');
      } finally {
        loading=false;
        if(button)button.disabled=false;
      }
    }

        async function save(action,payload,form) {
      const submit=form?.querySelector('button[type="submit"]');
      const wasEditing=Boolean(form?.dataset.editId);
      if(submit)submit.disabled=true;
      setStatus(wasEditing ? 'Updating the saved finance record…' : 'Saving the finance record…');
      try {
        await api('/admin/finance',{method:'POST',body:JSON.stringify({financeAction:action,payload})});
        if(form) {
          form.reset();
          delete form.dataset.editId;
          form.querySelector('[data-finance-cancel-edit]')?.remove();
        }
        setStatus(wasEditing ? 'Record updated. Refreshing the verified database view…' : 'Record saved. Refreshing the verified database view…');
        await refresh();
      } catch(error) {
        setStatus(error.message || 'The record could not be saved.',true);
      } finally {
        if(submit)submit.disabled=false;
      }
    }

    function exportCsv() {
      const sections=[
        ['providers',records.providers],
        ['subscriptions',records.subscriptions],
        ['budgets',records.budgets],
        ['invoices',records.invoices],
        ['expenses',records.expenses]
      ];
      const lines=[];
      sections.forEach(([name,rows])=>{
        if(!rows.length)return;
        lines.push(name.toUpperCase());
        const headers=[...new Set(rows.flatMap(row=>Object.keys(row)))];
        const quote=value=>'"'+String(value ?? '').replace(/"/g,'""')+'"';
        lines.push(headers.map(quote).join(','));
        rows.forEach(row=>lines.push(headers.map(key=>quote(
          row[key] && typeof row[key]==='object' ? JSON.stringify(row[key]) : row[key]
        )).join(',')));
        lines.push('');
      });
      if(!lines.length){setStatus('There are no saved finance records to export.');return;}
      const blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url;anchor.download='minglora-finance-records-'+today()+'.csv';
      document.body.append(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
      setStatus('Finance records exported as CSV.');
    }

    content.addEventListener('click',event => {
      const button=event.target?.closest?.('[data-finance-edit]');
      if (!button) return;
      beginEdit(button.dataset.financeEdit,button.dataset.id);
    });
    section.querySelectorAll('[data-finance-tab]').forEach(tab => tab.addEventListener('click',()=>{
      activeTab=tab.dataset.financeTab;renderTab();
    }));
    section.querySelector('#admin-finance-refresh')?.addEventListener('click',refresh);
    section.querySelector('#admin-finance-export')?.addEventListener('click',exportCsv);
    if (!window.__mingloraAdminAccess?.canAccess) {
      setStatus(OWNER_ONLY_MESSAGE,true);
      content.innerHTML=empty(OWNER_ONLY_MESSAGE);
      return;
    }
    refresh();
  }

  window.MingloraAdminFinance = Object.freeze({mount});
})();
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowUpRight, Building2, Check, ChevronDown, CirclePlus,
  Copy, CreditCard, FileText, Link2, LoaderCircle, RefreshCw, Save,
  ShieldCheck, Users
} from "lucide-react";

async function apiRequest(path, token, options = {}) {
  const apiUrl = String(import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000" : "")).replace(/\/$/, "");
  if (!apiUrl) throw new Error("The HarborPay API URL is not configured.");
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(apiUrl + path, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "HarborPay request failed.");
  return payload;
}

const money = (minor, currency = "USD") => new Intl.NumberFormat("en-US", {
  style: "currency", currency
}).format(Number(minor || 0) / 100);

const date = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium"
}).format(new Date(value)) : "—";

function Panel({ title, description, children, action }) {
  return <section className="hp-work-panel">
    <div className="hp-work-panel-heading">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

function Field({ label, children }) {
  return <label className="hp-field"><span>{label}</span>{children}</label>;
}

function Empty({ title, description }) {
  return <div className="hp-empty"><span className="hp-empty-icon"><FileText size={21} /></span><strong>{title}</strong><p>{description}</p></div>;
}

export default function MerchantWorkspace({ session, section, notify }) {
  const token = session?.access_token;
  const [merchants, setMerchants] = useState([]);
  const [merchantId, setMerchantId] = useState("");
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const selected = useMemo(() => merchants.find((item) => item.id === merchantId) || null, [merchants, merchantId]);

  const loadMerchants = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest("/api/merchants", token);
      const items = result.items || [];
      setMerchants(items);
      setMerchantId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id || ""));
      return items;
    } catch (error) {
      notify(error.message, "error");
      return [];
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  const loadResources = useCallback(async (id) => {
    if (!id) {
      setCustomers([]);
      setOrders([]);
      setLinks([]);
      return;
    }
    setLoading(true);
    try {
      const [customerResult, orderResult, linkResult] = await Promise.all([
        apiRequest("/api/merchants/" + id + "/customers", token),
        apiRequest("/api/merchants/" + id + "/orders", token),
        apiRequest("/api/merchants/" + id + "/payment-links", token)
      ]);
      setCustomers(customerResult.items || []);
      setOrders(orderResult.items || []);
      setLinks(linkResult.items || []);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  useEffect(() => { loadMerchants(); }, [loadMerchants]);
  useEffect(() => { if (merchantId) loadResources(merchantId); }, [merchantId, loadResources]);

  async function createMerchant(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFormError("");
    try {
      const result = await apiRequest("/api/merchants", token, {
        method: "POST",
        body: {
          displayName: form.get("displayName"),
          businessEmail: form.get("businessEmail") || null,
          websiteUrl: form.get("websiteUrl") || null
        }
      });
      notify("Merchant profile created. It is in draft status until provider and business checks are completed.");
      setShowCreate(false);
      await loadMerchants();
      setMerchantId(result.merchant.id);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMerchant(event) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFormError("");
    try {
      const result = await apiRequest("/api/merchants/" + selected.id + "/profile", token, {
        method: "POST",
        body: {
          displayName: form.get("displayName"),
          legalName: form.get("legalName") || "",
          businessEmail: form.get("businessEmail") || "",
          websiteUrl: form.get("websiteUrl") || ""
        }
      });
      setMerchants((items) => items.map((item) => item.id === result.merchant.id ? { ...item, ...result.merchant } : item));
      notify("Merchant profile saved.");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createCustomer(event) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setFormError("");
    try {
      await apiRequest("/api/merchants/" + selected.id + "/customers", token, {
        method: "POST",
        body: {
          email: form.get("email"),
          fullName: form.get("fullName") || null,
          phoneE164: form.get("phoneE164") || null,
          countryCode: form.get("countryCode") || null,
          externalReference: form.get("externalReference") || null
        }
      });
      formElement.reset();
      await loadResources(selected.id);
      notify("Customer saved to your merchant records.");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setFormError("");
    try {
      const result = await apiRequest("/api/merchants/" + selected.id + "/orders", token, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          amount: form.get("amount"),
          description: form.get("description"),
          customerId: form.get("customerId") || null,
          orderReference: form.get("orderReference") || null
        }
      });
      formElement.reset();
      await loadResources(selected.id);
      notify("Order " + result.order.order_reference + " was created. No payment is recorded until a provider checkout is completed.");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createLink(event) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setFormError("");
    try {
      const result = await apiRequest("/api/merchants/" + selected.id + "/payment-links", token, {
        method: "POST",
        body: {
          title: form.get("title"),
          description: form.get("description") || null,
          amount: form.get("amount") || null,
          maxUses: form.get("maxUses") || null
        }
      });
      formElement.reset();
      await loadResources(selected.id);
      notify(result.message || "Payment link record created. Public checkout is not enabled.");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeLinkStatus(link, status) {
    setBusy(true);
    try {
      await apiRequest("/api/merchants/" + selected.id + "/payment-links/" + link.id + "/status", token, {
        method: "POST",
        body: { status }
      });
      await loadResources(selected.id);
      notify(status === "active" ? "Payment link record activated." : "Payment link disabled.");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    try {
      const items = await loadMerchants();
      if (merchantId) await loadResources(merchantId);
      else if (items[0]) await loadResources(items[0].id);
    } catch {}
  }

  if (loading && merchants.length === 0) {
    return <div className="hp-loading-inline"><LoaderCircle className="hp-spin" size={20} /> Loading your merchant workspace…</div>;
  }

  if (merchants.length === 0 || showCreate) {
    return <div className="hp-workspace">
      <Panel title="Create a merchant profile" description="Set up a business workspace to manage customer records, orders, and payment-link records. Creating a profile does not activate payment processing.">
        <form className="hp-form-grid" onSubmit={createMerchant}>
          <Field label="Business / merchant name"><input name="displayName" minLength="2" maxLength="120" required placeholder="Your business name" /></Field>
          <Field label="Business email"><input name="businessEmail" type="email" placeholder="accounts@example.com" /></Field>
          <Field label="Website"><input name="websiteUrl" type="url" placeholder="https://example.com" /></Field>
          {formError && <p className="message error hp-form-error">{formError}</p>}
          <div className="hp-form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Create merchant profile"} <ArrowUpRight size={16} /></button>{merchants.length > 0 && <button className="hp-secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>}</div>
        </form>
      </Panel>
    </div>;
  }

  const totals = {
    customers: customers.length,
    orders: orders.length,
    links: links.length,
    paid: orders.filter((order) => order.status === "paid").length
  };

  return <div className="hp-workspace">
    <div className="hp-workspace-toolbar">
      <div className="hp-merchant-select-wrap">
        <Building2 size={17} />
        <select value={merchantId} onChange={(event) => setMerchantId(event.target.value)} aria-label="Choose merchant">
          {merchants.map((item) => <option key={item.id} value={item.id}>{item.display_name} — {String(item.account_type || "merchant").replaceAll("_", " ")}</option>)}
        </select>
        <ChevronDown size={15} />
      </div>
      <div className="hp-toolbar-actions">
        <button className="hp-secondary-button" type="button" onClick={refresh} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        <button className="hp-secondary-button" type="button" onClick={() => setShowCreate(true)}><CirclePlus size={15} /> Add business</button>
      </div>
    </div>

    {section === "Business" && selected && <div className="hp-workspace-grid">
      <Panel title={(selected.account_type === "enterprise" ? "Enterprise organization" : selected.account_type === "business" ? "Business profile" : "Merchant profile")} description="Your HarborPay organization record and review state.">
        <form className="hp-form-grid" onSubmit={saveMerchant}>
          <Field label="Display name"><input name="displayName" defaultValue={selected.display_name} minLength="2" maxLength="120" required /></Field>
          <Field label="Legal name"><input name="legalName" defaultValue={selected.legal_name || ""} maxLength="120" placeholder="Registered legal name" /></Field>
          <Field label="Business email"><input name="businessEmail" defaultValue={selected.business_email || ""} type="email" /></Field>
          <Field label="Website"><input name="websiteUrl" defaultValue={selected.website_url || ""} type="url" placeholder="https://example.com" /></Field>
          <div className="hp-form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save business details"} <Save size={15} /></button></div>
        </form>
        {formError && <p className="message error hp-form-error">{formError}</p>}
      </Panel>
      <Panel title="Merchant status" description="Payment capability is enabled only after the required checks.">
        <div className="hp-status-card">
          <span className={"hp-status-dot " + selected.status}>{selected.status}</span>
          <p>{selected.status === "active" ? "Merchant account is marked active. Provider capability still determines which payment services are available." : "This merchant profile is saved but not approved for processing. Complete the required business verification and connect an eligible payment provider before accepting customer payments."}</p>
          <div className="hp-status-meta"><span>Country</span><strong>{selected.country_code || "JM"}</strong></div>
          <div className="hp-status-meta"><span>Settlement currency</span><strong>{selected.settlement_currency || "USD"}</strong></div>
          <div className="hp-status-meta"><span>Payouts</span><strong>{selected.payouts_enabled ? "Provider enabled" : "Not enabled"}</strong></div>
        </div>
      </Panel>
      <div className="hp-metric-card"><span><Users size={17} /> Customers</span><strong>{totals.customers}</strong><small>Saved merchant customers</small></div>
      <div className="hp-metric-card"><span><FileText size={17} /> Orders</span><strong>{totals.orders}</strong><small>Recorded merchant orders</small></div>
      <div className="hp-metric-card"><span><Link2 size={17} /> Payment links</span><strong>{totals.links}</strong><small>Link records created</small></div>
      <div className="hp-metric-card"><span><Check size={17} /> Paid orders</span><strong>{totals.paid}</strong><small>Confirmed paid status only</small></div>
    </div>}

    {section === "Customers" && <div className="hp-workspace-grid">
      <Panel title="Add a customer" description="Save a customer to this merchant's records.">
        <form className="hp-form-grid" onSubmit={createCustomer}>
          <Field label="Email address"><input name="email" type="email" required /></Field>
          <Field label="Full name"><input name="fullName" maxLength="120" /></Field>
          <Field label="Phone (E.164)"><input name="phoneE164" placeholder="+18765550123" /></Field>
          <Field label="Country code"><input name="countryCode" maxLength="2" placeholder="JM" /></Field>
          <Field label="External reference"><input name="externalReference" maxLength="120" /></Field>
          {formError && <p className="message error hp-form-error">{formError}</p>}
          <div className="hp-form-actions"><button className="primary-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save customer"} <CirclePlus size={15} /></button></div>
        </form>
      </Panel>
      <Panel title="Customer records" description={customers.length + " customer record(s) for " + selected.display_name}>
        {customers.length === 0 ? <Empty title="No customers yet" description="Customers you add will appear here, stored in the HarborPay database." /> :
          <div className="hp-data-list">{customers.map((customer) => <div className="hp-data-row" key={customer.id}><div className="hp-avatar">{(customer.full_name || customer.email).slice(0,1).toUpperCase()}</div><div className="hp-data-primary"><strong>{customer.full_name || customer.email}</strong><small>{customer.email}{customer.phone_e164 ? " · " + customer.phone_e164 : ""}</small></div><span className="hp-data-date">{date(customer.created_at)}</span></div>)}</div>}
      </Panel>
    </div>}

    {section === "Orders" && <div className="hp-workspace-grid">
      <Panel title="Create an order" description="Record an order before its payment is initiated through an enabled provider flow.">
        <form className="hp-form-grid" onSubmit={createOrder}>
          <Field label="Order description"><input name="description" maxLength="120" required placeholder="What is being purchased?" /></Field>
          <Field label="Amount (USD)"><input name="amount" inputMode="decimal" required placeholder="25.00" /></Field>
          <Field label="Customer (optional)"><select name="customerId" defaultValue=""><option value="">No customer linked</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.email} — {customer.email}</option>)}</select></Field>
          <Field label="Order reference (optional)"><input name="orderReference" maxLength="64" placeholder="Auto-generated if blank" /></Field>
          {formError && <p className="message error hp-form-error">{formError}</p>}
          <div className="hp-form-actions"><button className="primary-button" disabled={busy} type="submit">{busy ? "Creating…" : "Create order"} <CirclePlus size={15} /></button></div>
        </form>
      </Panel>
      <Panel title="Orders" description={orders.length + " recorded order(s) for " + selected.display_name}>
        {orders.length === 0 ? <Empty title="No orders yet" description="Create an order above. Only a verified payment provider response can mark it as paid." /> :
          <div className="hp-data-list">{orders.map((order) => <div className="hp-data-row" key={order.id}><span className="hp-data-icon"><FileText size={17} /></span><div className="hp-data-primary"><strong>{order.order_reference} · {order.description}</strong><small>{date(order.created_at)} · {order.customer_id ? "Customer linked" : "No customer linked"}</small></div><div className="hp-data-trailing"><strong>{money(order.amount_minor, order.currency)}</strong><em className={"status-pill " + order.status}>{order.status.replaceAll("_", " ")}</em></div></div>)}</div>}
      </Panel>
    </div>}

    {section === "Payment links" && <div className="hp-workspace-grid">
      <Panel title="Create a payment link record" description="Create a fixed-amount or customer-entered-amount link record. Public checkout is still gated on merchant PayPal onboarding.">
        <form className="hp-form-grid" onSubmit={createLink}>
          <Field label="Link title"><input name="title" minLength="2" maxLength="120" required placeholder="Invoice or service name" /></Field>
          <Field label="Description"><input name="description" maxLength="120" placeholder="Optional payment details" /></Field>
          <Field label="Fixed amount (USD)"><input name="amount" inputMode="decimal" placeholder="Leave blank for variable amount" /></Field>
          <Field label="Maximum uses"><input name="maxUses" type="number" min="1" step="1" placeholder="Unlimited" /></Field>
          {formError && <p className="message error hp-form-error">{formError}</p>}
          <div className="hp-form-actions"><button className="primary-button" disabled={busy} type="submit">{busy ? "Creating…" : "Create link record"} <Link2 size={15} /></button></div>
        </form>
      </Panel>
      <Panel title="Payment links" description={links.length + " payment link record(s) for " + selected.display_name}>
        <div className="hp-provider-gate"><AlertCircle size={17} /><span><strong>Public checkout is not enabled yet</strong><small>These are database-backed link records. They are not presented as payable links until the merchant's PayPal onboarding and connected settlement flow are configured and verified.</small></span></div>
        {links.length === 0 ? <Empty title="No link records yet" description="Create one above. It will be stored in your merchant account." /> :
          <div className="hp-data-list">{links.map((link) => <div className="hp-data-row" key={link.id}><span className="hp-data-icon"><Link2 size={17} /></span><div className="hp-data-primary"><strong>{link.title}</strong><small>Record slug {link.slug} · {link.use_count} uses · Created {date(link.created_at)}</small></div><div className="hp-data-trailing"><strong>{link.amount_minor == null ? "Customer enters amount" : money(link.amount_minor, link.currency)}</strong><em className={"status-pill " + link.status}>{link.status}</em><button className="hp-small-button" type="button" disabled={busy || link.status === "expired"} onClick={() => changeLinkStatus(link, link.status === "active" ? "disabled" : "active")}>{link.status === "active" ? "Disable" : "Activate record"}</button></div></div>)}</div>}
      </Panel>
    </div>}

    {loading && <div className="hp-loading-inline"><LoaderCircle className="hp-spin" size={16} /> Syncing merchant data…</div>}
  </div>;
}

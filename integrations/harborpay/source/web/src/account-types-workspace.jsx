import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, CircleAlert,
  Clock3, LoaderCircle, ShieldCheck, Store, UserRound
} from "lucide-react";

const API_URL = String(import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000" : "")).replace(/\/$/, "");
const TYPES = [
  { id: "personal", title: "Personal", icon: UserRound, description: "Your individual HarborPay account, payments and personal details.", action: "Open personal account", mode: "profile" },
  { id: "business", title: "Business", icon: BriefcaseBusiness, description: "A sole proprietor or registered business profile with an owner and business details.", action: "Set up a business account", mode: "application" },
  { id: "merchant", title: "Merchant", icon: Store, description: "A merchant workspace for customers, orders, payment records and future provider checkout.", action: "Set up merchant services", mode: "application" },
  { id: "enterprise", title: "Enterprise", icon: Building2, description: "An organization application for larger teams, multiple operations and controlled access.", action: "Start enterprise onboarding", mode: "application" }
];

async function request(path, token, options = {}) {
  if (!API_URL) throw new Error("The HarborPay API URL is not configured.");
  const response = await fetch(API_URL + path, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "HarborPay account request failed.");
  return payload;
}

const date = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";
const money = (minor, currency = "USD") => minor == null ? "Not provided" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(minor) / 100);
const label = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function Field({ label: title, name, ...props }) {
  return <label className="hp-field"><span>{title}</span><input name={name} {...props} /></label>;
}

function Panel({ title, description, children }) {
  return <section className="hp-work-panel"><div className="hp-work-panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>;
}

export default function AccountTypesWorkspace({ session, initialType = "", onProfile, onOpenWorkspace, notify }) {
  const [selectedType, setSelectedType] = useState(TYPES.some((item) => item.id === initialType) ? initialType : "");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request("/api/account-applications", session.access_token);
      setApplications(result.items || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => { loadApplications(); }, [loadApplications]);

  const choose = (type) => {
    if (type.mode === "profile") {
      onProfile();
      return;
    }
    setSelectedType(type.id);
    setError("");
    setSuccess("");
  };

  async function submit(event) {
    event.preventDefault();
    if (!selectedType || selectedType === "personal") return;
    const form = new FormData(event.currentTarget);
    const countriesServed = String(form.get("countriesServed") || "JM")
      .split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await request("/api/account-applications", session.access_token, {
        method: "POST",
        body: {
          accountType: selectedType,
          organizationName: form.get("organizationName"),
          legalName: form.get("legalName"),
          contactName: form.get("contactName"),
          contactEmail: form.get("contactEmail"),
          countryCode: form.get("countryCode"),
          registrationNumber: form.get("registrationNumber"),
          industry: form.get("industry"),
          websiteUrl: form.get("websiteUrl"),
          businessDescription: form.get("businessDescription"),
          useCase: form.get("useCase"),
          expectedMonthlyVolume: form.get("expectedMonthlyVolume"),
          expectedMonthlyTransactions: form.get("expectedMonthlyTransactions"),
          countriesServed,
          settlementCurrency: form.get("settlementCurrency")
        }
      });
      setSuccess(result.message || "Your account application was saved.");
      setSelectedType("");
      await loadApplications();
      notify(result.message || "Your HarborPay account application was saved.");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  const activeApplication = applications.find((item) =>
    item.accountType === selectedType && ["submitted", "in_review", "needs_information"].includes(item.status)
  );
  const currentType = TYPES.find((item) => item.id === selectedType);

  return <div className="hp-workspace hp-account-types">
    <Panel title="Choose your HarborPay account" description="Each option opens a working account page. Personal takes you to your individual profile. Business, Merchant and Enterprise open an application that is saved to HarborPay and can be tracked here.">
      <div className="hp-account-type-grid">
        {TYPES.map((item) => {
          const Icon = item.icon;
          const active = selectedType === item.id;
          return <button key={item.id} type="button" className={"hp-account-type-card " + (active ? "active" : "")} onClick={() => choose(item)}>
            <span className="hp-account-type-icon"><Icon size={22} /></span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
            <span className="hp-account-type-action">{item.action} <ArrowRight size={14} /></span>
          </button>;
        })}
      </div>
    </Panel>

    {success && <div className="hp-action-message success"><CheckCircle2 size={17} /><span>{success}</span></div>}
    {error && <div className="hp-action-message error"><CircleAlert size={17} /><span>{error}</span></div>}

    {currentType && <Panel title={currentType.title + " account setup"} description="Submit your real organization details. Your application and account workspace will be saved under your HarborPay user ID. No account is marked verified or enabled automatically.">
      {activeApplication ? <div className="hp-provider-gate"><Clock3 size={18} /><span><strong>You already have an active {label(selectedType)} application</strong><small>Application {activeApplication.id} is currently {label(activeApplication.status)}. Check the application history below for updates.</small></span></div> :
      <form className="hp-form-grid" onSubmit={submit}>
        <Field label="Organization / trading name" name="organizationName" minLength={2} maxLength={160} required placeholder="Your business or organization name" />
        <Field label="Registered legal name" name="legalName" maxLength={160} placeholder="Legal entity name, where applicable" />
        <Field label="Contact person" name="contactName" minLength={2} maxLength={120} required defaultValue={session.user?.user_metadata?.full_name || ""} />
        <Field label="Business contact email" name="contactEmail" type="email" required defaultValue={session.user?.email || ""} />
        <Field label="Country of registration" name="countryCode" minLength={2} maxLength={2} required defaultValue="JM" />
        <Field label="Registration / company number" name="registrationNumber" maxLength={100} placeholder="Optional at initial submission" />
        <Field label="Industry" name="industry" maxLength={100} placeholder="e.g. Retail, professional services" />
        <Field label="Business website" name="websiteUrl" type="url" placeholder="https://example.com" />
        <Field label="Estimated monthly payment volume (USD)" name="expectedMonthlyVolume" inputMode="decimal" placeholder="e.g. 2500.00" />
        <Field label="Estimated transactions per month" name="expectedMonthlyTransactions" type="number" min={0} max={10000000} step={1} placeholder="e.g. 150" />
        <Field label="Countries served (comma-separated ISO codes)" name="countriesServed" defaultValue="JM" placeholder="JM, US, CA" />
        <label className="hp-field"><span>Preferred settlement currency</span><select name="settlementCurrency" defaultValue="USD"><option value="USD">USD — US Dollar</option><option value="JMD">JMD — Jamaican Dollar</option><option value="CAD">CAD — Canadian Dollar</option><option value="GBP">GBP — British Pound</option><option value="EUR">EUR — Euro</option></select></label>
        <label className="hp-field hp-field-full"><span>Describe your organization</span><textarea name="businessDescription" minLength={30} maxLength={4000} rows={4} required placeholder="What does your business or organization do? Who are your customers?" /></label>
        <label className="hp-field hp-field-full"><span>How will you use HarborPay?</span><textarea name="useCase" minLength={10} maxLength={2000} rows={3} required placeholder="Describe the payment and account services you need." /></label>
        <div className="hp-provider-gate hp-field-full"><ShieldCheck size={17} /><span><strong>Verification comes after submission</strong><small>HarborPay will store this as an application. A submission is not KYC/KYB approval, PayPal merchant approval or permission to accept live payments.</small></span></div>
        <div className="hp-form-actions hp-field-full"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving application…" : "Create account and submit for review"} <ArrowRight size={16} /></button><button className="hp-secondary-button" type="button" onClick={() => setSelectedType("")}>Cancel</button></div>
      </form>}
    </Panel>}

    <Panel title="Your account applications" description="Applications are loaded from the HarborPay database for your signed-in account.">
      {loading ? <div className="hp-loading-inline"><LoaderCircle className="hp-spin" size={18} /> Loading your applications…</div> :
        applications.length === 0 ? <div className="hp-empty"><span className="hp-empty-icon"><BriefcaseBusiness size={20} /></span><strong>No business or enterprise applications yet</strong><p>Choose a Business, Merchant or Enterprise account above to begin. Your personal account is already available from My profile.</p></div> :
        <div className="hp-data-list">{applications.map((item) => <article className="hp-application-row" key={item.id}>
          <div className="hp-data-icon">{item.accountType === "enterprise" ? <Building2 size={18} /> : item.accountType === "merchant" ? <Store size={18} /> : <BriefcaseBusiness size={18} />}</div>
          <div className="hp-data-primary"><strong>{item.organizationName}</strong><small>{label(item.accountType)} · Submitted {date(item.createdAt)} · {item.countryCode}</small><small>Application {item.id}</small></div>
          <div className="hp-data-trailing"><em className={"status-pill " + item.status}>{label(item.status)}</em><small>{money(item.expectedMonthlyVolumeMinor, item.settlementCurrency)}</small><button className="hp-small-button" type="button" onClick={() => item.merchantId && onOpenWorkspace?.(item.merchantId)}>Open workspace <ArrowRight size={13} /></button></div>
        </article>)}</div>}
    </Panel>
  </div>;
}

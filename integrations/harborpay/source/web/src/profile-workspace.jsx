import React, { useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, Save, ShieldCheck } from "lucide-react";

const API_URL = String(import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000" : "")).replace(/\/$/, "");

async function request(path, token, options = {}) {
  if (!API_URL) throw new Error("The HarborPay API URL is not configured.");
  const response = await fetch(API_URL + path, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Profile request failed.");
  return result;
}

export default function ProfileWorkspace({ session, notify }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await request("/api/profile", session.access_token);
      setProfile(result.profile);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [session.access_token]);

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/profile", session.access_token, {
        method: "POST",
        body: {
          fullName: form.get("fullName"),
          phoneE164: form.get("phoneE164") || "",
          countryCode: form.get("countryCode"),
          locale: form.get("locale"),
          timezone: form.get("timezone")
        }
      });
      setProfile(result.profile);
      notify("Your HarborPay profile was saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="hp-loading-inline"><LoaderCircle className="hp-spin" size={20} /> Loading your account profile…</div>;

  if (!profile) return <section className="hp-work-panel">
    <div className="hp-provider-gate"><AlertCircle size={18} /><span><strong>Profile unavailable</strong><small>{error || "The account profile could not be loaded."}</small></span></div>
    <button className="hp-secondary-button" type="button" onClick={load}>Try again</button>
  </section>;

  return <div className="hp-workspace">
    <div className="hp-workspace-grid">
      <section className="hp-work-panel">
        <div className="hp-work-panel-heading"><div><h2>Personal profile</h2><p>These details are stored in the dedicated HarborPay database.</p></div><ShieldCheck size={20} /></div>
        <form className="hp-form-grid" onSubmit={save}>
          <label className="hp-field"><span>Full name</span><input name="fullName" required minLength="2" maxLength="120" defaultValue={profile.full_name || ""} /></label>
          <label className="hp-field"><span>Verified sign-in email</span><input value={profile.email || ""} readOnly disabled /></label>
          <label className="hp-field"><span>Phone number (E.164)</span><input name="phoneE164" defaultValue={profile.phone_e164 || ""} placeholder="+18765550123" /></label>
          <label className="hp-field"><span>Country code</span><input name="countryCode" required minLength="2" maxLength="2" defaultValue={profile.country_code || "JM"} /></label>
          <label className="hp-field"><span>Language / locale</span><input name="locale" required defaultValue={profile.locale || "en"} /></label>
          <label className="hp-field"><span>Time zone</span><input name="timezone" required defaultValue={profile.timezone || "America/Jamaica"} /></label>
          {error && <p className="message error hp-form-error">{error}</p>}
          <div className="hp-form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"} <Save size={15} /></button></div>
        </form>
      </section>
      <section className="hp-work-panel">
        <div className="hp-work-panel-heading"><div><h2>Account security</h2><p>HarborPay sign-in is separate from your Minglora password.</p></div><ShieldCheck size={20} /></div>
        <div className="hp-security-list">
          <div><span>Email confirmation</span><strong className={profile.email_verified_at ? "is-confirmed" : "is-pending"}>{profile.email_verified_at ? "Verified" : "Pending"}</strong></div>
          <div><span>Account status</span><strong>{profile.account_status || "active"}</strong></div>
          <div><span>Account created</span><strong>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(profile.created_at))}</strong></div>
          <div><span>Password recovery</span><strong>Available on sign-in screen</strong></div>
        </div>
        <p className="hp-security-note">For your protection, HarborPay does not display or store your password. Use “Forgot password” on the sign-in screen to request a secure reset email.</p>
      </section>
    </div>
  </div>;
}

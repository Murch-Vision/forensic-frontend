/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : SettingsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-24
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useEffect, useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  CLEAR_ALL_DATA,
  SETTINGS_FULL_QUERY,
  UPDATE_SETTINGS,
} from "../graphql/queries";
import {Card, Loading, PageHeader} from "../components/kit";
import {Select} from "../components/inputs";

interface Aml {
  cashReportingThreshold: number;
  nearThresholdRangeLow: number;
  nearThresholdRangeHigh: number;
  roundNumberMinAmount: number;
  roundNumberModulus: number;
  nightHoursStart: number;
  nightHoursEnd: number;
  highValueTxnFloor: number;
  muleDailyInflowMin: number;
  muleOutflowRatio: number;
  smurfingUnitMax: number;
  smurfingDailyTotalMin: number;
  currencySymbol: string;
  currencyFormat: string;
}

interface Osint {
  autoRefreshEnabled: boolean;
  refreshUrl: string;
  intervalHours: number;
}

interface Settings {
  schemaVersion: number;
  language: string;
  theme: string;
  auditRetentionDays: number;
  telemetryEnabled: boolean;
  aml: Aml;
  osint: Osint;
}

const AML_FIELDS: {key: keyof Aml; label: string}[] = [
  {key: "cashReportingThreshold", label: "Бэлэн мөнгөний тайлагнах босго"},
  {key: "nearThresholdRangeLow", label: "Структуринг муж — доод"},
  {key: "nearThresholdRangeHigh", label: "Структуринг муж — дээд"},
  {key: "roundNumberMinAmount", label: "Бүтэн тооны доод дүн"},
  {key: "roundNumberModulus", label: "Бүтэн тооны модуль"},
  {key: "nightHoursStart", label: "Шөнийн цаг — эхлэл (0-23)"},
  {key: "nightHoursEnd", label: "Шөнийн цаг — төгсгөл (1-24)"},
  {key: "highValueTxnFloor", label: "Өндөр-үнэт гүйлгээний доод хязгаар"},
  {key: "muleDailyInflowMin", label: "Mule өдрийн орлогын доод"},
  {key: "muleOutflowRatio", label: "Mule гарах/орох харьцаа"},
  {key: "smurfingUnitMax", label: "Смурфинг нэгж дээд"},
  {key: "smurfingDailyTotalMin", label: "Смурфинг өдрийн нийт доод"},
];

export default function SettingsPage() {
  const {data, loading} = useQuery<{settings: Settings}>(SETTINGS_FULL_QUERY);
  const [save, saveM] = useMutation(UPDATE_SETTINGS);
  const [clearAll, clearM] = useMutation(CLEAR_ALL_DATA);

  async function onClearAll() {
    if (!window.confirm(
      "Бүх өгөгдлийг устгах уу? Энэ үйлдлийг буцаах боломжгүй!")) return;
    await clearAll();
    window.alert("Бүх өгөгдөл устгагдлаа.");
  }
  const [form, setForm] = useState<Settings | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (data?.settings && !form) setForm(structuredClone(data.settings));
  }, [data, form]);

  if (loading || !form) {
    return (
      <div className="page-container">
        <PageHeader icon="⚙" title="Тохиргоо" subtitle="AML БОДЛОГО" />
        <Loading />
      </div>
    );
  }

  function setAml<K extends keyof Aml>(key: K, value: Aml[K]) {
    setForm((f) => (f ? {...f, aml: {...f.aml, [key]: value}} : f));
  }

  function applyPreset(jurisdiction: "MN" | "US") {
    setForm((f) => {
      if (!f) return f;
      const us = jurisdiction === "US";
      return {
        ...f,
        aml: {
          ...f.aml,
          currencySymbol: us ? "$" : "₮",
          currencyFormat: us ? "N2" : "N0",
          cashReportingThreshold: us ? 10_000 : 20_000_000,
          nearThresholdRangeLow: us ? 8_500 : 17_000_000,
          nearThresholdRangeHigh: us ? 10_000 : 20_000_000,
          roundNumberMinAmount: us ? 500 : 50_000,
          roundNumberModulus: us ? 100 : 10_000,
          highValueTxnFloor: us ? 1_000 : 1_000_000,
          muleDailyInflowMin: us ? 10_000 : 10_000_000,
          smurfingUnitMax: us ? 3_000 : 3_000_000,
          smurfingDailyTotalMin: us ? 9_000 : 9_000_000,
        },
      };
    });
  }

  async function onSave() {
    if (!form) return;
    const {schemaVersion, ...input} = form;
    void schemaVersion;
    await save({variables: {input}});
    setStatus("Хадгалагдлаа.");
    setTimeout(() => setStatus(""), 2500);
  }

  const actions = (
    <>
      <button className="btn" onClick={() => applyPreset("MN")}>
        Монгол (₮)</button>
      <button className="btn" onClick={() => applyPreset("US")}>
        АНУ ($)</button>
      <button className="btn btn-primary" onClick={onSave}
        disabled={saveM.loading}>
        {saveM.loading ? "ХАДГАЛЖ БАЙНА..." : "ХАДГАЛАХ"}
      </button>
    </>
  );

  return (
    <div className="page-container">
      <PageHeader icon="⚙" title="Тохиргоо"
        subtitle="AML / ЗАЛИЛАН ИЛРҮҮЛЭХ БОСГО" actions={actions} />

      {status && (
        <div style={{fontSize: 12, color: "var(--accent-green)", marginBottom: 12}}>
          {status}
        </div>
      )}

      <Card title="ХЭЛ & ХАРАГДАЛТ" style={{marginBottom: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14}}>
          <Field label="Хэл">
            <Select value={form.language} style={{width: "100%"}}
              onChange={(v) => setForm({...form, language: v})}
              options={[
                {value: "mongolian", label: "Монгол"},
                {value: "english", label: "English"},
              ]} />
          </Field>
          <Field label="Загвар">
            <Select value={form.theme} style={{width: "100%"}}
              onChange={(v) => setForm({...form, theme: v})}
              options={[
                {value: "dark", label: "Хар (dark)"},
                {value: "light", label: "Цайвар (light)"},
              ]} />
          </Field>
          <Field label="Аудит хадгалах хугацаа (өдөр)">
            <input type="number" className="form-input"
              value={form.auditRetentionDays}
              onChange={(e) => setForm({...form,
                auditRetentionDays: Number(e.target.value)})} />
          </Field>
          <Field label="Телеметр">
            <Select value={form.telemetryEnabled ? "on" : "off"}
              style={{width: "100%"}}
              onChange={(v) => setForm({...form,
                telemetryEnabled: v === "on"})}
              options={[
                {value: "off", label: "Идэвхгүй"},
                {value: "on", label: "Идэвхтэй"},
              ]} />
          </Field>
        </div>
      </Card>

      <Card title="AML БОСГО" style={{marginBottom: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14}}>
          <Field label="Валютын тэмдэг">
            <input className="form-input" value={form.aml.currencySymbol}
              maxLength={4}
              onChange={(e) => setAml("currencySymbol", e.target.value)} />
          </Field>
          <Field label="Форматын загвар">
            <Select value={form.aml.currencyFormat} style={{width: "100%"}}
              onChange={(v) => setAml("currencyFormat", v)}
              options={[
                {value: "N0", label: "N0"},
                {value: "N2", label: "N2"},
              ]} />
          </Field>
          {AML_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <input type="number" className="form-input"
                value={form.aml[f.key] as number}
                onChange={(e) => setAml(f.key, Number(e.target.value) as never)} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="OSINT — САНКЦЫН ШИНЭЧЛЭЛ">
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14}}>
          <Field label="Авто шинэчлэл">
            <Select value={form.osint.autoRefreshEnabled ? "on" : "off"}
              style={{width: "100%"}}
              onChange={(v) => setForm({...form, osint: {...form.osint,
                autoRefreshEnabled: v === "on"}})}
              options={[
                {value: "off", label: "Идэвхгүй"},
                {value: "on", label: "Идэвхтэй"},
              ]} />
          </Field>
          <Field label="Интервал (цаг)">
            <input type="number" className="form-input"
              value={form.osint.intervalHours}
              onChange={(e) => setForm({...form, osint: {...form.osint,
                intervalHours: Number(e.target.value)}})} />
          </Field>
          <div style={{gridColumn: "1 / span 2"}}>
            <Field label="Эх сурвалжийн URL">
              <input className="form-input" value={form.osint.refreshUrl}
                onChange={(e) => setForm({...form, osint: {...form.osint,
                  refreshUrl: e.target.value}})} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="АЮУЛТАЙ БҮС" style={{marginTop: 16,
        borderLeft: "3px solid var(--risk-high)"}}>
        <div style={{display: "flex", justifyContent: "space-between",
          alignItems: "center"}}>
          <span style={{fontSize: 12, color: "var(--text-secondary)"}}>
            Бүх сэжигтэн, данс, гүйлгээ, дуудлага, кейсийг бүрмөсөн устгана.
          </span>
          <button className="btn btn-danger" onClick={onClearAll}
            disabled={clearM.loading}>
            {clearM.loading ? "УСТГАЖ БАЙНА..." : "БҮХ ӨГӨГДӨЛ УСТГАХ"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

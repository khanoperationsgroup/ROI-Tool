
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList, Cell,
} from "recharts";
import * as htmlToImage from "html-to-image";

const fmtCurrency = (n: number) =>
  isFinite(n) ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n) : "—";
const fmtNumber = (n: number) => (isFinite(n) ? new Intl.NumberFormat("en-CA").format(n) : "—";
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type KPIEffect =
  | "conv_pct" | "aov_pct" | "gm_pp" | "roas_pct" | "churn_pp" | "retention_pct"
  | "hours_saved" | "error_red_pct" | "capacity_pct" | "util_pct" | "overtime_hours"
  | "impl_cost_monthly" | "custom_gp_flat";

type KPI = { id: string; label: string; effect: KPIEffect; value: number; enabled: boolean };
type Baseline = { traffic: number; cr: number; aov: number; gm: number; subs: number; churn: number; adSpend: number; roas: number; hourly: number; wastedHrsWeek: number; errors: number; costPerError: number; };
type Fees = { blueprint: number; odl: number; accelerator: number };
type Preset = { id: string; name: string; category: "industry" | "client"; baseline: Baseline; fees: Fees; kpis: { blueprint: KPI[]; odl: KPI[]; accelerator: KPI[]; } };

const SCENARIOS = [{ key: "Low", mult: 0.5 }, { key: "Base", mult: 1.0 }, { key: "High", mult: 1.5 }] as const;
type ScenarioKey = (typeof SCENARIOS)[number]["key"];

function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initialValue; } catch { return initialValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

function computeBaselines(b: Baseline) {
  const revenue = b.traffic * (b.cr / 100) * b.aov;
  const gp = revenue * (b.gm / 100);
  const orders = b.aov > 0 ? revenue / b.aov : 0;
  return { revenue, gp, orders };
}

const DEFAULT_KPIS = {
  blueprint: [
    { id: "bp-conv", label: "Conversion uplift (%, Base)", effect: "conv_pct", value: 5, enabled: true },
    { id: "bp-aov", label: "AOV/ARPU uplift (%, Base)", effect: "aov_pct", value: 7.5, enabled: true },
    { id: "bp-gm", label: "Gross margin improvement (pp, Base)", effect: "gm_pp", value: 1.0, enabled: true },
    { id: "bp-roas", label: "ROAS uplift (%, Base)", effect: "roas_pct", value: 10, enabled: true },
    { id: "bp-churn", label: "Churn reduction (pp, Base)", effect: "churn_pp", value: 1.0, enabled: true },
    { id: "bp-impl", label: "Implementation costs (monthly $)", effect: "impl_cost_monthly", value: 300, enabled: true },
  ] as KPI[],
  odl: [
    { id: "odl-hrs", label: "Weekly hours saved (Base)", effect: "hours_saved", value: 50, enabled: true },
    { id: "odl-err", label: "Error/defect reduction (%, Base)", effect: "error_red_pct", value: 40, enabled: true },
    { id: "odl-cap", label: "Capacity increase (%, Base)", effect: "capacity_pct", value: 15, enabled: true },
    { id: "odl-util", label: "Utilization of added capacity (%, Base)", effect: "util_pct", value: 60, enabled: true },
    { id: "odl-ot", label: "Overtime hours reduced per month (Base)", effect: "overtime_hours", value: 20, enabled: true },
  ] as KPI[],
  accelerator: [
    { id: "ga-conv", label: "Conversion uplift (%, Base)", effect: "conv_pct", value: 8, enabled: true },
    { id: "ga-aov", label: "AOV/ARPU uplift (%, Base)", effect: "aov_pct", value: 10, enabled: true },
    { id: "ga-ret", label: "Retention / repeat uplift (%, Base)", effect: "retention_pct", value: 5, enabled: true },
    { id: "ga-roas", label: "ROAS uplift (%, Base)", effect: "roas_pct", value: 15, enabled: true },
  ] as KPI[],
};

const DEFAULT_PRESETS: Preset[] = [
  {
    id: "dtc", name: "DTC Ecommerce", category: "industry",
    baseline: { traffic: 20000, cr: 2.5, aov: 80, gm: 55, subs: 0, churn: 6, adSpend: 10000, roas: 3.0, hourly: 45, wastedHrsWeek: 60, errors: 40, costPerError: 25 },
    fees: { blueprint: 6000, odl: 8000, accelerator: 9000 },
    kpis: { blueprint: DEFAULT_KPIS.blueprint, odl: DEFAULT_KPIS.odl, accelerator: DEFAULT_KPIS.accelerator },
  },
  {
    id: "saas", name: "B2B SaaS", category: "industry",
    baseline: { traffic: 6000, cr: 1.6, aov: 250, gm: 80, subs: 500, churn: 4.5, adSpend: 15000, roas: 2.2, hourly: 65, wastedHrsWeek: 45, errors: 25, costPerError: 60 },
    fees: { blueprint: 8500, odl: 12000, accelerator: 14000 },
    kpis: {
      blueprint: [
        { id: "bp-conv", label: "Conversion uplift (%, Base)", effect: "conv_pct", value: 6.5, enabled: true },
        { id: "bp-aov", label: "AOV/ARPU uplift (%, Base)", effect: "aov_pct", value: 5, enabled: true },
        { id: "bp-gm", label: "Gross margin improvement (pp, Base)", effect: "gm_pp", value: 0.5, enabled: true },
        { id: "bp-roas", label: "ROAS uplift (%, Base)", effect: "roas_pct", value: 8, enabled: true },
        { id: "bp-churn", label: "Churn reduction (pp, Base)", effect: "churn_pp", value: 0.8, enabled: true },
        { id: "bp-impl", label: "Implementation costs (monthly $)", effect: "impl_cost_monthly", value: 500, enabled: true },
      ],
      odl: [
        { id: "odl-hrs", label: "Weekly hours saved (Base)", effect: "hours_saved", value: 35, enabled: true },
        { id: "odl-err", label: "Error/defect reduction (%, Base)", effect: "error_red_pct", value: 30, enabled: true },
        { id: "odl-cap", label: "Capacity increase (%, Base)", effect: "capacity_pct", value: 12, enabled: true },
        { id: "odl-util", label: "Utilization of added capacity (%, Base)", effect: "util_pct", value: 55, enabled: true },
        { id: "odl-ot", label: "Overtime hours reduced per month (Base)", effect: "overtime_hours", value: 15, enabled: true },
      ],
      accelerator: [
        { id: "ga-conv", label: "Conversion uplift (%, Base)", effect: "conv_pct", value: 9, enabled: true },
        { id: "ga-aov", label: "AOV/ARPU uplift (%, Base)", effect: "aov_pct", value: 6, enabled: true },
        { id: "ga-ret", label: "Retention / repeat uplift (%, Base)", effect: "retention_pct", value: 7, enabled: true },
        { id: "ga-roas", label: "ROAS uplift (%, Base)", effect: "roas_pct", value: 12, enabled: true },
      ],
    },
  },
  {
    id: "services", name: "Local Services", category: "industry",
    baseline: { traffic: 3000, cr: 4.0, aov: 220, gm: 45, subs: 0, churn: 0, adSpend: 4000, roas: 2.8, hourly: 38, wastedHrsWeek: 40, errors: 30, costPerError: 35 },
    fees: { blueprint: 4500, odl: 6500, accelerator: 7000 },
    kpis: DEFAULT_KPIS,
  },
];

const EFFECTS_SCALING: Record<KPIEffect, boolean> = {
  conv_pct: true, aov_pct: true, gm_pp: true, roas_pct: true, churn_pp: true, retention_pct: true,
  hours_saved: true, error_red_pct: true, capacity_pct: true, util_pct: false,
  overtime_hours: true, impl_cost_monthly: false, custom_gp_flat: true,
};

const SCENARIO_COLOR = { Low: "#38bdf8", Base: "#22c55e", High: "#f59e0b" } as const;
const COLOR_PAYBACK = "#8b5cf6";
const COLOR_ROI = "#ef4444";

export default function Page() {
  const [presets, setPresets] = useLocalStorage<Preset[]>("khan_roi_presets_v2", DEFAULT_PRESETS);
  const [presetId, setPresetId] = useLocalStorage<string>("khan_roi_preset_id_v2", presets[0]?.id ?? "dtc");
  const activePreset = useMemo(() => presets.find((p) => p.id === presetId) ?? presets[0], [presets, presetId]);

  const [service, setService] = useLocalStorage<"blueprint"|"odl"|"accelerator">("khan_roi_service", "blueprint");
  const [scenario, setScenario] = useLocalStorage<ScenarioKey>("khan_roi_scenario", "Base");

  const [baseline, setBaseline] = useLocalStorage<Baseline>("khan_roi_baseline_v2", activePreset.baseline);
  const [fees, setFees] = useLocalStorage<Fees>("khan_roi_fees_v2", activePreset.fees);
  const [kpis, setKpis] = useLocalStorage<{blueprint: KPI[]; odl: KPI[]; accelerator: KPI[];}>(
    "khan_roi_kpis_v2", activePreset.kpis
  );

  useEffect(() => {
    if (!activePreset) return;
    setBaseline((prev) => ({ ...activePreset.baseline, ...prev }));
    setFees((prev) => ({ ...activePreset.fees, ...prev }));
    setKpis((prev) => ({
      blueprint: prev?.blueprint?.length ? prev.blueprint : activePreset.kpis.blueprint,
      odl: prev?.odl?.length ? prev.odl : activePreset.kpis.odl,
      accelerator: prev?.accelerator?.length ? prev.accelerator : activePreset.kpis.accelerator,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId]);

  const base = useMemo(() => computeBaselines(baseline), [baseline]);
  const scen = useMemo(() => SCENARIOS.find((s) => s.key === scenario) ?? SCENARIOS[1], [scenario]);

  const addKPI = () => {
    const newRow: KPI = { id: `kpi-${Date.now()}`, label: "New KPI", effect: "conv_pct", value: 1, enabled: true };
    setKpis({ ...kpis, [service]: [...kpis[service], newRow] });
  };
  const removeKPI = (id: string) => setKpis({ ...kpis, [service]: kpis[service].filter((k) => k.id !== id) });
  const updateKPI = (id: string, patch: Partial<KPI>) => setKpis({ ...kpis, [service]: kpis[service].map((k) => (k.id === id ? { ...k, ...patch } : k)) });

  const aggregateEffects = (list: KPI[]) => {
    let conv=0,aov=0,gmPP=0,roas=0,churnPP=0,ret=0,hrs=0,err=0,cap=0,util=0,ot=0,impl=0,cgp=0;
    for (const k of list) {
      if (!k.enabled) continue;
      const scale = EFFECTS_SCALING[k.effect] ? scen.mult : 1;
      const v = k.value * scale;
      switch(k.effect){
        case "conv_pct": conv+=v; break;
        case "aov_pct": aov+=v; break;
        case "gm_pp": gmPP+=v; break;
        case "roas_pct": roas+=v; break;
        case "churn_pp": churnPP+=v; break;
        case "retention_pct": ret+=v; break;
        case "hours_saved": hrs+=v; break;
        case "error_red_pct": err+=v/100; break;
        case "capacity_pct": cap+=v/100; break;
        case "util_pct": util+=v/100; break;
        case "overtime_hours": ot+=v; break;
        case "impl_cost_monthly": impl+=v; break;
        case "custom_gp_flat": cgp+=v; break;
      }
    }
    return { conv, aov, gmPP, roas, churnPP, ret, hrs, err, cap, util: util>0?clamp(util,0,1):0.6, ot, impl, cgp };
  };

  const calcBlueprint = (b: Baseline, fee:number, list: KPI[]) => {
    const a = aggregateEffects(list);
    const revBase = b.traffic * (b.cr/100) * b.aov;
    const newCR = b.cr * (1 + a.conv/100);
    const newAOV = b.aov * (1 + a.aov/100);
    const newGM = b.gm + a.gmPP;
    const revNew = b.traffic * (newCR/100) * newAOV;
    const gpFromRev = (revNew - revBase) * (newGM/100);
    const gpFromROAS = (b.adSpend*(b.roas*(1 + a.roas/100)) - b.adSpend*b.roas) * (newGM/100);
    const churnGP = b.subs * (a.churnPP/100) * (newAOV*(newGM/100));
    const monthlyGP = gpFromRev + gpFromROAS + churnGP + a.cgp - a.impl;
    const annualGP = monthlyGP*12;
    const payback = monthlyGP>0 ? fee/monthlyGP : Infinity;
    const roi = fee>0 ? (annualGP - fee)/fee : NaN;
    return { monthlyGP, annualGP, payback, roi };
  };

  const calcODL = (b: Baseline, fee:number, list: KPI[]) => {
    const a = aggregateEffects(list);
    const { orders } = computeBaselines(b);
    const hrsSavings = a.hrs * b.hourly * 4.33;
    const errSavings = b.errors * a.err * b.costPerError;
    const gpPerOrder = b.aov * (b.gm/100);
    const addedOrders = orders * a.cap * a.util;
    const capGP = addedOrders * gpPerOrder;
    const otSavings = a.ot * b.hourly;
    const monthlyGP = hrsSavings + errSavings + capGP + otSavings + a.cgp - a.impl;
    const annualGP = monthlyGP*12;
    const payback = monthlyGP>0 ? fee/monthlyGP : Infinity;
    const roi = fee>0 ? (annualGP - fee)/fee : NaN;
    return { monthlyGP, annualGP, payback, roi };
  };

  const calcAccelerator = (b: Baseline, fee:number, list: KPI[]) => {
    const a = aggregateEffects(list);
    const revBase = b.traffic * (b.cr/100) * b.aov;
    const newCR = b.cr * (1 + a.conv/100);
    const newAOV = b.aov * (1 + a.aov/100);
    const revNew = b.traffic * (newCR/100) * newAOV;
    const gpFromRev = (revNew - revBase) * (b.gm/100);
    const gpFromRet = revBase * (a.ret/100) * (b.gm/100);
    const gpFromROAS = (b.adSpend*(b.roas*(1 + a.roas/100)) - b.adSpend*b.roas) * (b.gm/100);
    const monthlyGP = gpFromRev + gpFromRet + gpFromROAS + a.cgp - a.impl;
    const annualGP = monthlyGP*12;
    const payback = monthlyGP>0 ? fee/monthlyGP : Infinity;
    const roi = fee>0 ? (annualGP - fee)/fee : NaN;
    return { monthlyGP, annualGP, payback, roi };
  };

  const calcCurrent = () => {
    if (service === "blueprint") return calcBlueprint(baseline, fees.blueprint, kpis.blueprint);
    if (service === "odl") return calcODL(baseline, fees.odl, kpis.odl);
    return calcAccelerator(baseline, fees.accelerator, kpis.accelerator);
  };
  const result = useMemo(calcCurrent, [baseline, fees, kpis, service, scen.mult]);

  const scenarioData = useMemo(() => {
    return SCENARIOS.map((s) => {
      const scaled = (list: KPI[]) => list.map((k) => ({ ...k, value: EFFECTS_SCALING[k.effect] ? k.value * s.mult : k.value }));
      const res = service === "blueprint" ? calcBlueprint(baseline, fees.blueprint, scaled(kpis.blueprint))
        : service === "odl" ? calcODL(baseline, fees.odl, scaled(kpis.odl))
        : calcAccelerator(baseline, fees.accelerator, scaled(kpis.accelerator));
      return { scenario: s.key, monthlyGP: Math.max(0, res.monthlyGP), payback: isFinite(res.payback) ? Number(res.payback.toFixed(2)) : null, roiPct: isFinite(res.roi) ? res.roi * 100 : null, color: (SCENARIO_COLOR as any)[s.key] };
    });
  }, [baseline, fees, kpis, service]);

  const exportRef = useRef<HTMLDivElement>(null);
  const exportPNG = async () => {
    if (!exportRef.current) return;
    const url = await htmlToImage.toPng(exportRef.current, { pixelRatio: 2, backgroundColor: "white" });
    const a = document.createElement("a"); a.href = url; a.download = `Khan-ROI-${service}-${scenario}.png`; a.click();
  };

  const industries = presets.filter((p) => p.category === "industry");
  const clients = presets.filter((p) => p.category === "client");

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-25 via-slate-50 to-slate-100 text-slate-900">
      <div className="bg-gradient-to-r from-indigo-600 via-fuchsia-500 to-rose-500 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
          <div>
            <h1 className="text-xl font-bold md:text-2xl">Khan Operations — ROI Calculator</h1>
            <p className="text-sm opacity-90">Flexible KPIs • Industry/Client presets • Export-ready charts</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportPNG} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-indigo-700 shadow hover:opacity-95">Export PNG</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Preset" subtitle="Pick an Industry or Client preset">
            <select value={presetId} onChange={(e)=>setPresetId(e.target.value)} className="w-full rounded-xl border px-3 py-2">
              {industries.length>0 && <optgroup label="Industry Presets">{industries.map(p=>(<option key={p.id} value={p.id}>{p.name}</option>))}</optgroup>}
              {clients.length>0 && <optgroup label="Client Presets">{clients.map(p=>(<option key={p.id} value={p.id}>{p.name}</option>))}</optgroup>}
            </select>
          </Card>

          <Card title="Service" subtitle="Choose calculator & case">
            <div className="flex flex-wrap gap-2">
              <Toggle active={service==='blueprint'} onClick={()=>setService('blueprint')} label="Growth Blueprint" color="bg-indigo-600"/>
              <Toggle active={service==='odl'} onClick={()=>setService('odl')} label="Operations Dev Lab" color="bg-fuchsia-600"/>
              <Toggle active={service==='accelerator'} onClick={()=>setService('accelerator')} label="Growth Accelerator" color="bg-rose-600"/>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">Scenario</div>
              <div className="flex gap-2">
                {SCENARIOS.map(sc=>(
                  <button key={sc.key} onClick={()=>setScenario(sc.key)} className={`rounded-xl px-3 py-1 text-sm shadow ${scenario===sc.key?'bg-slate-900 text-white':'bg-white'}`}>
                    {sc.key}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Service Fee" subtitle="One-time fee for selected service">
            {service==='blueprint' && <FieldNumber label="Growth Blueprint Fee" value={fees.blueprint} onChange={(v)=>setFees({...fees, blueprint:v})}/>}
            {service==='odl' && <FieldNumber label="Operations Development Lab Fee" value={fees.odl} onChange={(v)=>setFees({...fees, odl:v})}/>}
            {service==='accelerator' && <FieldNumber label="Growth Accelerator Fee" value={fees.accelerator} onChange={(v)=>setFees({...fees, accelerator:v})}/>}
          </Card>
        </div>

        <Card className="mt-6" title="Baseline Business Metrics" subtitle="Monthly where applicable">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FieldNumber label="Monthly traffic/leads (T)" value={baseline.traffic} onChange={(v)=>setBaseline({...baseline, traffic:v})}/>
            <FieldNumber label="Current conversion rate (CR, %)" step={0.1} value={baseline.cr} onChange={(v)=>setBaseline({...baseline, cr:v})}/>
            <FieldNumber label="Average order value / ARPU (A, $)" value={baseline.aov} onChange={(v)=>setBaseline({...baseline, aov:v})}/>
            <FieldNumber label="Gross margin (GM, %)" step={0.1} value={baseline.gm} onChange={(v)=>setBaseline({...baseline, gm:v})}/>
            <FieldNumber label="Monthly subscribers (if applicable)" value={baseline.subs} onChange={(v)=>setBaseline({...baseline, subs:v})}/>
            <FieldNumber label="Monthly churn rate (%, if applicable)" step={0.1} value={baseline.churn} onChange={(v)=>setBaseline({...baseline, churn:v})}/>
            <FieldNumber label="Baseline monthly ad spend ($)" value={baseline.adSpend} onChange={(v)=>setBaseline({...baseline, adSpend:v})}/>
            <FieldNumber label="Baseline ROAS (e.g., 3.0)" step={0.1} value={baseline.roas} onChange={(v)=>setBaseline({...baseline, roas:v})}/>
            <FieldNumber label="Avg loaded hourly rate ($/hr)" value={baseline.hourly} onChange={(v)=>setBaseline({...baseline, hourly:v})}/>
            <FieldNumber label="Process hours wasted per week (context)" value={baseline.wastedHrsWeek} onChange={(v)=>setBaseline({...baseline, wastedHrsWeek:v})}/>
            <FieldNumber label="Monthly error/defect count" value={baseline.errors} onChange={(v)=>setBaseline({...baseline, errors:v})}/>
            <FieldNumber label="Cost per error/defect ($)" value={baseline.costPerError} onChange={(v)=>setBaseline({...baseline, costPerError:v})}/>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            Baseline (auto): Revenue {fmtCurrency(base.revenue)} • Gross Profit {fmtCurrency(base.gp)} • Orders {fmtNumber(base.orders)}
          </div>
        </Card>

        <Card className="mt-6" title="Assumptions — KPI Library" subtitle="Add/remove KPIs, set values, and map their effect on the math">
          <div className="hidden grid-cols-12 gap-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div className="col-span-4">KPI</div>
            <div className="col-span-3">Effect Mapping</div>
            <div className="col-span-2">Base Value</div>
            <div className="col-span-2">Enabled</div>
            <div className="col-span-1 text-right">—</div>
          </div>

          {kpis[service].map((row)=>(
            <div key={row.id} className="mb-2 grid grid-cols-1 gap-2 rounded-xl bg-white p-3 shadow-sm md:grid-cols-12">
              <input className="col-span-4 rounded-lg border px-3 py-2" value={row.label} onChange={(e)=>updateKPI(row.id,{label:e.target.value})}/>
              <select className="col-span-3 rounded-lg border px-3 py-2" value={row.effect} onChange={(e)=>updateKPI(row.id,{effect:e.target.value as KPIEffect})}>
                <optgroup label="Revenue Drivers">
                  <option value="conv_pct">Conversion uplift %</option>
                  <option value="aov_pct">AOV/ARPU uplift %</option>
                  <option value="retention_pct">Retention / repeat uplift %</option>
                  <option value="roas_pct">ROAS uplift %</option>
                  <option value="gm_pp">Gross margin (pp)</option>
                  <option value="churn_pp">Churn reduction (pp)</option>
                </optgroup>
                <optgroup label="Ops Drivers (ODL)">
                  <option value="hours_saved">Weekly hours saved</option>
                  <option value="error_red_pct">Error reduction %</option>
                  <option value="capacity_pct">Capacity increase %</option>
                  <option value="util_pct">Utilization of added capacity %</option>
                  <option value="overtime_hours">Overtime hours reduced (mo)</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="impl_cost_monthly">Implementation cost ($/mo)</option>
                  <option value="custom_gp_flat">Custom GP add ($/mo)</option>
                </optgroup>
              </select>
              <input className="col-span-2 rounded-lg border px-3 py-2" value={String(row.value)} onChange={(e)=>{ const v=Number((e.target.value||'').replace(/,/g,'')); if(!Number.isNaN(v)) updateKPI(row.id,{value:v}); }}/>
              <div className="col-span-2 flex items-center gap-2">
                <input id={`en-${row.id}`} type="checkbox" className="h-5 w-5 accent-indigo-600" checked={row.enabled} onChange={(e)=>updateKPI(row.id,{enabled:e.target.checked})}/>
                <label htmlFor={`en-${row.id}`} className="text-sm">Enabled</label>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <button onClick={()=>removeKPI(row.id)} className="rounded-lg bg-rose-50 px-2 py-1 text-sm text-rose-700 hover:bg-rose-100">Remove</button>
              </div>
            </div>
          ))}

          <div className="mt-3">
            <button onClick={addKPI} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow hover:opacity-90">+ Add KPI</button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Tip: To replace a metric (e.g., “Conversion uplift”) with another, add a new KPI and map it to the same <em>Effect</em>.
            The label is for you; the Effect drives the math.
          </p>
        </Card>

        <Card className="mt-6" title={`Results — ${serviceTitle(service)} (${scenario} Scenario)`} refEl={exportRef} subtitle="This quantifies the $-value of working with Khan Operations under your current assumptions.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Kpi label="Monthly GP Lift" value={fmtCurrency(result.monthlyGP)} />
            <Kpi label="Annual GP Lift" value={fmtCurrency(result.annualGP)} />
            <Kpi label="Payback (months)" value={isFinite(result.payback)?result.payback.toFixed(2):"—"} />
            <Kpi label="Annualized ROI" value={isFinite(result.roi)?`${(result.roi*100).toFixed(1)}%`:"—"} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="h-72 w-full rounded-xl border bg-white p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="scenario" />
                  <YAxis tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:number)=>fmtCurrency(v)} />
                  <Legend />
                  <Bar dataKey="monthlyGP" name="Monthly GP Lift" isAnimationActive>
                    {scenarioData.map((e, i)=>(<Cell key={i} fill={e.color}/>))}
                    <LabelList dataKey="monthlyGP" position="top" formatter={(v:number)=>fmtCurrency(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-72 w-full rounded-xl border bg-white p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="scenario" />
                  <YAxis yAxisId="left" orientation="left" tickFormatter={(v)=>`${v}`} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v)=>`${v}%`} />
                  <Tooltip formatter={(v: number, name: string)=> name.includes('ROI') ? `${v.toFixed(1)}%` : v } />
                  <Legend />
                  <Bar yAxisId="left" dataKey="payback" name="Payback (months)" fill={COLOR_PAYBACK} isAnimationActive>
                    <LabelList dataKey="payback" position="top" formatter={(v:number|null)=> v!=null ? v.toFixed(2) : '—'} />
                  </Bar>
                  <Bar yAxisId="right" dataKey="roiPct" name="ROI %" fill={COLOR_ROI} isAnimationActive>
                    <LabelList dataKey="roiPct" position="top" formatter={(v:number|null)=> v!=null ? `${v.toFixed(1)}%` : '—'} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <strong>Note:</strong> Planning scenarios, not guarantees. Keep Base conservative; show Low for floor and High for upside.
          </div>
        </Card>

        <div className="py-8 text-center text-xs text-slate-500">© {new Date().getFullYear()} Khan Operations Group — ROI Calculator</div>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children, className="", refEl }:{ title:string; subtitle?:string; children:React.ReactNode; className?:string; refEl?:React.RefObject<HTMLDivElement>; }){
  return (
    <section ref={refEl} className={`rounded-2xl border border-slate-200 bg-white p-4 shadow ${className}`}>
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, active, onClick, color="bg-slate-900" }:{ label:string; active:boolean; onClick:()=>void; color?:string; }){
  return (
    <button onClick={onClick} className={`rounded-xl px-3 py-2 text-sm font-medium shadow ${active?`${color} text-white`:'bg-white'}`}>
      {label}
    </button>
  );
}

function FieldNumber({ label, value, onChange, step=1 }:{ label:string; value:number; onChange:(v:number)=>void; step?:number; }){
  const [text, setText] = useState(String(value ?? ""));
  useEffect(()=>setText(String(value ?? "")),[value]);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input inputMode="decimal" className="w-full rounded-xl border px-3 py-2" value={text}
        onChange={(e)=>{ setText(e.target.value); const v=Number((e.target.value||'').replace(/,/g,'')); if(!Number.isNaN(v)) onChange(v);}}
        step={step}/>
    </div>
  );
}

function Kpi({ label, value, color="bg-slate-50 text-slate-700" }:{ label:string; value:string; color?:string; }){
  return (
    <div className={`rounded-2xl ${color} px-3 py-2 text-center shadow-sm`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function serviceTitle(key:"blueprint"|"odl"|"accelerator"){
  if (key==='blueprint') return 'Growth Blueprint';
  if (key==='odl') return 'Operations Development Lab';
  return 'Growth Accelerator';
}

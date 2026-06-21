import { useState, useCallback, useEffect } from 'react';
import {
  TrendingUp, BarChart2, PieChart as PieChartIcon, DollarSign, Building2,
  MapPin, Zap, FileText, ShoppingCart, Loader2, AlertCircle, RefreshCw,
  ArrowUpRight, ArrowDownRight, Target, Award, Activity, Globe,
} from 'lucide-react';
import { useApiKey } from '../context/ApiKeyContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CAAnalytics {
  totalProcesos: number;
  totalMonto: number;
  totalOfertas: number;
  promedioOfertas: number;
  promedioMonto: number;
  byEstado: { estado: string; count: number; monto: number }[];
  byRegion: { region: string; count: number; monto: number }[];
  topOrganismos: { organismo: string; count: number; monto: number }[];
  tendenciaMensual: { mes: string; count: number; monto: number }[];
}

interface LicAnalytics {
  total: number;
  listado: Array<{
    codigo: string;
    nombre: string;
    estado: string;
    tipo: string;
    tipoDescripcion: string;
    monto: number;
    organismo: string;
    region: string;
    fechaPublicacion: string;
    adjudicacionNumeroOferentes: number;
  }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const LIC_TYPE_COLORS: Record<string, string> = {
  'L1': '#6366f1', 'LE': '#8b5cf6', 'LP': '#a78bfa', 'LQ': '#c4b5fd', 'LR': '#ddd6fe',
};

const fmtCLP = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const fmtClpFull = (n: number) => `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
const fmtDate = (s: string) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// ── Custom tooltip ────────────────────────────────────────────────────────────

const MoneyTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-muted-foreground">
            {p.value > 1000 ? fmtClpFull(p.value) : p.value.toLocaleString('es-CL')}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string; sub?: string; icon: React.FC<{ className?: string }>;
  color: string; trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          trend === 'up'
            ? <ArrowUpRight className="h-4 w-4 text-emerald-500" />
            : <ArrowDownRight className="h-4 w-4 text-red-500" />
        )}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnalisisMercado() {
  const { apiKey } = useApiKey();
  const [caData, setCaData] = useState<CAAnalytics | null>(null);
  const [licData, setLicData] = useState<LicAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'compra-agil' | 'licitaciones' | 'regiones'>('overview');

  const fetchAll = useCallback(async () => {
    if (!apiKey) { setError('Configura tu API key primero.'); return; }
    setLoading(true);
    setError('');

    try {
      const [caRes, licRes] = await Promise.allSettled([
        fetch('/api/compra-agil-analytics', { headers: { 'X-MP-Ticket': apiKey } }),
        fetch(`/api/licitaciones?estado=publicada&fechaInicio=${getTodayDate()}&fechaFin=${getTodayDate()}&tamano_pagina=50`, {
          headers: { 'X-MP-Ticket': apiKey },
        }),
      ]);

      if (caRes.status === 'fulfilled' && caRes.value.ok) {
        const d = await caRes.value.json();
        setCaData(d);
      }

      if (licRes.status === 'fulfilled') {
        const licResp = licRes.value;
        if (licResp.ok) {
          const d = await licResp.json();
          // Handle job-based response
          if (d.status === 'pending' && d.jobId) {
            // Poll once after 3 seconds
            setTimeout(async () => {
              try {
                const jobRes = await fetch(`/api/jobs/${d.jobId}`, { headers: { 'X-MP-Ticket': apiKey } });
                const jobData = await jobRes.json();
                if (jobData.data) setLicData(jobData.data);
                else if (jobData.partial) setLicData(jobData.partial);
              } catch { /* ignore */ }
            }, 3000);
          } else {
            setLicData(d);
          }
        }
      }

      setLastUpdated(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cargando datos de análisis');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const getTodayDate = () => new Date().toISOString().slice(0, 10);

  // Derived analytics from licitaciones
  const licByTipo = licData ? Object.entries(
    licData.listado.reduce((acc: Record<string, number>, l) => {
      acc[l.tipoDescripcion || 'Sin tipo'] = (acc[l.tipoDescripcion || 'Sin tipo'] || 0) + 1;
      return acc;
    }, {})
  ).map(([tipo, count]) => ({ tipo, count })).sort((a, b) => b.count - a.count) : [];

  const licByRegion = licData ? Object.entries(
    licData.listado.reduce((acc: Record<string, { count: number; monto: number }>, l) => {
      const r = l.region || 'Sin región';
      acc[r] = acc[r] || { count: 0, monto: 0 };
      acc[r].count++;
      acc[r].monto += l.monto || 0;
      return acc;
    }, {})
  ).map(([region, v]) => ({ region, ...v })).sort((a, b) => b.monto - a.monto).slice(0, 10) : [];

  const licByEstado = licData ? Object.entries(
    licData.listado.reduce((acc: Record<string, number>, l) => {
      acc[l.estado] = (acc[l.estado] || 0) + 1;
      return acc;
    }, {})
  ).map(([estado, count]) => ({ estado, count })) : [];

  const totalLicMonto = licData?.listado.reduce((s, l) => s + (l.monto || 0), 0) ?? 0;
  const topLicOrg = licData ? Object.entries(
    licData.listado.reduce((acc: Record<string, { count: number; monto: number }>, l) => {
      const o = l.organismo || 'Sin organismo';
      acc[o] = acc[o] || { count: 0, monto: 0 };
      acc[o].count++;
      acc[o].monto += l.monto || 0;
      return acc;
    }, {})
  ).map(([organismo, v]) => ({ organismo, ...v })).sort((a, b) => b.monto - a.monto).slice(0, 10) : [];

  const TABS = [
    { id: 'overview', label: 'Visión General', icon: Activity },
    { id: 'compra-agil', label: 'Compra Ágil', icon: Zap },
    { id: 'licitaciones', label: 'Licitaciones', icon: FileText },
    { id: 'regiones', label: 'Por Región', icon: Globe },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-indigo-600/10 via-card to-purple-600/10 px-6 py-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Inteligencia de Mercado</span>
            </div>
            <h1 className="text-2xl font-bold">Panel de Análisis de Mercado</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análisis cruzado de Compras Ágiles, Licitaciones y tendencias del mercado público chileno.
            </p>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Actualizado: {lastUpdated.toLocaleTimeString('es-CL')}
              </p>
            )}
          </div>
          <button
            id="market-refresh-btn"
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-60 self-start"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Actualizando…' : 'Actualizar datos'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error cargando análisis</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !caData && !licData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      )}

      {/* Tabs */}
      {(caData || licData) && (
        <>
          <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`market-tab-${id}`}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {caData && (
                  <>
                    <StatCard
                      label="Compras Ágiles (30d)"
                      value={caData.totalProcesos.toLocaleString('es-CL')}
                      sub={`Prom. ${caData.promedioOfertas.toFixed(1)} ofertas/proceso`}
                      icon={Zap}
                      color="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400"
                      trend="up"
                    />
                    <StatCard
                      label="Monto CA (30d)"
                      value={fmtCLP(caData.totalMonto)}
                      sub={`Prom. ${fmtCLP(caData.promedioMonto)} por proceso`}
                      icon={DollarSign}
                      color="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
                    />
                    <StatCard
                      label="Cotizaciones CA"
                      value={caData.totalOfertas.toLocaleString('es-CL')}
                      sub="Total ofertas recibidas"
                      icon={Target}
                      color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                    />
                  </>
                )}
                {licData && (
                  <StatCard
                    label="Licitaciones hoy"
                    value={licData.total.toLocaleString('es-CL')}
                    sub={`Monto: ${fmtCLP(totalLicMonto)}`}
                    icon={FileText}
                    color="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
                  />
                )}
              </div>

              {/* Trend + Estado overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {caData && caData.tendenciaMensual.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-indigo-500" />Tendencia mensual — Compra Ágil</h3>
                    <p className="text-xs text-muted-foreground mb-3">Últimos 30 días por mes de publicación</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={caData.tendenciaMensual}>
                        <defs>
                          <linearGradient id="gradCA" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<MoneyTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#gradCA)" name="Procesos" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {caData && caData.byEstado.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-violet-500" />Distribución por Estado</h3>
                    <p className="text-xs text-muted-foreground mb-3">Compras Ágiles de los últimos 30 días</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={caData.byEstado}
                          dataKey="count"
                          nameKey="estado"
                          cx="50%"
                          cy="50%"
                          outerRadius={75}
                          label={({ estado, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                        >
                          {caData.byEstado.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number, name: string) => [v, name]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Top organisms cross-view */}
              {caData && caData.topOrganismos.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" />Top Compradores — Compra Ágil (últimos 30 días)</h3>
                  <p className="text-xs text-muted-foreground mb-4">Organismos con mayor volumen de compra</p>
                  <div className="space-y-3">
                    {caData.topOrganismos.slice(0, 6).map((org, i) => {
                      const maxMonto = caData.topOrganismos[0]?.monto || 1;
                      const pct = (org.monto / maxMonto) * 100;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm truncate">{org.organismo}</p>
                              <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                                <span className="text-xs text-muted-foreground">{org.count} procesos</span>
                                <span className="text-sm font-bold text-green-600 dark:text-green-400">{fmtCLP(org.monto)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── COMPRA ÁGIL TAB ── */}
          {activeTab === 'compra-agil' && caData && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Total procesos" value={caData.totalProcesos.toLocaleString('es-CL')} icon={Zap} color="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400" />
                <StatCard label="Monto total" value={fmtCLP(caData.totalMonto)} sub={fmtClpFull(caData.totalMonto)} icon={DollarSign} color="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" />
                <StatCard label="Prom. ofertas/proceso" value={caData.promedioOfertas.toFixed(2)} sub={`${caData.totalOfertas} cotizaciones totales`} icon={Target} color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* By estado chart */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Procesos por Estado</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={caData.byEstado} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="estado" tick={{ fontSize: 10 }} width={130} />
                      <Tooltip formatter={(v: number) => [v, 'Procesos']} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {caData.byEstado.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Monto by estado */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Monto por Estado (CLP)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={caData.byEstado} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => fmtCLP(v)} tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="estado" tick={{ fontSize: 10 }} width={130} />
                      <Tooltip formatter={(v: number) => [fmtClpFull(v), 'Monto']} />
                      <Bar dataKey="monto" radius={[0, 4, 4, 0]} fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top organismos table */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-500" />Top 10 Organismos por Monto</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-3 text-xs text-muted-foreground font-medium">#</th>
                        <th className="text-left py-2 pr-3 text-xs text-muted-foreground font-medium">Organismo</th>
                        <th className="text-right py-2 pr-3 text-xs text-muted-foreground font-medium">Procesos</th>
                        <th className="text-right py-2 text-xs text-muted-foreground font-medium">Monto Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caData.topOrganismos.map((org, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 pr-3 truncate max-w-xs">{org.organismo}</td>
                          <td className="py-2 pr-3 text-right">{org.count}</td>
                          <td className="py-2 text-right font-medium text-green-600 dark:text-green-400">{fmtClpFull(org.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── LICITACIONES TAB ── */}
          {activeTab === 'licitaciones' && licData && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Licitaciones hoy" value={licData.total.toLocaleString('es-CL')} icon={FileText} color="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400" />
                <StatCard label="Monto total estimado" value={fmtCLP(totalLicMonto)} sub={fmtClpFull(totalLicMonto)} icon={DollarSign} color="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" />
                <StatCard label="Organismos compradores" value={topLicOrg.length.toLocaleString('es-CL')} sub="Distintos organismos con licitaciones hoy" icon={Building2} color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* By tipo */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Distribución por Tipo</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={licByTipo} dataKey="count" nameKey="tipo" cx="50%" cy="50%" outerRadius={80} label={({ tipo, percent }) => `${tipo?.split(' ').slice(-2).join(' ')} ${(percent * 100).toFixed(0)}%`}>
                        {licByTipo.map((e, i) => <Cell key={i} fill={LIC_TYPE_COLORS[licData?.listado[i]?.tipo || ''] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* By estado */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Distribución por Estado</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={licByEstado}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="estado" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {licByEstado.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top licitaciones por monto */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" />Top Licitaciones por Monto</h3>
                <div className="space-y-2">
                  {licData.listado
                    .filter(l => l.monto > 0)
                    .sort((a, b) => b.monto - a.monto)
                    .slice(0, 8)
                    .map((l, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 hover:bg-muted/40 transition-colors">
                        <span className="text-xs font-mono text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{l.nombre}</p>
                          <p className="text-xs text-muted-foreground">{l.organismo} · {l.tipoDescripcion} · {l.region}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmtClpFull(l.monto)}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(l.fechaPublicacion)}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ── REGIONES TAB ── */}
          {activeTab === 'regiones' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CA por región */}
                {caData && caData.byRegion.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Zap className="h-4 w-4 text-violet-500" />Compra Ágil por Región — Monto</h3>
                    <p className="text-xs text-muted-foreground mb-3">Últimos 30 días</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={caData.byRegion.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={v => fmtCLP(v)} tick={{ fontSize: 9 }} />
                        <YAxis type="category" dataKey="region" tick={{ fontSize: 9 }} width={90} />
                        <Tooltip formatter={(v: number) => [fmtClpFull(v), 'Monto']} />
                        <Bar dataKey="monto" radius={[0, 4, 4, 0]}>
                          {caData.byRegion.slice(0, 10).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Licitaciones por región */}
                {licByRegion.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileText className="h-4 w-4 text-orange-500" />Licitaciones por Región — Monto</h3>
                    <p className="text-xs text-muted-foreground mb-3">Hoy</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={licByRegion} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={v => fmtCLP(v)} tick={{ fontSize: 9 }} />
                        <YAxis type="category" dataKey="region" tick={{ fontSize: 9 }} width={90} />
                        <Tooltip formatter={(v: number) => [fmtClpFull(v), 'Monto']} />
                        <Bar dataKey="monto" radius={[0, 4, 4, 0]} fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Region comparison table */}
              {caData && caData.byRegion.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-blue-500" />Comparativo por Región — Compra Ágil</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Región</th>
                          <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Procesos</th>
                          <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Monto Total</th>
                          <th className="text-right py-2 text-xs text-muted-foreground font-medium">Prom. por proceso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caData.byRegion.map((r, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                {r.region}
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 text-right">{r.count}</td>
                            <td className="py-2.5 pr-4 text-right font-medium text-green-600 dark:text-green-400">{fmtClpFull(r.monto)}</td>
                            <td className="py-2.5 text-right text-muted-foreground">{fmtCLP(r.count > 0 ? r.monto / r.count : 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && !caData && !licData && !error && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart2 className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Sin datos de análisis</p>
          <p className="text-sm">Configura tu API key y haz clic en "Actualizar datos".</p>
        </div>
      )}
    </div>
  );
}

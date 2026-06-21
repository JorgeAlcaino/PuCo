import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Search, Filter, Download, ExternalLink, Loader2, AlertCircle, ChevronDown, ChevronUp,
  Building2, MapPin, DollarSign, Calendar, Users, Clock, Tag, CheckCircle2, X,
  ChevronLeft, ChevronRight, Zap, Package, TrendingUp, RefreshCw, Hospital,
} from 'lucide-react';
import { useApiKey } from '../context/ApiKeyContext';
import { matchesEstablecimiento } from '../data/establecimientos';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompraAgil {
  codigo: string;
  nombre: string;
  estadoCodigo: string;
  estadoGlosa: string;
  llamado: number;
  descripcionLlamado: string;
  fechaPublicacion: string;
  fechaCierre: string;
  fechaUltimoCambio: string;
  moneda: string;
  monto: number;
  organismo: string;
  rutOrganismo: string;
  unidadCompra: string;
  region: string;
  regionCode: number | null;
  totalOfertas: number;
  motivoCancelacion: string;
  motivoDesierta: string;
  motivoSeleccion: string;
  urlDetalle: string;
}

interface CompraAgilDetail extends CompraAgil {
  descripcion: string;
  presupuestoEstimado: number;
  tipoPresupuesto: string;
  direccionEntrega: string;
  plazoEntregaDias: number | null;
  idOrdenCompra: number | null;
  idOC: number | null;
  codigoOrdenCompra: string | null;
  estadoOrdenCompra: string | null;
  tieneOC: boolean;
  fechaCierrePrimerLlamado: string;
  fechaCierreSegundoLlamado: string;
  consideraMedioAmbiental: boolean;
  consideraImpactoSocial: boolean;
  proveedoresCotizando: Proveedor[];
  productosSolicitados: Producto[];
}

interface Proveedor {
  rut: string;
  razonSocial: string;
  esEmt: boolean;
  valorNeto: number;
  montoTotal: number;
  montoDespacho: number;
  totalImpuesto: number;
  estadoCotizacion: string;
  seleccionado: boolean;
  activo: boolean;
  descripcionCotizacion: string;
}

interface Producto {
  codigoProducto: string | number;
  nombre: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
}

interface SearchResult {
  total: number;
  totalPaginas: number;
  numeroPagina: number;
  tamanoPagina: number;
  listado: CompraAgil[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ESTADOS_CA = [
  { value: '', label: 'Todos los estados' },
  { value: 'publicada', label: 'Publicada' },
  { value: 'cerrada', label: 'Cerrada' },
  { value: 'desierta', label: 'Desierta' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'proveedor_seleccionado', label: 'Proveedor Seleccionado' },
];

const REGIONES_CA = [
  { value: '', label: 'Todas las regiones' },
  { value: '15', label: 'Arica y Parinacota' },
  { value: '1', label: 'Tarapacá' },
  { value: '2', label: 'Antofagasta' },
  { value: '3', label: 'Atacama' },
  { value: '4', label: 'Coquimbo' },
  { value: '5', label: 'Valparaíso' },
  { value: '13', label: 'Metropolitana' },
  { value: '6', label: "O'Higgins" },
  { value: '7', label: 'Maule' },
  { value: '16', label: 'Ñuble' },
  { value: '8', label: 'Biobío' },
  { value: '9', label: 'La Araucanía' },
  { value: '14', label: 'Los Ríos' },
  { value: '10', label: 'Los Lagos' },
  { value: '11', label: 'Aysén' },
  { value: '12', label: 'Magallanes' },
];

const ESTADO_COLORS: Record<string, string> = {
  'Publicada': '#3b82f6',
  'Cerrada': '#6b7280',
  'Desierta': '#ef4444',
  'Cancelada': '#dc2626',
  'Proveedor Seleccionado': '#10b981',
  'OC Emitida': '#8b5cf6',
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCLP = (n: number) =>
  n > 0 ? `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}` : '—';

const fmtDate = (s: string) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const badgeClass = (estado: string) => {
  const map: Record<string, string> = {
    'Publicada': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'Cerrada': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    'Desierta': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    'Cancelada': 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200',
    'Proveedor Seleccionado': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    'OC Emitida': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  };
  return map[estado] || 'bg-muted text-muted-foreground';
};

const exportCSV = (data: CompraAgil[]) => {
  const headers = ['Código', 'Nombre', 'Estado', 'Llamado', 'Organismo', 'Región', 'Monto CLP', 'Publicación', 'Cierre', 'Total Ofertas'];
  const rows = data.map(r => [
    r.codigo, `"${r.nombre.replace(/"/g, '""')}"`, r.estadoGlosa, r.descripcionLlamado,
    `"${r.organismo.replace(/"/g, '""')}"`, r.region, r.monto, r.fechaPublicacion, r.fechaCierre, r.totalOfertas,
  ]);
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compra-agil-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CompraAgil() {
  const { apiKey } = useApiKey();

  // Search state
  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState('publicada');
  const [region, setRegion] = useState('');
  const [publicadoDesde, setPublicadoDesde] = useState('');
  const [publicadoHasta, setPublicadoHasta] = useState('');
  const [page, setPage] = useState(1);
  const [soloEstablecimientos, setSoloEstablecimientos] = useState(false);

  // Results state
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Detail state
  const [selectedCodigo, setSelectedCodigo] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompraAgilDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Analytics mini state
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<{
    byEstado: { estado: string; count: number; monto: number }[];
    byRegion: { region: string; count: number; monto: number }[];
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (pageNum = 1) => {
    if (!apiKey) {
      setError('Configura tu API key primero.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setPage(pageNum);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (estado) params.set('estado', estado);
      if (region) params.set('region', region);
      if (publicadoDesde) params.set('publicado_desde', publicadoDesde);
      if (publicadoHasta) params.set('publicado_hasta', publicadoHasta);
      params.set('numero_pagina', String(pageNum));
      params.set('tamano_pagina', '50');
      params.set('ordenar_por', 'FechaPublicacion');

      const res = await fetch(`/api/compra-agil?${params}`, {
        headers: { 'X-MP-Ticket': apiKey },
        signal: abortRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setResult(data);

      // Build mini analytics from current results
      if (data.listado?.length > 0) {
        const byEstadoMap: Record<string, { count: number; monto: number }> = {};
        const byRegionMap: Record<string, { count: number; monto: number }> = {};
        for (const item of data.listado as CompraAgil[]) {
          const e = item.estadoGlosa;
          byEstadoMap[e] = byEstadoMap[e] || { count: 0, monto: 0 };
          byEstadoMap[e].count++;
          byEstadoMap[e].monto += item.monto;
          const r = item.region || 'Sin región';
          byRegionMap[r] = byRegionMap[r] || { count: 0, monto: 0 };
          byRegionMap[r].count++;
          byRegionMap[r].monto += item.monto;
        }
        setAnalytics({
          byEstado: Object.entries(byEstadoMap).map(([estado, v]) => ({ estado, ...v })),
          byRegion: Object.entries(byRegionMap).map(([region, v]) => ({ region, ...v })).sort((a, b) => b.monto - a.monto).slice(0, 8),
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [apiKey, query, estado, region, publicadoDesde, publicadoHasta]);

  // Load on mount with default estado=publicada
  useEffect(() => {
    if (apiKey) search(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const loadDetail = async (codigo: string) => {
    setSelectedCodigo(codigo);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/compra-agil/${codigo}`, {
        headers: { 'X-MP-Ticket': apiKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setDetail(data);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Error cargando detalle');
    } finally {
      setDetailLoading(false);
    }
  };

  // Apply establecimientos filter client-side
  const displayListado = useMemo(() => {
    if (!result?.listado) return [];
    if (!soloEstablecimientos) return result.listado;
    return result.listado.filter(item =>
      matchesEstablecimiento(item.nombre) ||
      matchesEstablecimiento(item.organismo) ||
      matchesEstablecimiento(item.unidadCompra)
    );
  }, [result, soloEstablecimientos]);

  const totalMonto = displayListado.reduce((s, i) => s + i.monto, 0);
  const totalOfertas = displayListado.reduce((s, i) => s + i.totalOfertas, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-600/10 via-card to-blue-600/10 px-6 py-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-5 w-5 text-violet-500" />
              <span className="text-sm font-medium text-violet-600 dark:text-violet-400">API v2 · Tiempo real</span>
            </div>
            <h1 className="text-2xl font-bold">Compra Ágil</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mecanismo de contratación simplificada del Estado de Chile. Busca y analiza procesos de compra rápida.
            </p>
          </div>
          {result && (
            <div className="flex gap-3">
              <button
                id="ca-export-btn"
                onClick={() => exportCSV(result.listado)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Download className="h-4 w-4" /> Exportar CSV
              </button>
              <button
                id="ca-analytics-toggle"
                onClick={() => setShowAnalytics(v => !v)}
                className="flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-700 px-3 py-2 text-sm text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
              >
                <TrendingUp className="h-4 w-4" />
                {showAnalytics ? 'Ocultar análisis' : 'Ver análisis'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Form */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {/* Keyword */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="ca-search-query"
              type="text"
              placeholder="Buscar por nombre, organismo o código…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(1)}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          {/* Estado */}
          <select
            id="ca-filter-estado"
            value={estado}
            onChange={e => setEstado(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            {ESTADOS_CA.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          {/* Region */}
          <select
            id="ca-filter-region"
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            {REGIONES_CA.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          {/* Fecha desde */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Publicado desde</label>
            <input
              id="ca-filter-desde"
              type="date"
              value={publicadoDesde}
              onChange={e => setPublicadoDesde(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          {/* Fecha hasta */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Publicado hasta</label>
            <input
              id="ca-filter-hasta"
              type="date"
              value={publicadoHasta}
              onChange={e => setPublicadoHasta(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          {/* Establecimientos salud toggle */}
          <div className="flex items-end lg:col-span-2">
            <button
              id="ca-filter-establecimientos"
              onClick={() => setSoloEstablecimientos(v => !v)}
              className={`flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                soloEstablecimientos
                  ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-700 dark:text-red-300'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent'
              }`}
            >
              <Hospital className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{soloEstablecimientos ? '✓ Solo establecimientos salud' : 'Solo establecimientos salud'}</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 items-end lg:col-span-2">
            <button
              id="ca-search-btn"
              onClick={() => search(1)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
            <button
              id="ca-clear-btn"
              onClick={() => { setQuery(''); setEstado('publicada'); setRegion(''); setPublicadoDesde(''); setPublicadoHasta(''); setSoloEstablecimientos(false); }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
              title="Limpiar filtros"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error en la búsqueda</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Stats row */}
      {result && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: soloEstablecimientos ? 'Establecimientos salud' : 'Resultados encontrados', value: displayListado.length.toLocaleString('es-CL'), icon: soloEstablecimientos ? Hospital : Filter, color: soloEstablecimientos ? 'text-red-500' : 'text-violet-500' },
            { label: 'Monto total (CLP)', value: fmtCLP(totalMonto), icon: DollarSign, color: 'text-green-500' },
            { label: 'Cotizaciones recibidas', value: totalOfertas.toLocaleString('es-CL'), icon: Users, color: 'text-blue-500' },
            { label: 'Páginas de resultados', value: `${result.numeroPagina} / ${result.totalPaginas}`, icon: Tag, color: 'text-orange-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="font-bold text-lg leading-tight">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Analytics mini panel */}
      {showAnalytics && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-500" /> Por Estado</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={analytics.byEstado} dataKey="count" nameKey="estado" cx="50%" cy="50%" outerRadius={70} label={({ estado, percent }) => `${estado} ${(percent * 100).toFixed(0)}%`}>
                  {analytics.byEstado.map((entry, i) => (
                    <Cell key={i} fill={ESTADO_COLORS[entry.estado] || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v, 'Procesos']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-500" /> Monto por Región (Top 8)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={analytics.byRegion} layout="vertical" margin={{ left: 60, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={v => `$${(v / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 9 }} width={60} />
                <Tooltip formatter={(v: number) => [fmtCLP(v), 'Monto']} />
                <Bar dataKey="monto" radius={[0, 4, 4, 0]}>
                  {analytics.byRegion.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Results */}
      {/* Establecimientos filter info banner */}
      {soloEstablecimientos && result && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
          <Hospital className="h-4 w-4 flex-shrink-0" />
          <span>Filtrando por establecimientos de salud: <strong>{displayListado.length}</strong> de {result.listado.length} resultados coinciden con el directorio de establecimientos públicos de salud.</span>
        </div>
      )}

      {!loading && result && displayListado.length > 0 && (
        <div className="space-y-2">
          {displayListado.map(item => (
            <article
              key={item.codigo}
              id={`ca-item-${item.codigo}`}
              className="rounded-xl border border-border bg-card p-4 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm cursor-pointer transition-all"
              onClick={() => loadDetail(item.codigo)}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{item.codigo}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass(item.estadoGlosa)}`}>{item.estadoGlosa}</span>
                    {item.llamado === 2 && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">2º Llamado</span>}
                  </div>
                  <p className="font-medium text-sm leading-snug line-clamp-2">{item.nombre}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{item.organismo}</span>
                    {item.region && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.region}</span>}
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Publ. {fmtDate(item.fechaPublicacion)}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Cierre {fmtDate(item.fechaCierre)}</span>
                    {item.totalOfertas > 0 && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{item.totalOfertas} oferta{item.totalOfertas !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-1 flex-shrink-0">
                  {item.monto > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Presupuesto</p>
                      <p className="font-bold text-base text-green-600 dark:text-green-400">{fmtCLP(item.monto)}</p>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Empty when establecimientos filter hides all */}
      {!loading && result && result.listado.length > 0 && displayListado.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Hospital className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-base font-medium">Sin establecimientos de salud en esta página</p>
          <p className="text-sm">Ningún resultado de esta página coincide con el directorio de establecimientos de salud.</p>
          <button onClick={() => setSoloEstablecimientos(false)} className="mt-3 text-sm text-violet-600 hover:underline">Quitar filtro</button>
        </div>
      )}

      {/* Empty */}
      {!loading && result && result.listado.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Sin resultados</p>
          <p className="text-sm">Intenta con otros filtros o un rango de fechas más amplio.</p>
        </div>
      )}

      {/* Pagination */}
      {result && result.totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            id="ca-prev-page"
            disabled={page <= 1 || loading}
            onClick={() => search(page - 1)}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página <strong>{page}</strong> de <strong>{result.totalPaginas}</strong> · {result.total.toLocaleString('es-CL')} resultados
          </span>
          <button
            id="ca-next-page"
            disabled={page >= result.totalPaginas || loading}
            onClick={() => search(page + 1)}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-40 transition-colors"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {selectedCodigo && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelectedCodigo(null)}>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" />
          <div
            className="w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 bg-background/95 backdrop-blur z-10">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-violet-500" />
                <h2 className="font-bold">Detalle Compra Ágil</h2>
              </div>
              <div className="flex gap-2">
                {detail && (
                  <a
                    href={`https://www.mercadopublico.cl/FichaLicitacion/RetornaFicha.aspx?idLicitacion=${detail.codigo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" /> Ver en MP
                  </a>
                )}
                <button onClick={() => setSelectedCodigo(null)} className="rounded-md p-1 hover:bg-accent" id="ca-detail-close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {detailLoading && (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              </div>
            )}
            {detailError && (
              <div className="p-4 text-destructive flex items-center gap-2">
                <AlertCircle className="h-5 w-5" /> {detailError}
              </div>
            )}

            {detail && (
              <div className="p-4 space-y-5">
                {/* Title & status */}
                <div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="font-mono text-xs border border-border rounded px-2 py-0.5">{detail.codigo}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass(detail.estadoGlosa)}`}>{detail.estadoGlosa}</span>
                    {detail.tieneOC && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />OC Emitida</span>}
                    {detail.consideraMedioAmbiental && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">🌿 Medioambiental</span>}
                  </div>
                  <h3 className="font-bold text-lg leading-snug">{detail.nombre}</h3>
                  {detail.descripcion && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{detail.descripcion}</p>}
                </div>

                {/* Key info grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Organismo', value: detail.organismo, icon: Building2 },
                    { label: 'Unidad de Compra', value: detail.unidadCompra, icon: Tag },
                    { label: 'Región', value: detail.region, icon: MapPin },
                    { label: 'Tipo presupuesto', value: detail.tipoPresupuesto, icon: DollarSign },
                    { label: 'Publicación', value: fmtDate(detail.fechaPublicacion), icon: Calendar },
                    { label: 'Cierre', value: fmtDate(detail.fechaCierre), icon: Clock },
                  ].map(({ label, value, icon: Icon }) => value ? (
                    <div key={label} className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5"><Icon className="h-3 w-3" />{label}</p>
                      <p className="text-sm font-medium">{value}</p>
                    </div>
                  ) : null)}
                </div>

                {/* Budget */}
                {(detail.monto > 0 || detail.presupuestoEstimado > 0) && (
                  <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 p-4">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-2 flex items-center gap-1"><DollarSign className="h-3 w-3" />Presupuesto</p>
                    <div className="flex gap-6">
                      {detail.monto > 0 && <div><p className="text-xs text-muted-foreground">Disponible CLP</p><p className="font-bold text-xl text-green-700 dark:text-green-300">{fmtCLP(detail.monto)}</p></div>}
                      {detail.presupuestoEstimado > 0 && <div><p className="text-xs text-muted-foreground">Estimado</p><p className="font-bold text-xl">{fmtCLP(detail.presupuestoEstimado)}</p></div>}
                    </div>
                    {detail.plazoEntregaDias && <p className="text-xs text-muted-foreground mt-1">Plazo entrega: {detail.plazoEntregaDias} días · {detail.direccionEntrega}</p>}
                  </div>
                )}

                {/* Orden de Compra */}
                {detail.tieneOC && (
                  <div className="rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-4">
                    <p className="text-xs text-purple-700 dark:text-purple-400 font-medium mb-1 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Orden de Compra Emitida</p>
                    <p className="text-sm">ID OC: <strong>{detail.idOrdenCompra}</strong></p>
                    {detail.codigoOrdenCompra && <p className="text-sm">Código: <strong>{detail.codigoOrdenCompra}</strong></p>}
                  </div>
                )}

                {/* Products */}
                {detail.productosSolicitados.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Package className="h-4 w-4 text-blue-500" />Productos solicitados ({detail.productosSolicitados.length})</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {detail.productosSolicitados.map((prod, i) => (
                        <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-sm font-medium">{prod.nombre}</p>
                          {prod.descripcion && <p className="text-xs text-muted-foreground">{prod.descripcion}</p>}
                          <p className="text-xs text-muted-foreground mt-0.5">Cant.: {prod.cantidad} {prod.unidadMedida} · Cód.: {prod.codigoProducto}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Providers */}
                {detail.proveedoresCotizando.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-emerald-500" />Proveedores cotizando ({detail.proveedoresCotizando.length})</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {detail.proveedoresCotizando
                        .sort((a, b) => (b.seleccionado ? 1 : 0) - (a.seleccionado ? 1 : 0))
                        .map((prov, i) => (
                          <div key={i} className={`rounded-lg border p-3 ${prov.seleccionado ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-card'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium flex items-center gap-1.5">
                                  {prov.seleccionado && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                  {prov.razonSocial}
                                </p>
                                <p className="text-xs text-muted-foreground">{prov.rut} {prov.esEmt && '· EMT'}</p>
                                {prov.estadoCotizacion && <p className="text-xs text-muted-foreground">{prov.estadoCotizacion}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                {prov.montoTotal > 0 && <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmtCLP(prov.montoTotal)}</p>}
                                {prov.valorNeto > 0 && <p className="text-xs text-muted-foreground">Neto: {fmtCLP(prov.valorNeto)}</p>}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Motivos */}
                {(detail.motivoCancelacion || detail.motivoDesierta || detail.motivoSeleccion) && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    {detail.motivoCancelacion && <p className="text-sm"><strong>Cancelación:</strong> {detail.motivoCancelacion}</p>}
                    {detail.motivoDesierta && <p className="text-sm"><strong>Desierta:</strong> {detail.motivoDesierta}</p>}
                    {detail.motivoSeleccion && <p className="text-sm"><strong>Selección:</strong> {detail.motivoSeleccion}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useMemo, useCallback, Fragment } from 'react';
import { Search, Filter, TrendingUp, Calendar, ChevronDown, ChevronUp, FileText, Loader2, ExternalLink, Download, AlertCircle, ChevronRight, Building2, MapPin, DollarSign, Info, Hash, Clock, Users, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ESTADO_COLORS: Record<string, string> = {
  'Publicada': '#3b82f6',
  'En evaluación': '#f59e0b',
  'Adjudicada': '#10b981',
  'Desierta': '#ef4444',
  'Cerrada': '#6b7280',
  'Revocada': '#dc2626',
  'Suspendida': '#9ca3af',
};

const TIPOS_LICITACION = [
  { value: '', label: 'Todos los tipos' },
  { value: 'L1', label: 'L1 — Pública < 100 UTM' },
  { value: 'LE', label: 'LE — Pública 100–1.000 UTM' },
  { value: 'LP', label: 'LP — Pública 1.000–2.000 UTM' },
  { value: 'LQ', label: 'LQ — Pública 2.000–5.000 UTM' },
  { value: 'LR', label: 'LR — Pública ≥ 5.000 UTM' },
  { value: 'LS', label: 'LS — Servicios especializados' },
  { value: 'E2', label: 'E2 — Privada < 100 UTM' },
  { value: 'CO', label: 'CO — Privada 100–1.000 UTM' },
  { value: 'B2', label: 'B2 — Privada 1.000–2.000 UTM' },
  { value: 'H2', label: 'H2 — Privada 2.000–5.000 UTM' },
  { value: 'I2', label: 'I2 — Privada > 5.000 UTM' },
];

interface Licitacion {
  codigo: string;
  nombre: string;
  estado: string;
  tipo: string;
  fechaCierre: string;
  // Detail fields (only available when fetching by código)
  descripcion?: string;
  organismo?: string;
  codigoOrganismo?: string;
  rutUnidad?: string;
  nombreUnidad?: string;
  monto?: number;
  moneda?: string;
  fechaCreacion?: string;
  fechaPublicacion?: string;
  fechaAdjudicacion?: string;
  fechaEstimadaAdjudicacion?: string;
  region?: string;
  comunaUnidad?: string;
  tipoDescripcion?: string;
  tipoConvocatoria?: string;
  etapas?: number;
  cantidadReclamos?: number;
  cantidadItems?: number;
  diasCierreLicitacion?: number;
  adjudicacionNumeroOferentes?: number;
  urlDetalle: string;
}

async function fetchLicitaciones(filtros: {
  busqueda: string;
  codigo: string;
  estado: string;
  region: string;
  tipo: string;
  sortField: string;
  sortOrder: string;
  fechaInicio: string;
}, signal?: AbortSignal, onPending?: () => void): Promise<{ total: number; listado: Licitacion[] }> {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.codigo) params.set('codigo', filtros.codigo);
  if (filtros.estado && filtros.estado !== 'Todos') params.set('estado', filtros.estado);
  if (filtros.region && filtros.region !== 'Todas') params.set('region', filtros.region);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.fechaInicio) params.set('fechaInicio', filtros.fechaInicio);
  params.set('sortField', filtros.sortField);
  params.set('sortOrder', filtros.sortOrder);

  const url = `/api/licitaciones?${params.toString()}`;
  const resp = await fetch(url, { signal });

  if (resp.status === 202) {
    const { jobId } = await resp.json();
    onPending?.();
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await new Promise(r => setTimeout(r, 3000));
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const poll = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });
      const pollData = await poll.json();
      if (pollData.status === 'done') return pollData.data;
      if (pollData.status === 'error') throw new Error(pollData.error || 'Error del servidor');
    }
  }

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
  return data;
}

function exportCSV(licitaciones: Licitacion[]) {
  const headers = ['Código', 'Nombre', 'Estado', 'Tipo', 'Tipo Descripción', 'Fecha Cierre'];
  const rows = licitaciones.map(l => [
    l.codigo, l.nombre, l.estado, l.tipo,
    TIPOS_LICITACION.find(t => t.value === l.tipo)?.label ?? l.tipo,
    l.fechaCierre,
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `licitaciones_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface LicitacionDetail extends Licitacion {
  _loaded: true;
}

async function fetchLicitacionDetail(codigo: string, retries = 2): Promise<LicitacionDetail> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(`/api/licitacion/${encodeURIComponent(codigo)}`);
    if (resp.status === 504 || resp.status === 429) {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
    }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
    return { ...data, _loaded: true };
  }
  throw new Error('No se pudo cargar el detalle tras varios intentos');
}

export function Licitaciones() {
  const [busqueda, setBusqueda] = useState('');
  const [codigoFilter, setCodigoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [tipoFilter, setTipoFilter] = useState('');
  const [sortField, setSortField] = useState<'fechaCierre' | 'fechaPublicacion'>('fechaCierre');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(true);
  const [fechaInicio, setFechaInicio] = useState('');

  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Detail panel
  const [expandedCodigo, setExpandedCodigo] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<LicitacionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const estados = ['Todos', 'Publicada', 'Adjudicada', 'Cerrada', 'Desierta', 'Revocada', 'Suspendida'];
  const regiones = [
    'Todas', 'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
    'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble', 'Biobío',
    'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes'
  ];

  // Abort previous search when a new one starts
  const abortRef = useState<AbortController | null>(null);

  const handleBuscar = async () => {
    abortRef[0]?.abort();
    const controller = new AbortController();
    abortRef[1](controller);

    setIsLoading(true);
    setIsSlow(false);
    setHasSearched(true);
    setError('');
    setCurrentPage(1);
    setExpandedCodigo(null);
    setDetailData(null);
    try {
      const result = await fetchLicitaciones({
        busqueda, codigo: codigoFilter, estado: estadoFilter,
        region: regionFilter, tipo: tipoFilter, sortField, sortOrder,
        fechaInicio,
      }, controller.signal, () => setIsSlow(true));
      setLicitaciones(result.listado);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLicitaciones([]);
    } finally {
      setIsLoading(false);
      setIsSlow(false);
    }
  };

  const toggleDetail = useCallback(async (codigo: string) => {
    if (expandedCodigo === codigo) {
      setExpandedCodigo(null);
      setDetailData(null);
      setDetailError('');
      return;
    }
    setExpandedCodigo(codigo);
    setDetailLoading(true);
    setDetailError('');
    setDetailData(null);
    try {
      const detail = await fetchLicitacionDetail(codigo);
      setDetailData(detail);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Error al cargar detalle');
    } finally {
      setDetailLoading(false);
    }
  }, [expandedCodigo]);

  const estadoStats = useMemo(() => {
    const stats: Record<string, number> = {};
    licitaciones.forEach(l => { stats[l.estado] = (stats[l.estado] || 0) + 1; });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [licitaciones]);

  const tipoStats = useMemo(() => {
    const stats: Record<string, number> = {};
    licitaciones.forEach(l => {
      const t = l.tipo || 'N/D';
      stats[t] = (stats[t] || 0) + 1;
    });
    return Object.entries(stats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [licitaciones]);

  const totalPages = Math.max(1, Math.ceil(licitaciones.length / pageSize));
  const paginated = useMemo(
    () => licitaciones.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [licitaciones, currentPage, pageSize]
  );

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v);

  const formatDate = (d: string | undefined) => {
    if (!d) return '—';
    // Append time to avoid UTC-midnight shift to previous day in negative-offset timezones
    const date = new Date(d.length === 10 ? d + 'T12:00:00' : d);
    return date.toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const TIPO_COLORS: Record<string, string> = {
    'L1': '#3b82f6', 'LE': '#10b981', 'LP': '#f59e0b', 'LQ': '#8b5cf6',
    'LR': '#ef4444', 'LS': '#06b6d4', 'E2': '#f97316', 'CO': '#84cc16',
    'B2': '#ec4899', 'H2': '#14b8a6', 'I2': '#a855f7',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Licitaciones</h1>
          <p className="text-muted-foreground mt-1">
            Consulta licitaciones del Mercado Público en tiempo real
          </p>
        </div>
        {licitaciones.length > 0 && (
          <button
            onClick={() => exportCSV(licitaciones)}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        )}
      </div>

      {/* Búsqueda y filtros */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre, código u organismo..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                className="w-full pl-10 pr-4 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filtros
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={handleBuscar}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Consultando...</> : <><Search className="w-4 h-4" />Buscar</>}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-border">
              <div>
                <label className="block text-sm mb-2">Código Licitación</label>
                <input type="text" placeholder="Ej: 1057403-22-LE24"
                  value={codigoFilter} onChange={(e) => setCodigoFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm mb-2">Estado</label>
                <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {estados.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Tipo</label>
                <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {TIPOS_LICITACION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Región</label>
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {regiones.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Fecha consulta</label>
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm mb-2">Ordenar por</label>
                <select value={sortField} onChange={(e) => setSortField(e.target.value as 'fechaCierre' | 'fechaPublicacion')}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="fechaCierre">Fecha Cierre</option>
                  <option value="fechaPublicacion">Fecha Publicación</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Orden</label>
                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="desc">Descendente</option>
                  <option value="asc">Ascendente</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Estado inicial */}
      {!hasSearched && !error && (
        <div className="text-center py-16">
          <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="mb-2">Configura tus filtros y presiona "Buscar"</h3>
          <p className="text-muted-foreground">
            Consulta licitaciones en tiempo real desde la API del Mercado Público
          </p>
        </div>
      )}

      {/* Cargando */}
      {isLoading && (
        <div className="text-center py-16">
          <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
          <h3 className="mb-2">Consultando API del Mercado Público...</h3>
          {isSlow
            ? <p className="text-muted-foreground">La consulta puede tardar hasta 60 segundos, por favor espera...</p>
            : <p className="text-muted-foreground">Obteniendo licitaciones según tus filtros</p>
          }
        </div>
      )}

      {/* Resultados */}
      {hasSearched && !isLoading && licitaciones.length > 0 && (
        <>
          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg"><FileText className="w-5 h-5 text-blue-500" /></div>
                <div><p className="text-sm text-muted-foreground">Total Licitaciones</p><p className="text-2xl">{licitaciones.length}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/10 rounded-lg"><Hash className="w-5 h-5 text-green-500" /></div>
                <div><p className="text-sm text-muted-foreground">Tipos Distintos</p><p className="text-2xl">{tipoStats.length}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-500/10 rounded-lg"><TrendingUp className="w-5 h-5 text-orange-500" /></div>
                <div><p className="text-sm text-muted-foreground">Estados Distintos</p><p className="text-2xl">{estadoStats.length}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/10 rounded-lg"><Info className="w-5 h-5 text-purple-500" /></div>
                <div><p className="text-sm text-muted-foreground">Haz clic en una fila</p><p className="text-sm">para ver detalle completo</p></div>
              </div>
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="mb-4">Distribución por Estado</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={estadoStats} cx="50%" cy="50%" labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80} dataKey="value">
                    {estadoStats.map(e => <Cell key={e.name} fill={ESTADO_COLORS[e.name] ?? '#8884d8'} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="mb-4">Distribución por Tipo</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={tipoStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" />
                  <YAxis stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {tipoStats.map(t => <Cell key={t.name} fill={TIPO_COLORS[t.name] ?? '#8884d8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3 text-left">Código</th>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Cierre</th>
                    <th className="px-4 py-3 text-center">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map(lic => (
                    <Fragment key={lic.codigo}>
                      <tr onClick={() => toggleDetail(lic.codigo)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer">
                        <td className="px-4 py-4">
                          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCodigo === lic.codigo ? 'rotate-90' : ''}`} />
                        </td>
                        <td className="px-4 py-4"><span className="font-mono text-sm">{lic.codigo}</span></td>
                        <td className="px-4 py-4 max-w-sm"><p className="line-clamp-2 text-sm">{lic.nombre}</p></td>
                        <td className="px-4 py-4">
                          <span className="px-3 py-1 rounded-full text-sm text-white"
                            style={{ backgroundColor: ESTADO_COLORS[lic.estado] ?? '#6b7280' }}>
                            {lic.estado}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-sm px-2 py-1 rounded text-white"
                            style={{ backgroundColor: TIPO_COLORS[lic.tipo] ?? '#6b7280' }}>
                            {lic.tipo || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{formatDate(lic.fechaCierre)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <a href={lic.urlDetalle} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </td>
                      </tr>
                      {expandedCodigo === lic.codigo && (
                        <tr key={`${lic.codigo}-detail`}>
                          <td colSpan={7} className="p-0">
                            <div className="bg-muted/20 border-t border-border p-6">
                              {detailLoading && (
                                <div className="flex items-center gap-3 text-muted-foreground">
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  <span>Cargando detalle completo...</span>
                                </div>
                              )}
                              {detailError && (
                                <div className="flex items-center gap-3 text-destructive">
                                  <AlertCircle className="w-5 h-5" />
                                  <span>{detailError}</span>
                                </div>
                              )}
                              {detailData && detailData.codigo === lic.codigo && (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-semibold">Detalle Completo</h4>
                                    <button onClick={(e) => { e.stopPropagation(); setExpandedCodigo(null); }}
                                      className="p-1 hover:bg-muted rounded">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                  {detailData.descripcion && (
                                    <p className="text-sm text-muted-foreground">{detailData.descripcion}</p>
                                  )}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-3">
                                      <h5 className="text-sm font-medium flex items-center gap-2"><Building2 className="w-4 h-4" /> Organismo</h5>
                                      <div className="text-sm space-y-1">
                                        <p><span className="text-muted-foreground">Nombre:</span> {detailData.organismo || '—'}</p>
                                        <p><span className="text-muted-foreground">Unidad:</span> {detailData.nombreUnidad || '—'}</p>
                                        <p><span className="text-muted-foreground">RUT:</span> {detailData.rutUnidad || '—'}</p>
                                        <p><span className="text-muted-foreground">Código:</span> {detailData.codigoOrganismo || '—'}</p>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <h5 className="text-sm font-medium flex items-center gap-2"><DollarSign className="w-4 h-4" /> Financiero</h5>
                                      <div className="text-sm space-y-1">
                                        <p><span className="text-muted-foreground">Monto:</span> {detailData.monto && detailData.monto > 0 ? formatCurrency(detailData.monto) : 'No publicado'}</p>
                                        <p><span className="text-muted-foreground">Moneda:</span> {detailData.moneda || '—'}</p>
                                        <p><span className="text-muted-foreground">Tipo:</span> {detailData.tipoDescripcion || detailData.tipo}</p>
                                        <p><span className="text-muted-foreground">Convocatoria:</span> {detailData.tipoConvocatoria || '—'}</p>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <h5 className="text-sm font-medium flex items-center gap-2"><MapPin className="w-4 h-4" /> Ubicación</h5>
                                      <div className="text-sm space-y-1">
                                        <p><span className="text-muted-foreground">Región:</span> {detailData.region || '—'}</p>
                                        <p><span className="text-muted-foreground">Comuna:</span> {detailData.comunaUnidad || '—'}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                      <h5 className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> Fechas</h5>
                                      <div className="text-sm grid grid-cols-2 gap-1">
                                        <span className="text-muted-foreground">Creación:</span><span>{formatDate(detailData.fechaCreacion)}</span>
                                        <span className="text-muted-foreground">Publicación:</span><span>{formatDate(detailData.fechaPublicacion)}</span>
                                        <span className="text-muted-foreground">Cierre:</span><span>{formatDate(detailData.fechaCierre)}</span>
                                        <span className="text-muted-foreground">Adjudicación:</span><span>{formatDate(detailData.fechaAdjudicacion)}</span>
                                        <span className="text-muted-foreground">Est. Adjudicación:</span><span>{formatDate(detailData.fechaEstimadaAdjudicacion)}</span>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <h5 className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Participación</h5>
                                      <div className="text-sm grid grid-cols-2 gap-1">
                                        <span className="text-muted-foreground">Etapas:</span><span>{detailData.etapas ?? '—'}</span>
                                        <span className="text-muted-foreground">Items:</span><span>{detailData.cantidadItems ?? '—'}</span>
                                        <span className="text-muted-foreground">Reclamos:</span><span>{detailData.cantidadReclamos ?? '—'}</span>
                                        <span className="text-muted-foreground">Oferentes:</span><span>{detailData.adjudicacionNumeroOferentes ?? '—'}</span>
                                        <span className="text-muted-foreground">Días al cierre:</span><span>{detailData.diasCierreLicitacion ?? '—'}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Mostrar</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="border border-border rounded px-2 py-1 bg-background text-foreground text-sm"
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>por página · {licitaciones.length} en total</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
              >«</button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
              >‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '…'
                    ? <span key={`ellipsis-${idx}`} className="px-2 py-1 text-sm text-muted-foreground">…</span>
                    : <button
                        key={p}
                        onClick={() => setCurrentPage(p as number)}
                        className={`px-3 py-1 rounded text-sm border transition-colors ${
                          currentPage === p
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:bg-muted'
                        }`}
                      >{p}</button>
                )
              }
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
              >›</button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
              >»</button>
            </div>
          </div>
        </>
      )}

      {/* Sin resultados */}
      {hasSearched && !isLoading && !error && licitaciones.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-lg">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="mb-2">No se encontraron licitaciones</h3>
          <p className="text-muted-foreground">Intenta ajustar los filtros de búsqueda</p>
        </div>
      )}
    </div>
  );
}

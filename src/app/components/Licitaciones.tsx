import { useState, useMemo } from 'react';
import { Search, Filter, TrendingUp, Calendar, DollarSign, Building2, ChevronDown, ChevronUp, FileText, Loader2, MapPin, ExternalLink, Download, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ESTADO_COLORS: Record<string, string> = {
  'Publicada': '#3b82f6',
  'En evaluaciÃ³n': '#f59e0b',
  'Adjudicada': '#10b981',
  'Desierta': '#ef4444',
  'Cerrada': '#6b7280',
  'Revocada': '#dc2626',
  'Suspendida': '#9ca3af',
};

const TIPOS_LICITACION = [
  { value: '', label: 'Todos los tipos' },
  { value: 'L1', label: 'L1 â€“ PÃºblica < 100 UTM' },
  { value: 'LE', label: 'LE â€“ PÃºblica 100â€“1.000 UTM' },
  { value: 'LP', label: 'LP â€“ PÃºblica 1.000â€“2.000 UTM' },
  { value: 'LQ', label: 'LQ â€“ PÃºblica 2.000â€“5.000 UTM' },
  { value: 'LR', label: 'LR â€“ PÃºblica â‰¥ 5.000 UTM' },
  { value: 'LS', label: 'LS â€“ Servicios especializados' },
  { value: 'E2', label: 'E2 â€“ Privada < 100 UTM' },
  { value: 'CO', label: 'CO â€“ Privada 100â€“1.000 UTM' },
];

interface Licitacion {
  codigo: string;
  nombre: string;
  organismo: string;
  estado: string;
  monto: number;
  fechaPublicacion: string;
  fechaCierre: string;
  region: string;
  tipo: string;
  urlDetalle: string;
}

async function fetchLicitaciones(filtros: {
  busqueda: string;
  estado: string;
  region: string;
  tipo: string;
  sortField: string;
  sortOrder: string;
  fechaInicio: string;
  fechaFin: string;
}): Promise<{ total: number; listado: Licitacion[] }> {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.estado && filtros.estado !== 'Todos') params.set('estado', filtros.estado);
  if (filtros.region && filtros.region !== 'Todas') params.set('region', filtros.region);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.fechaInicio) params.set('fechaInicio', filtros.fechaInicio);
  if (filtros.fechaFin) params.set('fechaFin', filtros.fechaFin);
  params.set('sortField', filtros.sortField);
  params.set('sortOrder', filtros.sortOrder);

  const resp = await fetch(`/api/licitaciones?${params.toString()}`);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
  return data;
}

function exportCSV(licitaciones: Licitacion[]) {
  const headers = ['CÃ³digo', 'Nombre', 'Organismo', 'Estado', 'Tipo', 'RegiÃ³n', 'Monto', 'PublicaciÃ³n', 'Cierre', 'URL'];
  const rows = licitaciones.map(l => [
    l.codigo, l.nombre, l.organismo, l.estado, l.tipo, l.region,
    l.monto.toString(), l.fechaPublicacion, l.fechaCierre, l.urlDetalle,
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `licitaciones_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Licitaciones() {
  const [busqueda, setBusqueda] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [tipoFilter, setTipoFilter] = useState('');
  const [sortField, setSortField] = useState<'monto' | 'fechaPublicacion'>('fechaPublicacion');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(true);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');

  const estados = ['Todos', 'Publicada', 'Adjudicada', 'Cerrada', 'Desierta', 'Revocada', 'Suspendida'];
  const regiones = [
    'Todas', 'Arica y Parinacota', 'TarapacÃ¡', 'Antofagasta', 'Atacama', 'Coquimbo',
    'ValparaÃ­so', 'Metropolitana', "O'Higgins", 'Maule', 'Ã‘uble', 'BiobÃ­o',
    'La AraucanÃ­a', 'Los RÃ­os', 'Los Lagos', 'AysÃ©n', 'Magallanes'
  ];

  const handleBuscar = async () => {
    setIsLoading(true);
    setHasSearched(true);
    setError('');
    try {
      const result = await fetchLicitaciones({
        busqueda, estado: estadoFilter, region: regionFilter,
        tipo: tipoFilter, sortField, sortOrder, fechaInicio, fechaFin,
      });
      setLicitaciones(result.listado);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLicitaciones([]);
    } finally {
      setIsLoading(false);
    }
  };

  const estadoStats = useMemo(() => {
    const stats: Record<string, number> = {};
    licitaciones.forEach(l => { stats[l.estado] = (stats[l.estado] || 0) + 1; });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [licitaciones]);

  const regionStats = useMemo(() => {
    const stats: Record<string, number> = {};
    licitaciones.forEach(l => { stats[l.region] = (stats[l.region] || 0) + 1; });
    return Object.entries(stats).map(([name, count]) => ({ name, count }));
  }, [licitaciones]);

  const montoTotal = useMemo(() => licitaciones.reduce((s, l) => s + l.monto, 0), [licitaciones]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v);

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' }) : 'â€”';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Licitaciones</h1>
          <p className="text-muted-foreground mt-1">
            Consulta licitaciones del Mercado PÃºblico en tiempo real
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

      {/* BÃºsqueda y filtros */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre, cÃ³digo u organismo..."
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
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4 pt-4 border-t border-border">
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
                <label className="block text-sm mb-2">RegiÃ³n</label>
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {regiones.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Ordenar por</label>
                <select value={sortField} onChange={(e) => setSortField(e.target.value as 'monto' | 'fechaPublicacion')}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="fechaPublicacion">Fecha PublicaciÃ³n</option>
                  <option value="monto">Monto</option>
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
              <div>
                <label className="block text-sm mb-2">Desde</label>
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm mb-2">Hasta</label>
                <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
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
            Consulta licitaciones en tiempo real desde la API del Mercado PÃºblico
          </p>
        </div>
      )}

      {/* Cargando */}
      {isLoading && (
        <div className="text-center py-16">
          <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
          <h3 className="mb-2">Consultando API del Mercado PÃºblico...</h3>
          <p className="text-muted-foreground">Obteniendo licitaciones segÃºn tus filtros</p>
        </div>
      )}

      {/* Resultados */}
      {hasSearched && !isLoading && licitaciones.length > 0 && (
        <>
          {/* EstadÃ­sticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg"><FileText className="w-5 h-5 text-blue-500" /></div>
                <div><p className="text-sm text-muted-foreground">Total Licitaciones</p><p className="text-2xl">{licitaciones.length}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/10 rounded-lg"><DollarSign className="w-5 h-5 text-green-500" /></div>
                <div><p className="text-sm text-muted-foreground">Monto Total</p><p className="text-2xl">{formatCurrency(montoTotal)}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-500/10 rounded-lg"><TrendingUp className="w-5 h-5 text-orange-500" /></div>
                <div><p className="text-sm text-muted-foreground">Publicadas</p><p className="text-2xl">{licitaciones.filter(l => l.estado === 'Publicada').length}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/10 rounded-lg"><MapPin className="w-5 h-5 text-purple-500" /></div>
                <div><p className="text-sm text-muted-foreground">Regiones</p><p className="text-2xl">{new Set(licitaciones.map(l => l.region)).size}</p></div>
              </div>
            </div>
          </div>

          {/* GrÃ¡ficos */}
          {estadoStats.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="mb-4">DistribuciÃ³n por Estado</h3>
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
                <h3 className="mb-4">Licitaciones por RegiÃ³n</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={regionStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }} />
                    <Bar dataKey="count" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabla */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left">CÃ³digo</th>
                    <th className="px-6 py-3 text-left">Nombre</th>
                    <th className="px-6 py-3 text-left">Organismo</th>
                    <th className="px-6 py-3 text-left">Estado</th>
                    <th className="px-6 py-3 text-left">Tipo</th>
                    <th className="px-6 py-3 text-left">RegiÃ³n</th>
                    <th className="px-6 py-3 text-right">Monto</th>
                    <th className="px-6 py-3 text-left">Cierre</th>
                    <th className="px-6 py-3 text-center">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {licitaciones.map(lic => (
                    <tr key={lic.codigo} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4"><span className="font-mono text-sm">{lic.codigo}</span></td>
                      <td className="px-6 py-4 max-w-xs"><p className="line-clamp-2 text-sm">{lic.nombre}</p></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm">{lic.organismo}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-sm text-white"
                          style={{ backgroundColor: ESTADO_COLORS[lic.estado] ?? '#6b7280' }}>
                          {lic.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4"><span className="font-mono text-sm bg-muted px-2 py-1 rounded">{lic.tipo}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{lic.region}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm">{lic.monto > 0 ? formatCurrency(lic.monto) : <span className="text-muted-foreground">No publicado</span>}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{formatDate(lic.fechaCierre)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <a href={lic.urlDetalle} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Sin resultados */}
      {hasSearched && !isLoading && !error && licitaciones.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-lg">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="mb-2">No se encontraron licitaciones</h3>
          <p className="text-muted-foreground">Intenta ajustar los filtros de bÃºsqueda</p>
        </div>
      )}
    </div>
  );
}

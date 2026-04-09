import { useState, useMemo } from 'react';
import { Search, Filter, TrendingUp, Calendar, DollarSign, Package, ChevronDown, ChevronUp, CheckCircle2, Loader2, MapPin, ExternalLink, Download, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const ESTADO_COLORS: Record<string, string> = {
  'Enviada al Proveedor': '#3b82f6',
  'Aceptada': '#10b981',
  'Cancelada': '#ef4444',
  'Recepcion Conforme': '#8b5cf6',
  'Recepcion Incompleta': '#f97316',
  'Pendiente': '#f59e0b',
  'Parcialmente Recepcionada': '#6366f1',
};

interface OrdenCompra {
  codigo: string;
  producto: string;
  proveedor: string;
  organismo: string;
  estado: string;
  monto: number;
  cantidad: number;
  fechaEmision: string;
  fechaEntrega: string;
  region: string;
  urlDetalle: string;
}

async function fetchOrdenesCompra(filtros: {
  busqueda: string;
  estado: string;
  region: string;
  sortField: string;
  sortOrder: string;
  fechaInicio: string;
  fechaFin: string;
}): Promise<{ total: number; listado: OrdenCompra[] }> {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.estado && filtros.estado !== 'Todos') params.set('estado', filtros.estado);
  if (filtros.region && filtros.region !== 'Todas') params.set('region', filtros.region);
  if (filtros.fechaInicio) params.set('fechaInicio', filtros.fechaInicio);
  if (filtros.fechaFin) params.set('fechaFin', filtros.fechaFin);
  params.set('sortField', filtros.sortField);
  params.set('sortOrder', filtros.sortOrder);

  const resp = await fetch(`/api/ordenes-compra?${params.toString()}`);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
  return data;
}

function exportCSV(ordenes: OrdenCompra[]) {
  const headers = ['Codigo','Producto','Proveedor','Organismo','Estado','Region','Monto','Cantidad','Emision','Entrega','URL'];
  const rows = ordenes.map(o => [
    o.codigo, o.producto, o.proveedor, o.organismo, o.estado, o.region,
    o.monto.toString(), o.cantidad.toString(), o.fechaEmision, o.fechaEntrega, o.urlDetalle,
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ordenes_compra_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function OrdenesCompra() {
  const [busqueda, setBusqueda] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [sortField, setSortField] = useState<'monto' | 'fechaEmision'>('fechaEmision');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(true);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');

  const estados = ['Todos', 'Enviada al Proveedor', 'Aceptada', 'Cancelada', 'Recepcion Conforme', 'Pendiente', 'Parcialmente Recepcionada', 'Recepcion Incompleta'];
  const regiones = [
    'Todas', 'Arica y Parinacota', 'Tarapaca', 'Antofagasta', 'Atacama', 'Coquimbo',
    'Valparaiso', 'Metropolitana', "O'Higgins", 'Maule', 'Nuble', 'Biobio',
    'La Araucania', 'Los Rios', 'Los Lagos', 'Aysen', 'Magallanes'
  ];

  const handleBuscar = async () => {
    setIsLoading(true);
    setHasSearched(true);
    setError('');
    try {
      const result = await fetchOrdenesCompra({ busqueda, estado: estadoFilter, region: regionFilter, sortField, sortOrder, fechaInicio, fechaFin });
      setOrdenesCompra(result.listado);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setOrdenesCompra([]);
    } finally {
      setIsLoading(false);
    }
  };

  const tendenciaMontos = useMemo(() => {
    const grouped: Record<string, number> = {};
    ordenesCompra.forEach(o => { grouped[o.fechaEmision] = (grouped[o.fechaEmision] || 0) + o.monto; });
    return Object.entries(grouped)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([fecha, monto]) => ({ fecha: new Date(fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }), monto: monto / 1000000 }));
  }, [ordenesCompra]);

  const regionMontos = useMemo(() => {
    const grouped: Record<string, number> = {};
    ordenesCompra.forEach(o => { grouped[o.region] = (grouped[o.region] || 0) + o.monto; });
    return Object.entries(grouped).map(([region, monto]) => ({ region, monto: monto / 1000000 })).sort((a, b) => b.monto - a.monto);
  }, [ordenesCompra]);

  const montoTotal = useMemo(() => ordenesCompra.reduce((s, o) => s + o.monto, 0), [ordenesCompra]);
  const cantidadTotal = useMemo(() => ordenesCompra.reduce((s, o) => s + o.cantidad, 0), [ordenesCompra]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v);

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' }) : 'T\u00f3';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Ordenes de Compra</h1>
          <p className="text-muted-foreground mt-1">Consulta ordenes de compra del Mercado Publico en tiempo real</p>
        </div>
        {ordenesCompra.length > 0 && (
          <button onClick={() => exportCSV(ordenesCompra)}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors">
            <Download className="w-4 h-4" />Exportar CSV
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input type="text" placeholder="Buscar por producto, codigo o proveedor..."
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                className="w-full pl-10 pr-4 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors">
              <Filter className="w-4 h-4" />Filtros
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button onClick={handleBuscar} disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Consultando...</> : <><Search className="w-4 h-4" />Buscar</>}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 pt-4 border-t border-border">
              <div>
                <label className="block text-sm mb-2">Estado</label>
                <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {estados.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Region</label>
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {regiones.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Ordenar por</label>
                <select value={sortField} onChange={(e) => setSortField(e.target.value as 'monto' | 'fechaEmision')}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="fechaEmision">Fecha Emision</option>
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

      {error && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" /><p>{error}</p>
        </div>
      )}

      {!hasSearched && !error && (
        <div className="text-center py-16">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="mb-2">Configura tus filtros y presiona Buscar</h3>
          <p className="text-muted-foreground">Consulta ordenes de compra en tiempo real desde la API del Mercado Publico</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16">
          <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
          <h3 className="mb-2">Consultando API del Mercado Publico...</h3>
          <p className="text-muted-foreground">Obteniendo ordenes de compra segun tus filtros</p>
        </div>
      )}

      {hasSearched && !isLoading && ordenesCompra.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg"><Package className="w-5 h-5 text-blue-500" /></div>
                <div><p className="text-sm text-muted-foreground">Total Ordenes</p><p className="text-2xl">{ordenesCompra.length}</p></div>
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
                <div className="p-3 bg-purple-500/10 rounded-lg"><TrendingUp className="w-5 h-5 text-purple-500" /></div>
                <div><p className="text-sm text-muted-foreground">Items Totales</p><p className="text-2xl">{cantidadTotal.toLocaleString('es-CL')}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-lg"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
                <div><p className="text-sm text-muted-foreground">Aceptadas</p><p className="text-2xl">{ordenesCompra.filter(o => o.estado === 'Aceptada').length}</p></div>
              </div>
            </div>
          </div>

          {tendenciaMontos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="mb-4">Tendencia de Montos (millones CLP)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={tendenciaMontos}>
                    <defs>
                      <linearGradient id="colorMonto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="fecha" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}
                      formatter={(value: number) => [`$${value.toFixed(1)}M`, 'Monto']} />
                    <Area type="monotone" dataKey="monto" stroke="var(--chart-1)" strokeWidth={2} fillOpacity={1} fill="url(#colorMonto)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="mb-4">Montos por Region (millones CLP)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={regionMontos}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="region" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}
                      formatter={(value: number) => [`$${value.toFixed(1)}M`, 'Monto']} />
                    <Line type="monotone" dataKey="monto" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left">Codigo</th>
                    <th className="px-6 py-3 text-left">Producto</th>
                    <th className="px-6 py-3 text-left">Proveedor</th>
                    <th className="px-6 py-3 text-left">Estado</th>
                    <th className="px-6 py-3 text-left">Region</th>
                    <th className="px-6 py-3 text-right">Items</th>
                    <th className="px-6 py-3 text-right">Monto</th>
                    <th className="px-6 py-3 text-left">Emision</th>
                    <th className="px-6 py-3 text-center">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ordenesCompra.map(orden => (
                    <tr key={orden.codigo} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4"><span className="font-mono text-sm">{orden.codigo}</span></td>
                      <td className="px-6 py-4 max-w-xs"><p className="line-clamp-2 text-sm">{orden.producto}</p></td>
                      <td className="px-6 py-4"><span className="text-sm">{orden.proveedor}</span></td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-sm text-white"
                          style={{ backgroundColor: ESTADO_COLORS[orden.estado] ?? '#6b7280' }}>
                          {orden.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{orden.region}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm">{orden.cantidad}</td>
                      <td className="px-6 py-4 text-right text-sm">{formatCurrency(orden.monto)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{formatDate(orden.fechaEmision)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <a href={orden.urlDetalle} target="_blank" rel="noopener noreferrer"
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

      {hasSearched && !isLoading && !error && ordenesCompra.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-lg">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="mb-2">No se encontraron ordenes de compra</h3>
          <p className="text-muted-foreground">Intenta ajustar los filtros de busqueda</p>
        </div>
      )}
    </div>
  );
}

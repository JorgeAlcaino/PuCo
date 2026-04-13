import { useState, useMemo } from 'react';
import { Search, Hospital, Filter, ChevronDown, ChevronUp, MapPin, Building2, Activity, Info } from 'lucide-react';
import { ESTABLECIMIENTOS, type Establecimiento } from '../data/establecimientos';

const REGIONES = ['Todas', ...Array.from(new Set(ESTABLECIMIENTOS.map(e => e.region))).sort()];
const TIPOS = ['Todos', ...Array.from(new Set(ESTABLECIMIENTOS.map(e => e.tipo))).sort()];
const SISTEMAS = ['Todos', ...Array.from(new Set(ESTABLECIMIENTOS.map(e => e.sistema))).sort()];

const SISTEMA_COLORS: Record<string, string> = {
  'Público': '#3b82f6',
  'Fuerzas Armadas y de Orden': '#ef4444',
};

const COMPLEJIDAD_COLORS: Record<string, string> = {
  'Alta Complejidad': '#ef4444',
  'Mediana Complejidad': '#f59e0b',
  'Baja Complejidad': '#10b981',
  'Pendiente': '#6b7280',
};

export function EstablecimientosSalud() {
  const [busqueda, setBusqueda] = useState('');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [sistemaFilter, setSistemaFilter] = useState('Todos');
  const [showFilters, setShowFilters] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const q = busqueda.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return ESTABLECIMIENTOS.filter(e => {
      if (regionFilter !== 'Todas' && e.region !== regionFilter) return false;
      if (tipoFilter !== 'Todos' && e.tipo !== tipoFilter) return false;
      if (sistemaFilter !== 'Todos' && e.sistema !== sistemaFilter) return false;
      if (q) {
        const target = (e.nombre + ' ' + e.comuna + ' ' + e.tipo)
          .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!target.includes(q)) return false;
      }
      return true;
    });
  }, [busqueda, regionFilter, tipoFilter, sistemaFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage]
  );

  const handleSearch = () => setCurrentPage(1);

  const stats = useMemo(() => {
    const porSistema: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    ESTABLECIMIENTOS.forEach(e => {
      porSistema[e.sistema] = (porSistema[e.sistema] || 0) + 1;
      porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
    });
    return { porSistema, porTipo };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Establecimientos de Salud</h1>
        <p className="text-muted-foreground mt-1">
          Directorio de {ESTABLECIMIENTOS.length.toLocaleString('es-CL')} establecimientos del sistema de salud chileno.
          Este listado es usado como filtro en las búsquedas de Licitaciones y Órdenes de Compra.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-blue-600 dark:text-blue-400">¿Cómo funciona el filtro de establecimientos?</p>
          <p className="text-muted-foreground">
            Al activar <strong>"Solo establecimientos de salud"</strong> en Licitaciones u Órdenes de Compra,
            los resultados se filtran para mostrar únicamente aquellos cuyo organismo comprador coincide con
            algún establecimiento de este listado. La coincidencia es por nombre (normalizado, sin tildes,
            sin distinción de mayúsculas).
          </p>
          <p className="text-muted-foreground">
            Fuente: Registro de Establecimientos de Salud del MINSAL. Se incluyen establecimientos públicos
            y de Fuerzas Armadas y de Orden.
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-lg"><Hospital className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl">{ESTABLECIMIENTOS.length.toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-500/10 rounded-lg"><Building2 className="w-5 h-5 text-green-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Públicos</p>
              <p className="text-2xl">{(stats.porSistema['Público'] || 0).toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 rounded-lg"><Building2 className="w-5 h-5 text-red-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">FFAA y de Orden</p>
              <p className="text-2xl">{(stats.porSistema['Fuerzas Armadas y de Orden'] || 0).toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 rounded-lg"><Activity className="w-5 h-5 text-purple-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Tipos distintos</p>
              <p className="text-2xl">{Object.keys(stats.porTipo).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre, tipo o comuna..."
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); handleSearch(); }}
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
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
              <div>
                <label className="block text-sm mb-2">Región</label>
                <select
                  value={regionFilter}
                  onChange={(e) => { setRegionFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Tipo de establecimiento</label>
                <select
                  value={tipoFilter}
                  onChange={(e) => { setTipoFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Sistema de salud</label>
                <select
                  value={sistemaFilter}
                  onChange={(e) => { setSistemaFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SISTEMAS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} de {filtered.length.toLocaleString('es-CL')} establecimientos
        </p>
        {totalPages > 1 && (
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm"
            >
              ←
            </button>
            <span className="text-sm text-muted-foreground">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm"
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Sistema</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Región</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Comuna</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Complejidad</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((e: Establecimiento, i: number) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{e.nombre}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {e.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: SISTEMA_COLORS[e.sistema] ?? '#6b7280' }}
                    >
                      {e.sistema}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {e.region.replace('Región de ', '').replace('Región del ', '').replace('Región Metropolitana de Santiago', 'Metropolitana')}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{e.comuna}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span
                      className="text-xs font-medium"
                      style={{ color: COMPLEJIDAD_COLORS[e.complejidad] ?? '#6b7280' }}
                    >
                      {e.complejidad}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 items-center justify-center">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm"
          >
            «
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm"
          >
            ←
          </button>
          <span className="text-sm text-muted-foreground px-4">Página {currentPage} de {totalPages}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm"
          >
            →
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}

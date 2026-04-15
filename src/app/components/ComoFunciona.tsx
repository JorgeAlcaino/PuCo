import { useState, useMemo } from 'react';
import { Search, Hospital, Filter, ChevronDown, ChevronUp, MapPin, Building2, Activity, Info, FileText, ShoppingCart, KeyRound, CheckCircle2, HelpCircle, ExternalLink } from 'lucide-react';
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

export function ComoFunciona() {
  // Establecimientos directory state
  const [busqueda, setBusqueda] = useState('');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [sistemaFilter, setSistemaFilter] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);
  const [showDirectorio, setShowDirectorio] = useState(false);
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1>¿Cómo funciona?</h1>
        <p className="text-muted-foreground mt-1">
          Guía completa de la plataforma de consulta del Mercado Público
        </p>
      </div>

      {/* Qué es esta plataforma */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          ¿Qué es esta plataforma?
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Esta aplicación te permite consultar en tiempo real las <strong>licitaciones</strong> y <strong>órdenes de compra</strong> publicadas
          en el <a href="https://www.mercadopublico.cl" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Mercado Público de Chile <ExternalLink className="w-3 h-3" /></a>,
          la plataforma de compras del Estado. Primero haces una búsqueda en la API y después puedes refinar lo ya cargado con un buscador secundario debajo de la lista de resultados. También puedes exportar a CSV lo que estás viendo.
        </p>
      </section>

      {/* API Key */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-yellow-500" />
          Paso 1: Configura tu API Key
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Para realizar búsquedas necesitas una <strong>API key (ticket)</strong> del Mercado Público.
          Puedes obtener una gratuitamente en el portal de desarrolladores de Mercado Público.
        </p>
        <div className="flex gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm">
          <Info className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Haz clic en el ícono de <strong>llave</strong> en la barra superior para ingresar tu API key.
            Aparecerá un <CheckCircle2 className="w-4 h-4 text-green-500 inline" /> cuando esté configurada correctamente.
          </p>
        </div>
      </section>

      {/* Licitaciones */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          Licitaciones
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          En la pestaña <strong>Licitaciones</strong> puedes buscar las licitaciones públicas y privadas del Estado.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Búsqueda</h3>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>Escribe un <strong>nombre</strong> o <strong>palabra clave</strong> en el buscador principal para consultar la API por texto</li>
              <li>Escribe un <strong>código de licitación</strong> (ej: <code className="bg-muted px-1 rounded">1057403-22-LE24</code>) para ir directo al resultado</li>
              <li>Si no escribes texto, se listarán todas las licitaciones del rango de fechas seleccionado</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Filtros disponibles</h3>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li><strong>Estado:</strong> Publicada, Adjudicada, Cerrada, Desierta, etc.</li>
              <li><strong>Tipo:</strong> L1, LE, LP, LQ, LR (públicas), E2, CO, B2, H2, I2 (privadas)</li>
              <li><strong>Región:</strong> filtra por la región de la unidad compradora</li>
              <li><strong>Desde / Hasta:</strong> selecciona un rango de fechas para buscar en múltiples días a la vez. Si solo completas "Desde", se busca ese día.</li>
              <li><strong>Solo establecimientos de salud:</strong> filtra los resultados para mostrar solo compras del sector salud</li>
            </ul>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium text-sm">Refinar resultados</h3>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>Debajo de la tabla aparece un <strong>buscador secundario</strong> para filtrar solo entre los resultados ya cargados.</li>
            <li>Ese filtro no vuelve a consultar la API; solo recorta la lista que ya está en pantalla.</li>
            <li>La paginación, los gráficos y el CSV usan esa lista filtrada.</li>
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">
          Haz clic en cualquier fila para ver el <strong>detalle completo</strong> de la licitación: descripción, montos, fechas, organismo comprador, etc. El botón <strong>Exportar CSV</strong> descarga lo que estás viendo después de aplicar el filtro secundario.
        </p>
      </section>

      {/* Órdenes de Compra */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-green-500" />
          Órdenes de Compra
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          En la pestaña <strong>Órdenes de Compra</strong> puedes buscar las órdenes emitidas a proveedores del Estado.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Búsqueda</h3>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>Escribe un <strong>producto</strong> o <strong>palabra clave</strong> en el buscador principal para consultar la API</li>
              <li>Escribe un <strong>código de OC</strong> (ej: <code className="bg-muted px-1 rounded">750301-80-SE24</code>) para buscar directamente</li>
              <li>Sin texto, se listan todas las OC del rango de fechas seleccionado</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Filtros disponibles</h3>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li><strong>Estado:</strong> Enviada al Proveedor, Aceptada, Cancelada, Recepción Conforme, etc.</li>
              <li><strong>Tipo OC:</strong> SE (Sin emisión automática), CM (Convenio Marco), AG (Compra ágil), TD (Trato directo), CC (Compra coordinada)</li>
              <li><strong>Región:</strong> filtra por la región del organismo comprador</li>
              <li><strong>Desde / Hasta:</strong> rango de fechas para consultar múltiples días. Sin fecha, se usa el día actual.</li>
              <li><strong>Solo establecimientos de salud:</strong> filtra las OC cuyo comprador coincide con el directorio de salud</li>
            </ul>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium text-sm">Refinar resultados</h3>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>Después de buscar, aparece un <strong>buscador extra debajo de la tabla</strong> para filtrar la lista ya obtenida.</li>
            <li>Ese buscador solo trabaja en memoria sobre los resultados visibles.</li>
            <li>La tabla, la paginación y el CSV respetan ese refinado adicional.</li>
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">
          Al expandir una fila verás el detalle: proveedor, montos, tipo de despacho, forma de pago y más.
          El enlace <strong>"Ver en Mercado Público"</strong> te lleva directamente a la ficha oficial, y el CSV exporta la lista ya filtrada en pantalla.
        </p>
      </section>

      {/* Filtro de establecimientos de salud */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Hospital className="w-5 h-5 text-red-500" />
          Filtro de Establecimientos de Salud
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Tanto en Licitaciones como en Órdenes de Compra encontrarás el checkbox
          <strong> "Solo establecimientos de salud"</strong>. Al activarlo, los resultados se filtran
          para mostrar únicamente compras cuyo organismo coincida con alguno de los
          <strong> {ESTABLECIMIENTOS.length.toLocaleString('es-CL')} establecimientos</strong> del directorio de salud chileno.
        </p>
        <div className="flex gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
          <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-muted-foreground space-y-1">
            <p>
              La coincidencia se realiza por <strong>palabras clave</strong> del nombre del establecimiento
              sobre el nombre de la licitación o el producto de la orden de compra. La comparación se normaliza
              para ignorar tildes y mayúsculas.
            </p>
            <p>
              Fuente: Registro de Establecimientos de Salud del MINSAL. Incluye establecimientos públicos
              y de Fuerzas Armadas y de Orden.
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          En resumen: primero filtras la búsqueda principal en la API, luego puedes usar el buscador secundario para recortar lo ya cargado sin volver a consultar el servidor.
        </p>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 rounded-lg"><Hospital className="w-5 h-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl">{ESTABLECIMIENTOS.length.toLocaleString('es-CL')}</p>
              </div>
            </div>
          </div>
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/10 rounded-lg"><Building2 className="w-5 h-5 text-green-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Públicos</p>
                <p className="text-2xl">{(stats.porSistema['Público'] || 0).toLocaleString('es-CL')}</p>
              </div>
            </div>
          </div>
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/10 rounded-lg"><Building2 className="w-5 h-5 text-red-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">FFAA y de Orden</p>
                <p className="text-2xl">{(stats.porSistema['Fuerzas Armadas y de Orden'] || 0).toLocaleString('es-CL')}</p>
              </div>
            </div>
          </div>
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 rounded-lg"><Activity className="w-5 h-5 text-purple-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Tipos distintos</p>
                <p className="text-2xl">{Object.keys(stats.porTipo).length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible directory */}
        <button
          onClick={() => setShowDirectorio(!showDirectorio)}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          {showDirectorio ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showDirectorio ? 'Ocultar directorio completo' : 'Ver directorio completo de establecimientos'}
        </button>

        {showDirectorio && (
          <div className="space-y-4 pt-2">
            {/* Búsqueda y filtros */}
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, tipo o comuna..."
                    value={busqueda}
                    onChange={(e) => { setBusqueda(e.target.value); setCurrentPage(1); }}
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

            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} de {filtered.length.toLocaleString('es-CL')} establecimientos
              </p>
              {totalPages > 1 && (
                <div className="flex gap-2 items-center">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm">←</button>
                  <span className="text-sm text-muted-foreground">{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm">→</button>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="border border-border rounded-lg overflow-hidden">
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
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{e.tipo}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: SISTEMA_COLORS[e.sistema] ?? '#6b7280' }}>{e.sistema}</span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {e.region.replace('Región de ', '').replace('Región del ', '').replace('Región Metropolitana de Santiago', 'Metropolitana')}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{e.comuna}</td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-xs font-medium" style={{ color: COMPLEJIDAD_COLORS[e.complejidad] ?? '#6b7280' }}>{e.complejidad}</span>
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
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                  className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm">«</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm">←</button>
                <span className="text-sm text-muted-foreground px-4">Página {currentPage} de {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm">→</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-40 text-sm">»</button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

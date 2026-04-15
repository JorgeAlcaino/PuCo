import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import { useApiKey } from '../context/ApiKeyContext';
import { matchesEstablecimiento } from '../data/establecimientos';
import { Search, Filter, TrendingUp, Calendar, DollarSign, Package, ChevronDown, ChevronUp, CheckCircle2, Loader2, ExternalLink, Download, AlertCircle, ChevronRight, Building2, MapPin, Truck, CreditCard, Hash, Clock, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  backoffDelayMs,
  createSearchError,
  delay,
  fetchWithRetry,
  isAbortError,
  isRecoverableErrorMessage,
  PollData,
  PollPartial,
  SearchRequestError,
} from './searchResilience';
import { loadSearchSnapshot, saveSearchSnapshot } from './searchPersistence';

const ESTADO_COLORS: Record<string, string> = {
  'Enviada al Proveedor': '#3b82f6',
  'Aceptada': '#10b981',
  'Cancelada': '#ef4444',
  'Anulada': '#dc2626',
  'Recepción Conforme': '#8b5cf6',
  'Recepción Incompleta': '#f97316',
  'Pendiente': '#f59e0b',
  'Parcialmente Recepcionada': '#6366f1',
  'En Proceso': '#06b6d4',
  'Recibida': '#84cc16',
};

const TIPOS_OC = [
  { value: '', label: 'Todos los tipos' },
  { value: 'SE', label: 'Sin emisión automática' },
  { value: 'CM', label: 'Convenio Marco' },
  { value: 'AG', label: 'Compra ágil' },
  { value: 'TD', label: 'Trato directo' },
  { value: 'CC', label: 'Compra coordinada' },
];

const ORDENES_STORAGE_KEY = 'puco.ordenes.last-search.v1';
const MAX_AUTO_RETRIES = 3;

const TIPO_OC_LABEL_BY_CODE: Record<string, string> = TIPOS_OC.reduce((acc, item) => {
  if (item.value) acc[item.value] = item.label;
  return acc;
}, {} as Record<string, string>);

const REGIONES = [
  { value: '', label: 'Todas las regiones' },
  { value: 'Arica y Parinacota', label: 'Arica y Parinacota' },
  { value: 'Tarapacá', label: 'Tarapacá' },
  { value: 'Antofagasta', label: 'Antofagasta' },
  { value: 'Atacama', label: 'Atacama' },
  { value: 'Coquimbo', label: 'Coquimbo' },
  { value: 'Valparaíso', label: 'Valparaíso' },
  { value: 'Metropolitana', label: 'Metropolitana' },
  { value: "O'Higgins", label: "O'Higgins" },
  { value: 'Maule', label: 'Maule' },
  { value: 'Ñuble', label: 'Ñuble' },
  { value: 'Biobío', label: 'Biobío' },
  { value: 'La Araucanía', label: 'La Araucanía' },
  { value: 'Los Ríos', label: 'Los Ríos' },
  { value: 'Los Lagos', label: 'Los Lagos' },
  { value: 'Aysén', label: 'Aysén' },
  { value: 'Magallanes', label: 'Magallanes' },
];

const normalizeSearchText = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const REGION_BY_CODE: Record<string, string> = {
  '1': 'Tarapacá',
  '2': 'Antofagasta',
  '3': 'Atacama',
  '4': 'Coquimbo',
  '5': 'Valparaíso',
  '6': "O'Higgins",
  '7': 'Maule',
  '8': 'Biobío',
  '9': 'La Araucanía',
  '10': 'Los Lagos',
  '11': 'Aysén',
  '12': 'Magallanes',
  '13': 'Metropolitana',
  '14': 'Los Ríos',
  '15': 'Arica y Parinacota',
  '16': 'Ñuble',
};

const REGION_ALIAS_TO_NAME: Record<string, string> = {
  'tarapaca': 'Tarapacá',
  'antofagasta': 'Antofagasta',
  'atacama': 'Atacama',
  'coquimbo': 'Coquimbo',
  'valparaiso': 'Valparaíso',
  'o higgins': "O'Higgins",
  'ohiggins': "O'Higgins",
  'maule': 'Maule',
  'biobio': 'Biobío',
  'la araucania': 'La Araucanía',
  'araucania': 'La Araucanía',
  'los lagos': 'Los Lagos',
  'aysen': 'Aysén',
  'magallanes': 'Magallanes',
  'metropolitana': 'Metropolitana',
  'rm': 'Metropolitana',
  'region metropolitana': 'Metropolitana',
  'los rios': 'Los Ríos',
  'arica y parinacota': 'Arica y Parinacota',
  'nuble': 'Ñuble',
};

const normalizeRegionName = (value?: string) => {
  if (!value) return '';
  const raw = value.trim();
  if (!raw) return '';

  if (/^\d{1,2}$/.test(raw)) {
    const regionByCode = REGION_BY_CODE[String(Number(raw))];
    if (regionByCode) return regionByCode;
  }

  const numberMatch = raw.match(/\b(\d{1,2})\b/);
  if (numberMatch) {
    const regionByCode = REGION_BY_CODE[String(Number(numberMatch[1]))];
    if (regionByCode) return regionByCode;
  }

  const normalized = normalizeSearchText(raw)
    .replace(/[.'’]/g, ' ')
    .replace(/^region de la\s+/, '')
    .replace(/^region del\s+/, '')
    .replace(/^region de\s+/, '')
    .replace(/^region\s+/, '')
    .replace(/republica de chile/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (REGION_ALIAS_TO_NAME[normalized]) return REGION_ALIAS_TO_NAME[normalized];

  const byContains = Object.entries(REGION_ALIAS_TO_NAME).find(([alias]) => normalized.includes(alias));
  if (byContains) return byContains[1];

  return raw;
};

const getOrdenTipoLabel = (tipo?: string, tipoDescripcion?: string) => {
  const desc = (tipoDescripcion || '').trim();
  if (desc) return desc;
  const code = (tipo || '').trim().toUpperCase();
  if (TIPO_OC_LABEL_BY_CODE[code]) return TIPO_OC_LABEL_BY_CODE[code];
  return (tipo || '').trim() || 'Tipo no informado';
};

interface OrdenCompra {
  codigo: string;
  producto: string;
  estado: string;
  tipo: string;
  tipoDescripcion?: string;
  // Detail fields (only available when fetching by código)
  descripcion?: string;
  proveedor?: string;
  rutProveedor?: string;
  organismo?: string;
  estadoProveedor?: string;
  tipoMoneda?: string;
  monto?: number;
  totalNeto?: number;
  impuestos?: number;
  descuentos?: number;
  cargos?: number;
  cantidad?: number;
  fechaCreacion?: string;
  fechaEmision?: string;
  fechaAceptacion?: string;
  fechaCancelacion?: string;
  fechaUltimaModificacion?: string;
  region?: string;
  comunaComprador?: string;
  tipoDespacho?: string;
  formaPago?: string;
  financiamiento?: string;
  codigoLicitacion?: string;
  urlDetalle: string;
}

interface OrdenesSearchFilters {
  busqueda: string;
  codigo: string;
  estado: string;
  region: string;
  tipo: string;
  sortField: string;
  sortOrder: string;
  fechaInicio: string;
  fechaFin: string;
  soloEstablecimientos: boolean;
}

async function fetchOrdenesCompra(
  filtros: OrdenesSearchFilters,
  apiKey: string,
  signal?: AbortSignal,
  onPending?: () => void,
  onPartial?: (data: PollPartial<OrdenCompra>) => void,
): Promise<PollData<OrdenCompra>> {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.codigo) params.set('codigo', filtros.codigo);
  if (filtros.estado && filtros.estado !== 'Todos') params.set('estado', filtros.estado);
  if (filtros.region && filtros.region !== 'Todas') params.set('region', filtros.region);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.fechaInicio) params.set('fechaInicio', filtros.fechaInicio);
  if (filtros.fechaFin) params.set('fechaFin', filtros.fechaFin);
  params.set('sortField', filtros.sortField);
  params.set('sortOrder', filtros.sortOrder);

  const headers: Record<string, string> = {};
  if (apiKey) headers['X-MP-Ticket'] = apiKey;

  const resp = await fetchWithRetry(`/api/ordenes-compra?${params.toString()}`, { signal, headers }, 2);

  if (resp.status === 202) {
    type JobPollPayload = {
      error?: string;
      status?: string;
      partial?: PollPartial<OrdenCompra>;
      data?: PollData<OrdenCompra>;
      recoverable?: boolean;
    };

    const pendingData = await resp.json().catch(() => ({} as { jobId?: string }));
    const jobId = pendingData?.jobId as string | undefined;
    if (!jobId) {
      throw new Error('No se recibió un identificador de job válido. Intenta nuevamente.');
    }

    onPending?.();

    let pollIntervalMs = 1200;
    let transientPollFailures = 0;

    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await delay(pollIntervalMs);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      try {
        const poll = await fetchWithRetry(`/api/jobs/${encodeURIComponent(jobId)}`, { signal, headers }, 1);
        const pollData = await poll.json().catch(() => ({} as JobPollPayload));

        if (!poll.ok) {
          if (poll.status === 404 && transientPollFailures < 2) {
            transientPollFailures += 1;
            continue;
          }
          if (poll.status === 404) {
            throw new Error('La búsqueda expiró o el servidor se reinició. Vuelve a ejecutar la búsqueda.');
          }
          throw new Error((pollData as { error?: string }).error || `Error HTTP ${poll.status} al consultar el estado de la búsqueda`);
        }

        if (pollData.status === 'done') {
          transientPollFailures = 0;
          return pollData.data || { total: 0, listado: [] };
        }
        if (pollData.status === 'error') {
          throw createSearchError<OrdenCompra>(pollData.error || 'Error del servidor', {
            partial: pollData.partial,
            data: pollData.data,
            recoverable: pollData.recoverable,
          });
        }
        if (pollData.partial) {
          onPartial?.(pollData.partial);
        }

        transientPollFailures = 0;
        pollIntervalMs = Math.min(3000, pollIntervalMs + 200);
      } catch (err) {
        if (isAbortError(err)) throw err;

        const searchErr = err as SearchRequestError<OrdenCompra>;
        if (searchErr.partial || searchErr.data || typeof searchErr.recoverable === 'boolean') {
          throw err;
        }

        transientPollFailures += 1;
        if (transientPollFailures <= 3) {
          await delay(backoffDelayMs(transientPollFailures - 1, 300, 2500));
          continue;
        }
        throw err;
      }
    }
  }

  const data = await resp.json().catch(() => ({} as PollData<OrdenCompra> & { error?: string }));
  if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
  return data as PollData<OrdenCompra>;
}

function exportCSV(ordenes: OrdenCompra[]) {
  const headers = ['Código', 'Producto', 'Estado', 'Tipo', 'Región'];
  const rows = ordenes.map(o => [
    o.codigo,
    o.producto,
    o.estado,
    getOrdenTipoLabel(o.tipo, o.tipoDescripcion),
    normalizeRegionName(o.region),
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ordenes_compra_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface OrdenCompraDetail extends OrdenCompra {
  _loaded: true;
}

async function fetchOCDetail(codigo: string, apiKey: string, retries = 2): Promise<OrdenCompraDetail> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-MP-Ticket'] = apiKey;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetchWithRetry(`/api/orden-compra/${encodeURIComponent(codigo)}`, { headers }, 1);
      if (resp.status === 504 || resp.status === 429) {
        if (attempt < retries) {
          await delay(backoffDelayMs(attempt, 700, 5000));
          continue;
        }
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
      return { ...data, _loaded: true };
    } catch (err) {
      if (attempt < retries && !isAbortError(err)) {
        await delay(backoffDelayMs(attempt, 700, 5000));
        continue;
      }
      throw err;
    }
  }

  throw new Error('No se pudo cargar el detalle tras varios intentos');
}

export function OrdenesCompra() {
  const { apiKey } = useApiKey();
  const [busqueda, setBusqueda] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [tipoFilter, setTipoFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [sortField, setSortField] = useState<'codigo' | 'producto'>('codigo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(true);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [soloEstablecimientos, setSoloEstablecimientos] = useState(false);
  const [filtroResultados, setFiltroResultados] = useState('');

  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadingProgress, setLoadingProgress] = useState<{ progress: number; totalDays: number } | null>(null);

  // Detail panel
  const [expandedCodigo, setExpandedCodigo] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<OrdenCompraDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const regionHydrationAttemptedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const autoRetryTimerRef = useRef<number | null>(null);
  const autoRetryCountRef = useRef(0);
  const lastStableResultsRef = useRef<OrdenCompra[]>([]);

  const estados = ['Todos', 'Enviada al Proveedor', 'Aceptada', 'Cancelada', 'Recepción Conforme', 'Pendiente', 'Parcialmente Recepcionada', 'Recepción Incompleta'];

  const persistSnapshot = useCallback((filters: OrdenesSearchFilters, list: OrdenCompra[], warningMessage?: string) => {
    saveSearchSnapshot<OrdenesSearchFilters, OrdenCompra>(ORDENES_STORAGE_KEY, {
      timestamp: Date.now(),
      filters,
      listado: list,
      total: list.length,
      warning: warningMessage,
    });
  }, []);

  useEffect(() => {
    const snapshot = loadSearchSnapshot<OrdenesSearchFilters, OrdenCompra>(ORDENES_STORAGE_KEY);
    if (!snapshot) return;

    setBusqueda(snapshot.filters.codigo || snapshot.filters.busqueda || '');
    setEstadoFilter(snapshot.filters.estado || 'Todos');
    setTipoFilter(snapshot.filters.tipo || '');
    setRegionFilter(snapshot.filters.region || '');
    setSortField((snapshot.filters.sortField as 'codigo' | 'producto') || 'codigo');
    setSortOrder((snapshot.filters.sortOrder as 'asc' | 'desc') || 'desc');
    setFechaInicio(snapshot.filters.fechaInicio || '');
    setFechaFin(snapshot.filters.fechaFin || '');
    setSoloEstablecimientos(Boolean(snapshot.filters.soloEstablecimientos));

    if (snapshot.listado.length > 0) {
      setOrdenesCompra(snapshot.listado);
      lastStableResultsRef.current = snapshot.listado;
      setHasSearched(true);
      if (snapshot.warning) {
        setWarning(`Resultados restaurados: ${snapshot.warning}`);
      }
    }
  }, []);

  useEffect(() => () => {
    if (autoRetryTimerRef.current !== null) {
      window.clearTimeout(autoRetryTimerRef.current);
    }
    abortRef.current?.abort();
  }, []);

  const handleBuscar = async () => {
    if (autoRetryTimerRef.current !== null) {
      window.clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setIsSlow(false);
    setHasSearched(true);
    setError('');
    setWarning('');
    setCurrentPage(1);
    setFiltroResultados('');
    setExpandedCodigo(null);
    setDetailData(null);
    setLoadingProgress(null);
    regionHydrationAttemptedRef.current.clear();

    const isCodigo = /^\d+-\d+-[A-Za-z]{2}\d+$/.test(busqueda.trim());
    const searchFilters: OrdenesSearchFilters = {
      busqueda: isCodigo ? '' : busqueda,
      codigo: isCodigo ? busqueda.trim() : '',
      estado: estadoFilter,
      region: regionFilter,
      tipo: tipoFilter,
      sortField,
      sortOrder,
      fechaInicio,
      fechaFin,
      soloEstablecimientos,
    };

    const filterEstab = (list: OrdenCompra[]) =>
      soloEstablecimientos
        ? list.filter(o => matchesEstablecimiento(o.producto) || (o.organismo ? matchesEstablecimiento(o.organismo) : false))
        : list;

    const applyAndPersist = (list: OrdenCompra[], warningMessage?: string) => {
      const filtered = filterEstab(list);
      setOrdenesCompra(filtered);
      if (filtered.length > 0) {
        lastStableResultsRef.current = filtered;
        persistSnapshot(searchFilters, filtered, warningMessage);
      }
      return filtered;
    };

    try {
      const result = await fetchOrdenesCompra({
        ...searchFilters,
      }, apiKey, controller.signal, () => setIsSlow(true), (partial) => {
        setLoadingProgress({ progress: partial.progress, totalDays: partial.totalDays });
        applyAndPersist(partial.listado, partial.warning);
        if (partial.warning) {
          setWarning(partial.warning);
        }
      });
      applyAndPersist(result.listado, result.warning);
      autoRetryCountRef.current = 0;
      if (result.warning) {
        setWarning(result.warning);
      }
    } catch (err: unknown) {
      if (isAbortError(err)) return;

      const message = err instanceof Error ? err.message : 'Error desconocido';
      const searchErr = err as SearchRequestError<OrdenCompra>;
      const fallback = searchErr.data?.listado || searchErr.partial?.listado || lastStableResultsRef.current;
      const recoverable = typeof searchErr.recoverable === 'boolean'
        ? searchErr.recoverable
        : isRecoverableErrorMessage(message);

      if (fallback && fallback.length > 0) {
        applyAndPersist(fallback, message);
        setWarning('Mostrando el último resultado disponible mientras reintentamos.');
      }

      if (recoverable && autoRetryCountRef.current < MAX_AUTO_RETRIES) {
        autoRetryCountRef.current += 1;
        const retryDelay = backoffDelayMs(autoRetryCountRef.current - 1, 1200, 10000);
        setError(`${message} Reintentando automáticamente (${autoRetryCountRef.current}/${MAX_AUTO_RETRIES})...`);
        autoRetryTimerRef.current = window.setTimeout(() => {
          autoRetryTimerRef.current = null;
          handleBuscar();
        }, retryDelay);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
      setIsSlow(false);
      setLoadingProgress(null);
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
      const detail = await fetchOCDetail(codigo, apiKey);
      setDetailData(detail);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Error al cargar detalle');
    } finally {
      setDetailLoading(false);
    }
  }, [expandedCodigo, apiKey]);

  const ordenesFiltradas = useMemo(() => {
    const q = normalizeSearchText(filtroResultados.trim());
    if (!q) return ordenesCompra;

    return ordenesCompra.filter(orden =>
      normalizeSearchText([
        orden.producto,
        orden.codigo,
        orden.proveedor,
        orden.organismo,
        orden.region,
        orden.tipo,
        orden.tipoDescripcion,
      ].filter(Boolean).join(' ')).includes(q)
    );
  }, [ordenesCompra, filtroResultados]);

  const estadoStats = useMemo(() => {
    const stats: Record<string, number> = {};
    ordenesFiltradas.forEach(o => { stats[o.estado] = (stats[o.estado] || 0) + 1; });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [ordenesFiltradas]);

  const tipoStats = useMemo(() => {
    const stats: Record<string, { name: string; count: number; code: string }> = {};
    ordenesFiltradas.forEach(o => {
      const code = (o.tipo || '').trim().toUpperCase();
      const name = getOrdenTipoLabel(o.tipo, o.tipoDescripcion);
      if (!stats[name]) {
        stats[name] = { name, count: 0, code };
      }
      stats[name].count += 1;
    });
    return Object.values(stats)
      .sort((a, b) => b.count - a.count);
  }, [ordenesFiltradas]);

  const totalPages = Math.max(1, Math.ceil(ordenesFiltradas.length / pageSize));
  const paginated = useMemo(
    () => ordenesFiltradas.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [ordenesFiltradas, currentPage, pageSize]
  );

  useEffect(() => {
    if (!apiKey || paginated.length === 0) return;

    const missingRegionRows = paginated
      .filter(orden => !normalizeRegionName(orden.region) && orden.codigo)
      .filter(orden => !regionHydrationAttemptedRef.current.has(orden.codigo))
      .slice(0, 6);

    if (missingRegionRows.length === 0) return;

    missingRegionRows.forEach((orden) => {
      regionHydrationAttemptedRef.current.add(orden.codigo);
      fetchOCDetail(orden.codigo, apiKey)
        .then((detail) => {
          const region = normalizeRegionName(detail.region);
          if (!region) return;
          setOrdenesCompra(prev => prev.map(item =>
            item.codigo === orden.codigo
              ? { ...item, region: detail.region || region }
              : item
          ));
        })
        .catch(() => {
          // Ignore row-level hydration errors to avoid blocking the list UI.
        });
    });
  }, [apiKey, paginated]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v);

  const formatDate = (d: string | undefined) => {
    if (!d) return '—';
    const date = new Date(d.length === 10 ? d + 'T12:00:00' : d);
    return date.toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const TIPO_OC_COLORS: Record<string, string> = {
    'SE': '#3b82f6',
    'CM': '#10b981',
    'AG': '#f59e0b',
    'TD': '#8b5cf6',
    'CC': '#ef4444',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Órdenes de Compra</h1>
          <p className="text-muted-foreground mt-1">Consulta órdenes de compra del Mercado Público en tiempo real</p>
        </div>
        {ordenesFiltradas.length > 0 && (
          <button onClick={() => exportCSV(ordenesFiltradas)}
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
              <input type="text" placeholder="Buscar por producto, código o proveedor..."
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
              <div>
                <label className="block text-sm mb-2">Estado</label>
                <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {estados.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Tipo de orden de compra</label>
                <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {TIPOS_OC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Región</label>
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  {REGIONES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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
                  min={fechaInicio || undefined}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm mb-2">Ordenar por</label>
                <select value={sortField} onChange={(e) => setSortField(e.target.value as 'codigo' | 'producto')}
                  className="w-full px-3 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="codigo">Código</option>
                  <option value="producto">Producto</option>
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
              <div className="flex items-center md:col-span-3">
                <label className="flex items-center gap-3 cursor-pointer select-none group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={soloEstablecimientos}
                      onChange={(e) => setSoloEstablecimientos(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${soloEstablecimientos ? 'bg-primary border-primary' : 'border-border bg-input-background group-hover:border-primary/60'}`}>
                      {soloEstablecimientos && (
                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium">
                    Solo establecimientos de salud
                  </span>
                  <span className="text-xs text-muted-foreground">
                    — filtra resultados por el directorio de establecimientos de salud públicos
                  </span>
                </label>
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

      {warning && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{warning}</p>
        </div>
      )}

      {!hasSearched && !error && (
        <div className="text-center py-16">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="mb-2">Configura tus filtros y presiona "Buscar"</h3>
          <p className="text-muted-foreground">Busca órdenes de compra por estado, tipo o fecha.</p>
        </div>
      )}

      {isLoading && ordenesCompra.length === 0 && (
        <div className="text-center py-16">
          <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
          <h3 className="mb-2">Consultando API del Mercado Público...</h3>
          {loadingProgress
            ? <p className="text-muted-foreground">Cargando día {loadingProgress.progress} de {loadingProgress.totalDays}...</p>
            : isSlow
              ? <p className="text-muted-foreground">La consulta puede tardar varios minutos, por favor espera...</p>
              : <p className="text-muted-foreground">Obteniendo órdenes de compra según tus filtros</p>
          }
        </div>
      )}

      {hasSearched && ordenesCompra.length > 0 && (
        <>
          {/* Banner de carga progresiva */}
          {isLoading && loadingProgress && (
            <div className="flex items-center gap-3 p-3 mb-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
              <span>Cargando día {loadingProgress.progress} de {loadingProgress.totalDays}... Mostrando {ordenesCompra.length} resultados parciales. Puedes navegar mientras tanto.</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg"><Package className="w-5 h-5 text-blue-500" /></div>
                <div><p className="text-sm text-muted-foreground">Total Órdenes</p><p className="text-2xl">{ordenesCompra.length}</p></div>
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
                <div className="p-3 bg-purple-500/10 rounded-lg"><TrendingUp className="w-5 h-5 text-purple-500" /></div>
                <div><p className="text-sm text-muted-foreground">Estados Distintos</p><p className="text-2xl">{estadoStats.length}</p></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-lg"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
                <div><p className="text-sm text-muted-foreground">Aceptadas</p><p className="text-2xl">{ordenesCompra.filter(o => o.estado === 'Aceptada').length}</p></div>
              </div>
            </div>
          </div>

          {ordenesFiltradas.length > 0 ? (
            <>
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
                        {tipoStats.map(t => <Cell key={`${t.name}-${t.code || 'na'}`} fill={TIPO_OC_COLORS[t.code] ?? '#8884d8'} />)}
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
                        <th className="px-4 py-3 text-left">Producto</th>
                        <th className="px-4 py-3 text-left">Estado</th>
                        <th className="px-4 py-3 text-left">Tipo</th>
                        <th className="px-4 py-3 text-left">Región</th>
                        <th className="px-4 py-3 text-center">Ver</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginated.map(orden => (
                        <Fragment key={orden.codigo}>
                          <tr onClick={() => toggleDetail(orden.codigo)}
                            className="hover:bg-muted/30 transition-colors cursor-pointer">
                            <td className="px-4 py-4">
                              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCodigo === orden.codigo ? 'rotate-90' : ''}`} />
                            </td>
                            <td className="px-4 py-4"><span className="font-mono text-sm">{orden.codigo}</span></td>
                            <td className="px-4 py-4 max-w-sm"><p className="line-clamp-2 text-sm">{orden.producto}</p></td>
                            <td className="px-4 py-4">
                              <span className="px-3 py-1 rounded-full text-sm text-white"
                                style={{ backgroundColor: ESTADO_COLORS[orden.estado] ?? '#6b7280' }}>
                                {orden.estado}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm px-2 py-1 rounded text-white"
                                style={{ backgroundColor: TIPO_OC_COLORS[orden.tipo] ?? '#6b7280' }}>
                                {getOrdenTipoLabel(orden.tipo, orden.tipoDescripcion)}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-muted-foreground">{normalizeRegionName(orden.region) || '—'}</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <a href={orden.urlDetalle} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </td>
                          </tr>
                          {expandedCodigo === orden.codigo && (
                            <tr key={`${orden.codigo}-detail`}>
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
                                  {detailData && detailData.codigo === orden.codigo && (
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
                                          <h5 className="text-sm font-medium flex items-center gap-2"><Building2 className="w-4 h-4" /> Comprador</h5>
                                          <div className="text-sm space-y-1">
                                            <p><span className="text-muted-foreground">Organismo:</span> {detailData.organismo || '—'}</p>
                                            <p><span className="text-muted-foreground">Región:</span> {normalizeRegionName(detailData.region) || '—'}</p>
                                            <p><span className="text-muted-foreground">Comuna:</span> {detailData.comunaComprador || '—'}</p>
                                          </div>
                                        </div>
                                        <div className="space-y-3">
                                          <h5 className="text-sm font-medium flex items-center gap-2"><Package className="w-4 h-4" /> Proveedor</h5>
                                          <div className="text-sm space-y-1">
                                            <p><span className="text-muted-foreground">Nombre:</span> {detailData.proveedor || '—'}</p>
                                            <p><span className="text-muted-foreground">RUT:</span> {detailData.rutProveedor || '—'}</p>
                                            <p><span className="text-muted-foreground">Estado:</span> {detailData.estadoProveedor || '—'}</p>
                                          </div>
                                        </div>
                                        <div className="space-y-3">
                                          <h5 className="text-sm font-medium flex items-center gap-2"><DollarSign className="w-4 h-4" /> Financiero</h5>
                                          <div className="text-sm space-y-1">
                                            <p><span className="text-muted-foreground">Monto Total:</span> {detailData.monto ? formatCurrency(detailData.monto) : '—'}</p>
                                            <p><span className="text-muted-foreground">Total Neto:</span> {detailData.totalNeto ? formatCurrency(detailData.totalNeto) : '—'}</p>
                                            <p><span className="text-muted-foreground">Impuestos:</span> {detailData.impuestos ? formatCurrency(detailData.impuestos) : '—'}</p>
                                            <p><span className="text-muted-foreground">Moneda:</span> {detailData.tipoMoneda || '—'}</p>
                                            <p><span className="text-muted-foreground">Items:</span> {detailData.cantidad ?? '—'}</p>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-3">
                                          <h5 className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> Fechas</h5>
                                          <div className="text-sm grid grid-cols-2 gap-1">
                                            <span className="text-muted-foreground">Creación:</span><span>{formatDate(detailData.fechaCreacion)}</span>
                                            <span className="text-muted-foreground">Emisión:</span><span>{formatDate(detailData.fechaEmision)}</span>
                                            <span className="text-muted-foreground">Aceptación:</span><span>{formatDate(detailData.fechaAceptacion)}</span>
                                            <span className="text-muted-foreground">Última modificación:</span><span>{formatDate(detailData.fechaUltimaModificacion)}</span>
                                          </div>
                                        </div>
                                        <div className="space-y-3">
                                          <h5 className="text-sm font-medium flex items-center gap-2"><Truck className="w-4 h-4" /> Despacho</h5>
                                          <div className="text-sm space-y-1">
                                            <p><span className="text-muted-foreground">Tipo despacho:</span> {detailData.tipoDespacho || '—'}</p>
                                          </div>
                                        </div>
                                        <div className="space-y-3">
                                          <h5 className="text-sm font-medium flex items-center gap-2"><CreditCard className="w-4 h-4" /> Pago</h5>
                                          <div className="text-sm space-y-1">
                                            <p><span className="text-muted-foreground">Forma pago:</span> {detailData.formaPago || '—'}</p>
                                            <p><span className="text-muted-foreground">Financiamiento:</span> {detailData.financiamiento || '—'}</p>
                                            {detailData.codigoLicitacion && (
                                              <p><span className="text-muted-foreground">Licitación:</span> {detailData.codigoLicitacion}</p>
                                            )}
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
                  <span>por página · {ordenesFiltradas.length} resultados</span>
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

              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  Filtrar resultados cargados
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={filtroResultados}
                    onChange={(e) => { setFiltroResultados(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar dentro de los resultados ya obtenidos..."
                    className="w-full pl-10 pr-4 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Este filtro solo actúa sobre la lista ya cargada.</p>
              </div>
            </>
          ) : (
            <div className="text-center py-16 bg-card border border-border rounded-lg space-y-4">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <div>
                <h3 className="mb-2">No hay coincidencias con el filtro adicional</h3>
                <p className="text-muted-foreground">La búsqueda principal ya cargó resultados, pero este filtro no encontró coincidencias.</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4 text-left space-y-2">
                <label className="block text-sm font-medium">Filtrar resultados cargados</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={filtroResultados}
                    onChange={(e) => { setFiltroResultados(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar dentro de los resultados ya obtenidos..."
                    className="w-full pl-10 pr-4 py-2 bg-input-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Borra este texto para volver a ver la lista completa.</p>
              </div>
            </div>
          )}
        </>
      )}

      {hasSearched && !isLoading && !error && ordenesCompra.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-lg">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="mb-2">No se encontraron órdenes de compra</h3>
          <p className="text-muted-foreground">Intenta ajustar los filtros de búsqueda</p>
        </div>
      )}
    </div>
  );
}

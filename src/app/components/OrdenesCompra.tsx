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

    const applyAndPersist = (list: OrdenCompra[], warningMessage?: string) => {
      setOrdenesCompra(list);
      if (list.length > 0) {
        lastStableResultsRef.current = list;
        persistSnapshot(searchFilters, list, warningMessage);
      }
      return list;
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
    let list = ordenesCompra;
    if (soloEstablecimientos) {
      list = list.filter(o => matchesEstablecimiento(o.producto) || (o.organismo ? matchesEstablecimiento(o.organismo) : false));
    }
    if (regionFilter) {
      list = list.filter(o => {
        const canonicalItemRegion = normalizeRegionName(o.region);
        return !canonicalItemRegion || canonicalItemRegion === regionFilter;
      });
    }
    const q = normalizeSearchText(filtroResultados.trim());
    if (!q) return list;

    return list.filter(orden =>
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
  }, [ordenesCompra, filtroResultados, soloEstablecimientos, regionFilter]);

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
      {/* ── Hero Header ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-600/10 via-card to-green-600/10 px-6 py-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Mercado Público · Tiempo real</span>
            </div>
            <h1 className="text-2xl font-bold">Órdenes de Compra</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Consulta y analiza órdenes de compra del Estado de Chile. Filtra por estado, tipo, región y fecha.
            </p>
          </div>
          {ordenesFiltradas.length > 0 && (
            <div className="flex gap-3">
              <button
                id="oc-export-btn"
                onClick={() => exportCSV(ordenesFiltradas)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Download className="h-4 w-4" /> Exportar CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Search + Filters ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {/* Keyword search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="oc-search-query"
              type="text"
              placeholder="Buscar por producto, código o proveedor…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Estado */}
          <select
            id="oc-filter-estado"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {estados.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          {/* Tipo */}
          <select
            id="oc-filter-tipo"
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {TIPOS_OC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {/* Región */}
          <select
            id="oc-filter-region"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {REGIONES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          {/* Fecha desde */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Desde</label>
            <input
              id="oc-filter-desde"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Fecha hasta */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Hasta</label>
            <input
              id="oc-filter-hasta"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              min={fechaInicio || undefined}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Sort field */}
          <select
            id="oc-sort-field"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as 'codigo' | 'producto')}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="codigo">Ordenar: Código</option>
            <option value="producto">Ordenar: Producto</option>
          </select>

          {/* Sort order + search button row */}
          <div className="flex gap-2 items-end lg:col-span-2">
            <select
              id="oc-sort-order"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </select>
            <button
              id="oc-search-btn"
              onClick={handleBuscar}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isLoading ? 'Consultando…' : 'Buscar'}
            </button>
          </div>

          {/* Solo establecimientos pill toggle — spans full width */}
          <div className="lg:col-span-4 pt-1 border-t border-border mt-1">
            <button
              id="oc-filter-establecimientos"
              type="button"
              onClick={() => setSoloEstablecimientos(v => !v)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                soloEstablecimientos
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-background border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-600'
              }`}
            >
              🏥 Solo establecimientos salud
            </button>
            {soloEstablecimientos && (
              <span className="ml-3 text-xs text-muted-foreground">
                — filtra por el directorio de establecimientos de salud públicos
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Error / Warning banners ───────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error en la búsqueda</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {warning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{warning}</p>
        </div>
      )}

      {/* ── Empty state (pre-search) ──────────────────────────────────────── */}
      {!hasSearched && !error && (
        <div className="text-center py-16">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h3 className="text-lg font-semibold mb-2">Configura tus filtros y presiona &quot;Buscar&quot;</h3>
          <p className="text-muted-foreground">Busca órdenes de compra por estado, tipo o fecha.</p>
        </div>
      )}

      {/* ── Skeleton loading ─────────────────────────────────────────────── */}
      {isLoading && ordenesCompra.length === 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-700 dark:text-emerald-300">
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            <span>
              {loadingProgress
                ? `Cargando día ${loadingProgress.progress} de ${loadingProgress.totalDays}…`
                : isSlow
                  ? 'La consulta puede tardar varios minutos, por favor espera…'
                  : 'Consultando API del Mercado Público…'
              }
            </span>
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Results section ───────────────────────────────────────────────── */}
      {hasSearched && ordenesCompra.length > 0 && (
        <>
          {/* Progressive load banner */}
          {isLoading && loadingProgress && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-blue-700 dark:text-blue-300">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
              <span>
                Cargando día {loadingProgress.progress} de {loadingProgress.totalDays}… Mostrando {ordenesCompra.length} resultados parciales. Puedes navegar mientras tanto.
              </span>
            </div>
          )}

          {/* ── Stat cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Órdenes', value: ordenesCompra.length.toLocaleString('es-CL'), icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: 'Tipos Distintos', value: tipoStats.length.toLocaleString('es-CL'), icon: Hash, color: 'text-green-500', bg: 'bg-green-500/10' },
              { label: 'Estados Distintos', value: estadoStats.length.toLocaleString('es-CL'), icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
              { label: 'Aceptadas', value: ordenesCompra.filter(o => o.estado === 'Aceptada').length.toLocaleString('es-CL'), icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-2 rounded-lg ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="font-bold text-lg leading-tight">{value}</p>
              </div>
            ))}
          </div>

          {ordenesFiltradas.length > 0 ? (
            <>
              {/* ── Analytics charts ─────────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Por Estado
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={estadoStats}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={75}
                        dataKey="value"
                      >
                        {estadoStats.map(e => <Cell key={e.name} fill={ESTADO_COLORS[e.name] ?? '#8884d8'} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Filter className="h-4 w-4 text-blue-500" /> Por Tipo
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={tipoStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {tipoStats.map(t => <Cell key={`${t.name}-${t.code || 'na'}`} fill={TIPO_OC_COLORS[t.code] ?? '#8884d8'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Inline result filter ─────────────────────────────────── */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="oc-filtro-resultados"
                    type="text"
                    value={filtroResultados}
                    onChange={(e) => { setFiltroResultados(e.target.value); setCurrentPage(1); }}
                    placeholder="Filtrar dentro de los resultados ya cargados…"
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Este filtro actúa solo sobre la lista cargada, sin nueva consulta.</p>
              </div>

              {/* ── Result rows as card articles ─────────────────────────── */}
              <div className="space-y-2">
                {paginated.map(orden => (
                  <article
                    key={orden.codigo}
                    id={`oc-item-${orden.codigo}`}
                    className="rounded-xl border border-border bg-card p-4 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm cursor-pointer transition-all"
                    onClick={() => toggleDetail(orden.codigo)}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                            {orden.codigo}
                          </span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: ESTADO_COLORS[orden.estado] ?? '#6b7280' }}
                          >
                            {orden.estado}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: TIPO_OC_COLORS[orden.tipo] ?? '#6b7280' }}
                          >
                            {getOrdenTipoLabel(orden.tipo, orden.tipoDescripcion)}
                          </span>
                        </div>
                        <p className="font-medium text-sm leading-snug line-clamp-2">{orden.producto}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {normalizeRegionName(orden.region) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{normalizeRegionName(orden.region)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <a
                          href={orden.urlDetalle}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver en MP
                        </a>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedCodigo === orden.codigo ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {/* ── Pagination ───────────────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Mostrar</span>
                  <select
                    id="oc-page-size"
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                  >
                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span>por página · {ordenesFiltradas.length.toLocaleString('es-CL')} resultados</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    id="oc-page-first"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded-lg text-sm border border-border disabled:opacity-40 hover:bg-accent transition-colors"
                  >«</button>
                  <button
                    id="oc-page-prev"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                  <span className="px-3 py-1 text-sm text-muted-foreground">
                    <strong>{currentPage}</strong> / <strong>{totalPages}</strong>
                  </span>
                  <button
                    id="oc-page-next"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-40 transition-colors"
                  >
                    Siguiente <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    id="oc-page-last"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded-lg text-sm border border-border disabled:opacity-40 hover:bg-accent transition-colors"
                  >»</button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 rounded-xl border border-border bg-card space-y-4">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
              <div>
                <h3 className="text-lg font-semibold mb-2">No hay coincidencias</h3>
                <p className="text-muted-foreground">La búsqueda cargó resultados, pero el filtro adicional no encontró coincidencias.</p>
              </div>
              <button
                onClick={() => { setFiltroResultados(''); setCurrentPage(1); }}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent transition-colors"
              >
                Limpiar filtro
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Empty results after search ────────────────────────────────────── */}
      {hasSearched && !isLoading && !error && ordenesCompra.length === 0 && (
        <div className="text-center py-16 rounded-xl border border-border bg-card">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h3 className="text-lg font-semibold mb-2">No se encontraron órdenes de compra</h3>
          <p className="text-muted-foreground">Intenta ajustar los filtros de búsqueda.</p>
        </div>
      )}

      {/* ── Detail drawer ────────────────────────────────────────────────── */}
      {expandedCodigo && (
        <div className="fixed inset-0 z-50 flex" onClick={() => { setExpandedCodigo(null); setDetailData(null); setDetailError(''); }}>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" />
          <div
            className="w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 bg-background/95 backdrop-blur z-10">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-emerald-500" />
                <h2 className="font-bold">Detalle Orden de Compra</h2>
                {expandedCodigo && (
                  <span className="font-mono text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{expandedCodigo}</span>
                )}
              </div>
              <div className="flex gap-2">
                {detailData && (
                  <a
                    href={detailData.urlDetalle}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" /> Ver en MP
                  </a>
                )}
                <button
                  id="oc-detail-close"
                  onClick={() => { setExpandedCodigo(null); setDetailData(null); setDetailError(''); }}
                  className="rounded-md p-1 hover:bg-accent"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Drawer body */}
            {detailLoading && (
              <div className="flex-1 flex flex-col gap-4 p-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            )}
            {detailError && (
              <div className="p-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" /> {detailError}
              </div>
            )}

            {detailData && detailData.codigo === expandedCodigo && (
              <div className="p-4 space-y-5">
                {/* Status badges */}
                <div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: ESTADO_COLORS[detailData.estado] ?? '#6b7280' }}
                    >
                      {detailData.estado}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: TIPO_OC_COLORS[detailData.tipo] ?? '#6b7280' }}
                    >
                      {getOrdenTipoLabel(detailData.tipo, detailData.tipoDescripcion)}
                    </span>
                  </div>
                  <h3 className="font-bold text-base leading-snug">{detailData.producto}</h3>
                  {detailData.descripcion && (
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{detailData.descripcion}</p>
                  )}
                </div>

                {/* Financiero highlight */}
                {detailData.monto && detailData.monto > 0 && (
                  <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 p-4">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-2 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Financiero
                    </p>
                    <div className="flex flex-wrap gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">Monto Total</p>
                        <p className="font-bold text-xl text-green-700 dark:text-green-300">{formatCurrency(detailData.monto)}</p>
                      </div>
                      {detailData.totalNeto && detailData.totalNeto > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Neto</p>
                          <p className="font-bold text-xl">{formatCurrency(detailData.totalNeto)}</p>
                        </div>
                      )}
                      {detailData.impuestos && detailData.impuestos > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Impuestos</p>
                          <p className="font-semibold">{formatCurrency(detailData.impuestos)}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {detailData.tipoMoneda && <span>Moneda: {detailData.tipoMoneda}</span>}
                      {detailData.cantidad !== undefined && detailData.cantidad !== null && <span>Items: {detailData.cantidad}</span>}
                    </div>
                  </div>
                )}

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Organismo', value: detailData.organismo, icon: Building2 },
                    { label: 'Región', value: normalizeRegionName(detailData.region), icon: MapPin },
                    { label: 'Comuna', value: detailData.comunaComprador, icon: MapPin },
                    { label: 'Proveedor', value: detailData.proveedor, icon: Package },
                    { label: 'RUT Proveedor', value: detailData.rutProveedor, icon: Hash },
                    { label: 'Estado Proveedor', value: detailData.estadoProveedor, icon: CheckCircle2 },
                    { label: 'Tipo Despacho', value: detailData.tipoDespacho, icon: Truck },
                    { label: 'Forma de Pago', value: detailData.formaPago, icon: CreditCard },
                    { label: 'Financiamiento', value: detailData.financiamiento, icon: DollarSign },
                    { label: 'Licitación', value: detailData.codigoLicitacion, icon: Hash },
                  ].map(({ label, value, icon: Icon }) => value ? (
                    <div key={label} className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5"><Icon className="h-3 w-3" />{label}</p>
                      <p className="text-sm font-medium">{value}</p>
                    </div>
                  ) : null)}
                </div>

                {/* Dates */}
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-blue-500" /> Fechas</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'Creación', value: formatDate(detailData.fechaCreacion) },
                      { label: 'Emisión', value: formatDate(detailData.fechaEmision) },
                      { label: 'Aceptación', value: formatDate(detailData.fechaAceptacion) },
                      { label: 'Última modificación', value: formatDate(detailData.fechaUltimaModificacion) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

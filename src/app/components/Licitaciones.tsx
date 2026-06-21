import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import { useApiKey } from '../context/ApiKeyContext';
import { matchesEstablecimiento } from '../data/establecimientos';
import { Search, Filter, TrendingUp, Calendar, ChevronDown, ChevronUp, FileText, Loader2, ExternalLink, Download, AlertCircle, ChevronRight, Building2, MapPin, DollarSign, Info, Hash, Clock, Users, X, Hospital, RefreshCw } from 'lucide-react';
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
  'Publicada': '#3b82f6',
  'En evaluación': '#f59e0b',
  'Adjudicada': '#10b981',
  'Desierta': '#ef4444',
  'Cerrada': '#6b7280',
  'Revocada': '#dc2626',
  'Suspendida': '#9ca3af',
  'Activas': '#0ea5e9',
};

const TIPOS_LICITACION = [
  { value: '', label: 'Todos los tipos' },
  { value: 'L1', label: 'Pública < 100 UTM' },
  { value: 'LE', label: 'Pública 100–1.000 UTM' },
  { value: 'LP', label: 'Pública 1.000–2.000 UTM' },
  { value: 'LQ', label: 'Pública 2.000–5.000 UTM' },
  { value: 'LR', label: 'Pública ≥ 5.000 UTM' },
  { value: 'LS', label: 'Pública servicios especializados' },
  { value: 'E2', label: 'Privada < 100 UTM' },
  { value: 'CO', label: 'Privada 100–1.000 UTM' },
  { value: 'B2', label: 'Privada 1.000–2.000 UTM' },
  { value: 'H2', label: 'Privada 2.000–5.000 UTM' },
  { value: 'I2', label: 'Privada > 5.000 UTM' },
];

const LICITACIONES_STORAGE_KEY = 'puco.licitaciones.last-search.v1';
const MAX_AUTO_RETRIES = 3;

const TIPO_LICITACION_LABEL_BY_CODE: Record<string, string> = TIPOS_LICITACION.reduce((acc, item) => {
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

const getLicitacionTipoLabel = (tipo?: string, tipoDescripcion?: string) => {
  const desc = (tipoDescripcion || '').trim();
  if (desc) return desc;
  const code = (tipo || '').trim().toUpperCase();
  return TIPO_LICITACION_LABEL_BY_CODE[code] || 'Tipo no informado';
};

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

interface LicitacionSearchFilters {
  busqueda: string;
  codigo: string;
  estado: string;
  tipo: string;
  region: string;
  codigoOrganismo: string;
  codigoProveedor: string;
  sortField: string;
  sortOrder: string;
  fechaInicio: string;
  fechaFin: string;
  soloEstablecimientos: boolean;
}

async function fetchLicitaciones(
  filtros: LicitacionSearchFilters,
  apiKey: string,
  signal?: AbortSignal,
  onPending?: () => void,
  onPartial?: (data: PollPartial<Licitacion>) => void,
): Promise<PollData<Licitacion>> {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.codigo) params.set('codigo', filtros.codigo);
  if (filtros.estado && filtros.estado !== 'Todos') params.set('estado', filtros.estado);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.region) params.set('region', filtros.region);
  if (filtros.codigoOrganismo) params.set('CodigoOrganismo', filtros.codigoOrganismo);
  if (filtros.codigoProveedor) params.set('CodigoProveedor', filtros.codigoProveedor);
  if (filtros.fechaInicio) params.set('fechaInicio', filtros.fechaInicio);
  if (filtros.fechaFin) params.set('fechaFin', filtros.fechaFin);
  params.set('sortField', filtros.sortField);
  params.set('sortOrder', filtros.sortOrder);

  const headers: Record<string, string> = {};
  if (apiKey) headers['X-MP-Ticket'] = apiKey;

  const url = `/api/licitaciones?${params.toString()}`;
  const resp = await fetchWithRetry(url, { signal, headers }, 2);

  if (resp.status === 202) {
    type JobPollPayload = {
      error?: string;
      status?: string;
      partial?: PollPartial<Licitacion>;
      data?: PollData<Licitacion>;
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
          throw createSearchError<Licitacion>(pollData.error || 'Error del servidor', {
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

        const searchErr = err as SearchRequestError<Licitacion>;
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

  const data = await resp.json().catch(() => ({} as PollData<Licitacion> & { error?: string }));
  if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
  return data as PollData<Licitacion>;
}

function exportCSV(licitaciones: Licitacion[]) {
  const headers = ['Código', 'Nombre', 'Estado', 'Tipo', 'Región', 'Fecha Cierre'];
  const rows = licitaciones.map(l => [
    l.codigo,
    l.nombre,
    l.estado,
    getLicitacionTipoLabel(l.tipo, l.tipoDescripcion),
    normalizeRegionName(l.region),
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

async function fetchLicitacionDetail(codigo: string, apiKey: string, retries = 2): Promise<LicitacionDetail> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-MP-Ticket'] = apiKey;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetchWithRetry(`/api/licitacion/${encodeURIComponent(codigo)}`, { headers }, 1);
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

export function Licitaciones() {
  const { apiKey } = useApiKey();
  const [busqueda, setBusqueda] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [tipoFilter, setTipoFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [codigoOrganismo, setCodigoOrganismo] = useState('');
  const [codigoProveedor, setCodigoProveedor] = useState('');
  const [sortField, setSortField] = useState<'fechaCierre' | 'fechaPublicacion'>('fechaCierre');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(true);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [soloEstablecimientos, setSoloEstablecimientos] = useState(false);
  const [filtroResultados, setFiltroResultados] = useState('');

  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
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
  const [detailData, setDetailData] = useState<LicitacionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const regionHydrationAttemptedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const autoRetryTimerRef = useRef<number | null>(null);
  const autoRetryCountRef = useRef(0);
  const lastStableResultsRef = useRef<Licitacion[]>([]);

  const estados = ['Todos', 'Activas', 'Publicada', 'Adjudicada', 'Cerrada', 'Desierta', 'Revocada', 'Suspendida'];

  const persistSnapshot = useCallback((filters: LicitacionSearchFilters, list: Licitacion[], warningMessage?: string) => {
    saveSearchSnapshot<LicitacionSearchFilters, Licitacion>(LICITACIONES_STORAGE_KEY, {
      timestamp: Date.now(),
      filters,
      listado: list,
      total: list.length,
      warning: warningMessage,
    });
  }, []);

  useEffect(() => {
    const snapshot = loadSearchSnapshot<LicitacionSearchFilters, Licitacion>(LICITACIONES_STORAGE_KEY);
    if (!snapshot) return;

    setBusqueda(snapshot.filters.codigo || snapshot.filters.busqueda || '');
    setEstadoFilter(snapshot.filters.estado || 'Todos');
    setTipoFilter(snapshot.filters.tipo || '');
    setRegionFilter(snapshot.filters.region || '');
    setCodigoOrganismo(snapshot.filters.codigoOrganismo || '');
    setCodigoProveedor(snapshot.filters.codigoProveedor || '');
    setSortField((snapshot.filters.sortField as 'fechaCierre' | 'fechaPublicacion') || 'fechaCierre');
    setSortOrder((snapshot.filters.sortOrder as 'asc' | 'desc') || 'desc');
    setFechaInicio(snapshot.filters.fechaInicio || '');
    setFechaFin(snapshot.filters.fechaFin || '');
    setSoloEstablecimientos(Boolean(snapshot.filters.soloEstablecimientos));

    if (snapshot.listado.length > 0) {
      setLicitaciones(snapshot.listado);
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
    const searchFilters: LicitacionSearchFilters = {
      busqueda: isCodigo ? '' : busqueda,
      codigo: isCodigo ? busqueda.trim() : '',
      estado: estadoFilter,
      tipo: tipoFilter,
      region: regionFilter,
      codigoOrganismo,
      codigoProveedor,
      sortField,
      sortOrder,
      fechaInicio,
      fechaFin,
      soloEstablecimientos,
    };

    const applyAndPersist = (list: Licitacion[], warningMessage?: string) => {
      setLicitaciones(list);
      if (list.length > 0) {
        lastStableResultsRef.current = list;
        persistSnapshot(searchFilters, list, warningMessage);
      }
      return list;
    };

    try {
      const result = await fetchLicitaciones({
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
      const searchErr = err as SearchRequestError<Licitacion>;
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
      const detail = await fetchLicitacionDetail(codigo, apiKey);
      setDetailData(detail);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Error al cargar detalle');
    } finally {
      setDetailLoading(false);
    }
  }, [expandedCodigo, apiKey]);

  const licitacionesFiltradas = useMemo(() => {
    let list = licitaciones;
    if (soloEstablecimientos) {
      list = list.filter(l => matchesEstablecimiento(l.nombre) || (l.organismo ? matchesEstablecimiento(l.organismo) : false));
    }
    if (regionFilter) {
      list = list.filter(l => {
        const canonicalItemRegion = normalizeRegionName(l.region);
        return !canonicalItemRegion || canonicalItemRegion === regionFilter;
      });
    }
    const q = normalizeSearchText(filtroResultados.trim());
    if (!q) return list;

    return list.filter(lic =>
      normalizeSearchText([
        lic.nombre,
        lic.codigo,
        lic.organismo,
        lic.region,
        lic.tipo,
        lic.tipoDescripcion,
      ].filter(Boolean).join(' ')).includes(q)
    );
  }, [licitaciones, filtroResultados, soloEstablecimientos, regionFilter]);

  const estadoStats = useMemo(() => {
    const stats: Record<string, number> = {};
    licitacionesFiltradas.forEach(l => { stats[l.estado] = (stats[l.estado] || 0) + 1; });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [licitacionesFiltradas]);

  const tipoStats = useMemo(() => {
    const stats: Record<string, { name: string; count: number; code: string }> = {};
    licitacionesFiltradas.forEach(l => {
      const code = (l.tipo || '').trim().toUpperCase();
      const name = getLicitacionTipoLabel(l.tipo, l.tipoDescripcion);
      if (!stats[name]) {
        stats[name] = { name, count: 0, code };
      }
      stats[name].count += 1;
    });
    return Object.values(stats)
      .sort((a, b) => b.count - a.count);
  }, [licitacionesFiltradas]);

  const totalPages = Math.max(1, Math.ceil(licitacionesFiltradas.length / pageSize));
  const paginated = useMemo(
    () => licitacionesFiltradas.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [licitacionesFiltradas, currentPage, pageSize]
  );

  useEffect(() => {
    if (!apiKey || paginated.length === 0) return;

    const missingRegionRows = paginated
      .filter(lic => !normalizeRegionName(lic.region) && lic.codigo)
      .filter(lic => !regionHydrationAttemptedRef.current.has(lic.codigo))
      .slice(0, 6);

    if (missingRegionRows.length === 0) return;

    missingRegionRows.forEach((lic) => {
      regionHydrationAttemptedRef.current.add(lic.codigo);
      fetchLicitacionDetail(lic.codigo, apiKey)
        .then((detail) => {
          const region = normalizeRegionName(detail.region);
          if (!region) return;
          setLicitaciones(prev => prev.map(item =>
            item.codigo === lic.codigo
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
    // Append time to avoid UTC-midnight shift to previous day in negative-offset timezones
    const date = new Date(d.length === 10 ? d + 'T12:00:00' : d);
    return date.toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const TIPO_COLORS: Record<string, string> = {
    'L1': '#3b82f6', 'LE': '#10b981', 'LP': '#f59e0b', 'LQ': '#8b5cf6',
    'LR': '#ef4444', 'LS': '#06b6d4', 'E2': '#f97316', 'CO': '#84cc16',
    'B2': '#ec4899', 'H2': '#14b8a6', 'I2': '#a855f7',
  };

  const [showAnalytics, setShowAnalytics] = useState(false);

  return (
    <div className="space-y-6">

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-indigo-600/10 via-card to-blue-600/10 px-6 py-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-5 w-5 text-indigo-500" />
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Mercado Público · Licitaciones</span>
            </div>
            <h1 className="text-2xl font-bold">Licitaciones</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Consulta licitaciones del Mercado Público en tiempo real
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {licitacionesFiltradas.length > 0 && (
              <button
                id="lic-export-btn"
                onClick={() => exportCSV(licitacionesFiltradas)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Download className="h-4 w-4" /> Exportar CSV
              </button>
            )}
            <button
              id="lic-refresh-btn"
              onClick={handleBuscar}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
            {hasSearched && licitacionesFiltradas.length > 0 && (
              <button
                id="lic-analytics-toggle"
                onClick={() => setShowAnalytics(v => !v)}
                className="flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-700 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
              >
                <TrendingUp className="h-4 w-4" />
                {showAnalytics ? 'Ocultar análisis' : 'Ver análisis'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Search Form ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">

          {/* Keyword search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="lic-search-query"
              type="text"
              placeholder="Buscar por nombre, código, organismo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Estado */}
          <select
            id="lic-filter-estado"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {estados.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          {/* Tipo */}
          <select
            id="lic-filter-tipo"
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {TIPOS_LICITACION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {/* Región */}
          <select
            id="lic-filter-region"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {REGIONES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          {/* Código organismo */}
          <input
            id="lic-filter-organismo"
            type="text"
            placeholder="Código organismo (ej: 6945)"
            value={codigoOrganismo}
            onChange={(e) => setCodigoOrganismo(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />

          {/* Código proveedor */}
          <input
            id="lic-filter-proveedor"
            type="text"
            placeholder="Código proveedor (ej: 17793)"
            value={codigoProveedor}
            onChange={(e) => setCodigoProveedor(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />

          {/* Fecha desde */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Desde</label>
            <input
              id="lic-filter-desde"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Fecha hasta */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Hasta</label>
            <input
              id="lic-filter-hasta"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              min={fechaInicio || undefined}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Sort */}
          <select
            id="lic-filter-sort"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as 'fechaCierre' | 'fechaPublicacion')}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="fechaCierre">Ordenar: Fecha Cierre</option>
            <option value="fechaPublicacion">Ordenar: Fecha Publicación</option>
          </select>

          {/* Sort order */}
          <select
            id="lic-filter-order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </select>

          {/* Solo establecimientos pill */}
          <div className="lg:col-span-2 flex items-center gap-3">
            <button
              id="lic-filter-establecimientos"
              type="button"
              onClick={() => setSoloEstablecimientos(v => !v)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                soloEstablecimientos
                  ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'
                  : 'bg-muted text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              <Hospital className="h-4 w-4" />
              Solo establecimientos salud
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 items-end lg:col-span-2">
            <button
              id="lic-search-btn"
              onClick={handleBuscar}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isLoading ? 'Consultando…' : 'Buscar'}
            </button>
            <button
              id="lic-clear-btn"
              onClick={() => {
                setBusqueda('');
                setEstadoFilter('Todos');
                setTipoFilter('');
                setRegionFilter('');
                setCodigoOrganismo('');
                setCodigoProveedor('');
                setFechaInicio('');
                setFechaFin('');
                setSoloEstablecimientos(false);
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
              title="Limpiar filtros"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {warning && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{warning}</p>
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
      {isLoading && licitaciones.length === 0 && (
        <div className="text-center py-16">
          <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
          <h3 className="mb-2">Consultando API del Mercado Público...</h3>
          {loadingProgress
            ? <p className="text-muted-foreground">Cargando día {loadingProgress.progress} de {loadingProgress.totalDays}...</p>
            : isSlow
              ? <p className="text-muted-foreground">La consulta puede tardar varios minutos, por favor espera...</p>
              : <p className="text-muted-foreground">Obteniendo licitaciones según tus filtros</p>
          }
        </div>
      )}

      {/* Resultados */}
      {hasSearched && licitaciones.length > 0 && (
        <>
          {/* Banner de carga progresiva */}
          {isLoading && loadingProgress && (
            <div className="flex items-center gap-3 p-3 mb-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-sm">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
              <span>Cargando día {loadingProgress.progress} de {loadingProgress.totalDays}... Mostrando {licitaciones.length} resultados parciales. Puedes navegar mientras tanto.</span>
            </div>
          )}

          {/* Estadísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: soloEstablecimientos ? 'Establecimientos salud' : 'Total Licitaciones', value: licitacionesFiltradas.length.toLocaleString('es-CL'), icon: soloEstablecimientos ? Hospital : FileText, color: soloEstablecimientos ? 'text-red-500' : 'text-indigo-500' },
              { label: 'Tipos distintos', value: tipoStats.length.toLocaleString('es-CL'), icon: Hash, color: 'text-green-500' },
              { label: 'Estados distintos', value: estadoStats.length.toLocaleString('es-CL'), icon: TrendingUp, color: 'text-orange-500' },
              { label: 'Detalle de licitación', value: 'Haz clic para ver', icon: Info, color: 'text-purple-500' },
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

          {/* Analytics collapsible panel */}
          {showAnalytics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-indigo-500" /> Distribución por Estado</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={estadoStats} cx="50%" cy="50%" labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={70} dataKey="value">
                      {estadoStats.map(e => <Cell key={e.name} fill={ESTADO_COLORS[e.name] ?? '#8884d8'} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, 'Licitaciones']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Hash className="h-4 w-4 text-green-500" /> Distribución por Tipo</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={tipoStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 9 }} />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {tipoStats.map(t => <Cell key={`${t.name}-${t.code || 'na'}`} fill={TIPO_COLORS[t.code] ?? '#8884d8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Banner de establecimientos */}
          {soloEstablecimientos && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
              <Hospital className="h-4 w-4 flex-shrink-0" />
              <span>Filtrando por establecimientos de salud: <strong>{licitacionesFiltradas.length}</strong> de {licitaciones.length} resultados coinciden con el directorio de establecimientos públicos de salud.</span>
            </div>
          )}

          {licitacionesFiltradas.length > 0 ? (
            <>
              {/* List of licitaciones */}
              <div className="space-y-2">
                {paginated.map(lic => (
                  <article
                    key={lic.codigo}
                    id={`lic-item-${lic.codigo}`}
                    className="rounded-xl border border-border bg-card p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm cursor-pointer transition-all"
                    onClick={() => toggleDetail(lic.codigo)}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{lic.codigo}</span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: ESTADO_COLORS[lic.estado] ?? '#6b7280' }}
                          >
                            {lic.estado}
                          </span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded"
                            style={{ backgroundColor: `${TIPO_COLORS[lic.tipo] ?? '#6b7280'}20`, color: TIPO_COLORS[lic.tipo] ?? '#6b7280' }}
                          >
                            {getLicitacionTipoLabel(lic.tipo, lic.tipoDescripcion)}
                          </span>
                        </div>
                        <p className="font-medium text-sm leading-snug line-clamp-2">{lic.nombre}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{lic.organismo || 'Organismo no especificado'}</span>
                          {lic.region && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{normalizeRegionName(lic.region)}</span>}
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Cierre: {formatDate(lic.fechaCierre)}</span>
                        </div>
                      </div>
                      <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-1 flex-shrink-0">
                        {lic.monto > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Monto estimado</p>
                            <p className="font-bold text-base text-green-600 dark:text-green-400">{formatCurrency(lic.monto)}</p>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {/* Modern Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Mostrar</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="rounded-lg border border-border px-2 py-1 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span>por página · {licitacionesFiltradas.length} resultados</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                  >«</button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
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
                            className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
                              currentPage === p
                                ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                                : 'border-border hover:bg-muted'
                            }`}
                          >{p}</button>
                    )
                  }
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                  >›</button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                  >»</button>
                </div>
              </div>

              {/* Result Filter */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  Filtrar resultados cargados
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={filtroResultados}
                    onChange={(e) => { setFiltroResultados(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar dentro de los resultados ya obtenidos..."
                    className="w-full pl-9 pr-4 py-2 bg-background rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Este filtro solo actúa sobre la lista ya cargada.</p>
              </div>
            </>
          ) : (
            <div className="text-center py-16 bg-card border border-border rounded-xl space-y-4">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <div>
                <h3 className="text-lg font-semibold mb-2">No hay coincidencias con el filtro adicional</h3>
                <p className="text-muted-foreground">La búsqueda principal ya cargó resultados, pero este filtro no encontró coincidencias.</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-xl p-4 text-left space-y-2 max-w-md mx-auto">
                <label className="block text-sm font-medium">Filtrar resultados cargados</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={filtroResultados}
                    onChange={(e) => { setFiltroResultados(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar dentro de los resultados ya obtenidos..."
                    className="w-full pl-9 pr-4 py-2 bg-background rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Borra este texto para volver a ver la lista completa.</p>
              </div>
            </div>
          )}
        </>
      )}

      {hasSearched && !isLoading && !error && licitaciones.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-40" />
          <h3 className="text-lg font-semibold mb-2">No se encontraron licitaciones</h3>
          <p className="text-muted-foreground">Intenta ajustar los filtros de búsqueda</p>
        </div>
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      {expandedCodigo && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setExpandedCodigo(null)} />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
              <div className="pointer-events-auto w-screen max-w-2xl border-l border-border bg-card shadow-2xl transition-all">
                <div className="flex h-full flex-col overflow-y-auto">
                  {/* Drawer Header */}
                  <div className="border-b border-border px-6 py-5 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground border border-border rounded px-2 py-0.5 bg-background">
                          {expandedCodigo}
                        </span>
                        <h2 className="text-lg font-bold mt-2" id="slide-over-title">Detalle de Licitación</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedCodigo(null)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Drawer Content */}
                  <div className="relative flex-1 p-6 space-y-6">
                    {detailLoading && (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        <span className="text-sm">Cargando información detallada...</span>
                      </div>
                    )}

                    {detailError && (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Error al cargar detalle</p>
                          <p className="text-sm opacity-80">{detailError}</p>
                        </div>
                      </div>
                    )}

                    {detailData && !detailLoading && (
                      <div className="space-y-6">
                        {/* Title and description */}
                        <div>
                          <h3 className="text-base font-semibold mb-2">{detailData.nombre}</h3>
                          {detailData.descripcion && (
                            <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-4 border border-border leading-relaxed">
                              {detailData.descripcion}
                            </p>
                          )}
                        </div>

                        {/* Grid info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Organismo */}
                          <div className="rounded-xl border border-border p-4 space-y-3">
                            <h4 className="text-sm font-semibold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                              <Building2 className="h-4 w-4" /> Organismo Comprador
                            </h4>
                            <div className="text-sm space-y-1.5">
                              <p><span className="text-muted-foreground">Nombre:</span> <strong className="font-medium">{detailData.organismo || '—'}</strong></p>
                              <p><span className="text-muted-foreground">Unidad:</span> {detailData.nombreUnidad || '—'}</p>
                              <p><span className="text-muted-foreground">RUT:</span> {detailData.rutUnidad || '—'}</p>
                              <p><span className="text-muted-foreground">Código:</span> {detailData.codigoOrganismo || '—'}</p>
                            </div>
                          </div>

                          {/* Finanzas */}
                          <div className="rounded-xl border border-border p-4 space-y-3">
                            <h4 className="text-sm font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
                              <DollarSign className="h-4 w-4" /> Información Financiera
                            </h4>
                            <div className="text-sm space-y-1.5">
                              <p>
                                <span className="text-muted-foreground">Presupuesto Estimado:</span>{' '}
                                <strong className="font-semibold text-green-600 dark:text-green-400">
                                  {detailData.monto && detailData.monto > 0 ? formatCurrency(detailData.monto) : 'No publicado'}
                                </strong>
                              </p>
                              <p><span className="text-muted-foreground">Moneda:</span> {detailData.moneda || '—'}</p>
                              <p><span className="text-muted-foreground">Tipo de Convocatoria:</span> {detailData.tipoConvocatoria || '—'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Fechas */}
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-indigo-500" /> Fechas Hito
                          </h4>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                            {[
                              { label: 'Creación', value: formatDate(detailData.fechaCreacion) },
                              { label: 'Publicación', value: formatDate(detailData.fechaPublicacion) },
                              { label: 'Cierre de ofertas', value: formatDate(detailData.fechaCierre) },
                              { label: 'Adjudicación', value: formatDate(detailData.fechaAdjudicacion) },
                              { label: 'Est. Adjudicación', value: formatDate(detailData.fechaEstimadaAdjudicacion) },
                            ].map(({ label, value }) => (
                              <div key={label} className="border-b border-border/50 pb-1">
                                <p className="text-xs text-muted-foreground">{label}</p>
                                <p className="font-medium text-foreground">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Participación / Otros */}
                        <div className="rounded-xl border border-border p-4 space-y-3">
                          <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-600 dark:text-violet-400">
                            <Users className="h-4 w-4" /> Participación y Estructura
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><p className="text-muted-foreground text-xs">Etapas</p><p className="font-medium">{detailData.etapas ?? '—'}</p></div>
                            <div><p className="text-muted-foreground text-xs">Items solicitados</p><p className="font-medium">{detailData.cantidadItems ?? '—'}</p></div>
                            <div><p className="text-muted-foreground text-xs">Cantidad de reclamos</p><p className="font-medium">{detailData.cantidadReclamos ?? '—'}</p></div>
                            <div><p className="text-muted-foreground text-xs">Oferentes adjudicados</p><p className="font-medium">{detailData.adjudicacionNumeroOferentes ?? '—'}</p></div>
                            <div className="col-span-2"><p className="text-muted-foreground text-xs">Días para el cierre</p><p className="font-medium">{detailData.diasCierreLicitacion ?? '—'}</p></div>
                          </div>
                        </div>

                        {/* Enlace original */}
                        {detailData.urlDetalle && (
                          <div className="pt-2">
                            <a
                              href={detailData.urlDetalle}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-3 text-sm font-medium hover:bg-indigo-700 transition-colors"
                            >
                              Ver Licitación en Mercado Público <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

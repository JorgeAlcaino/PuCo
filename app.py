import os
import json as _json
import uuid
import hashlib
import time
import threading
import warnings
from datetime import datetime, timezone, timedelta

import requests
from urllib3.exceptions import InsecureRequestWarning
from flask import Flask, jsonify, send_from_directory, request
from flask_caching import Cache
from flask_cors import CORS

# The MP API certificate is self-signed; suppress per-request warnings
warnings.filterwarnings("ignore", category=InsecureRequestWarning)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DIST_DIR = os.path.join(os.path.dirname(__file__), "dist")
MP_API_BASE = "https://api.mercadopublico.cl/servicios/v1/publico"
MP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
cache = Cache(app, config={"CACHE_TYPE": "SimpleCache", "CACHE_DEFAULT_TIMEOUT": 300})

# ── Estado mappings ──────────────────────────────────────────────────────────

# Map numeric codes returned in API response data → label
ESTADO_LIC_BY_CODE = {
    "5": "Publicada",
    "6": "Cerrada",
    "7": "Desierta",
    "8": "Adjudicada",
    "9": "Desierta",
    "14": "En evaluación",
    "15": "En evaluación",
    "16": "Suspendida",
    "18": "Revocada",
    "19": "Suspendida",
}

# Map UI label → API query param value (lowercase text)
ESTADO_LIC_TO_API_PARAM = {
    "Publicada": "publicada",
    "Cerrada": "cerrada",
    "Desierta": "desierta",
    "Adjudicada": "adjudicada",
    "Revocada": "revocada",
    "Suspendida": "suspendida",
}

ESTADO_OC_BY_CODE = {
    "1": "Enviada al Proveedor",
    "2": "Aceptada",
    "3": "Cancelada",
    "4": "Recibida",
    "5": "Enviada al Proveedor",
    "6": "Recepción Conforme",
    "7": "Pendiente",
    "8": "Parcialmente Recepcionada",
    "9": "Recepción Incompleta",
    "10": "Anulada",
    "12": "En Proceso",
}

# Map UI label → API query param value (lowercase text)
ESTADO_OC_TO_API_PARAM = {
    "Aceptada": "aceptada",
    "Cancelada": "cancelada",
    "Recepción Conforme": "recepcion conforme",
    "Pendiente": "pendiente de envio",
    "Parcialmente Recepcionada": "recepcionada parcialmente",
    "Recepción Incompleta": "recepcion conforme incompleta",
    "Enviada al Proveedor": "enviada a proveedor",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_date(value: str) -> str:
    """Normalize /Date(ms)/ and ISO formats to YYYY-MM-DD."""
    if not value:
        return ""
    if value.startswith("/Date("):
        ts = int(value[6:value.index(")")])
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value[:19], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value[:10]


TIPO_LICITACION_MAP = {
    "L1": "Pública < 100 UTM",
    "LE": "Pública 100–1.000 UTM",
    "LP": "Pública 1.000–2.000 UTM",
    "LQ": "Pública 2.000–5.000 UTM",
    "LR": "Pública ≥ 5.000 UTM",
    "LS": "Pública Servicios especializados",
    "E2": "Privada < 100 UTM",
    "CO": "Privada 100–1.000 UTM",
    "B2": "Privada 1.000–2.000 UTM",
    "H2": "Privada 2.000–5.000 UTM",
    "I2": "Privada > 5.000 UTM",
}


def _extract_tipo_from_codigo(codigo: str) -> str:
    """Extract type code from a Mercado Público code like '1134432-33-LE26' -> 'LE'."""
    if not codigo:
        return ""
    parts = codigo.split("-")
    if len(parts) >= 3:
        suffix = parts[-1]  # e.g. 'LE26'
        # Type is the alphabetical prefix of the last segment
        tipo = "".join(c for c in suffix if c.isalpha())
        return tipo
    return ""


def normalize_licitacion(lic: dict) -> dict:
    fechas = lic.get("Fechas") or {}
    comprador = lic.get("Comprador") or {}
    adjudicacion = lic.get("Adjudicacion") or {}
    items = lic.get("Items") or {}
    monto = lic.get("MontoEstimado") or 0
    if lic.get("VisibilidadMonto") == 0:
        monto = 0
    codigo = lic.get("CodigoExterno", "")
    # CodigoEstado can be int or str; Estado can be a text label
    codigo_estado = str(lic.get("CodigoEstado", ""))
    estado_raw = lic.get("Estado") or ""
    if isinstance(estado_raw, str) and estado_raw and not estado_raw.isdigit():
        estado = estado_raw  # API returned text label
    else:
        estado = ESTADO_LIC_BY_CODE.get(codigo_estado, f"Estado {codigo_estado}" if codigo_estado else "Desconocido")
    tipo_code = lic.get("Tipo", "") or _extract_tipo_from_codigo(codigo)
    return {
        "codigo": codigo,
        "nombre": lic.get("Nombre", ""),
        "descripcion": lic.get("Descripcion", ""),
        "organismo": comprador.get("NombreOrganismo", ""),
        "codigoOrganismo": comprador.get("CodigoOrganismo", ""),
        "rutUnidad": comprador.get("RutUnidad", ""),
        "nombreUnidad": comprador.get("NombreUnidad", ""),
        "estado": estado,
        "monto": float(monto),
        "moneda": lic.get("Moneda", "CLP"),
        "fechaCreacion": parse_date(fechas.get("FechaCreacion", "")),
        "fechaPublicacion": parse_date(fechas.get("FechaPublicacion", "")),
        "fechaCierre": parse_date(lic.get("FechaCierre") or fechas.get("FechaCierre", "")),
        "fechaAdjudicacion": parse_date(fechas.get("FechaAdjudicacion", "")),
        "fechaEstimadaAdjudicacion": parse_date(fechas.get("FechaEstimadaAdjudicacion", "")),
        "region": comprador.get("RegionUnidad", "") or comprador.get("Region", ""),
        "comunaUnidad": comprador.get("ComunaUnidad", ""),
        "tipo": tipo_code,
        "tipoDescripcion": TIPO_LICITACION_MAP.get(tipo_code, tipo_code),
        "tipoConvocatoria": "Abierto" if lic.get("TipoConvocatoria") in (1, "1") else "Cerrada",
        "etapas": lic.get("Etapas", 1),
        "cantidadReclamos": lic.get("CantidadReclamos", 0),
        "cantidadItems": items.get("Cantidad", 0) if isinstance(items, dict) else 0,
        "diasCierreLicitacion": lic.get("DiasCierreLicitacion", 0),
        "adjudicacionNumeroOferentes": adjudicacion.get("NumeroOferentes", 0),
        "urlDetalle": f"https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?IdLicitacion={codigo}",
    }


TIPO_OC_BY_CODE = {
    "8": "SE",
    "9": "CM",
    "10": "AG",
    "11": "TD",
    "12": "CC",
}

TIPO_MONEDA_MAP = {
    "CLP": "Peso Chileno",
    "CLF": "Unidad de Fomento",
    "USD": "Dólar Americano",
    "UTM": "Unidad Tributaria Mensual",
    "EUR": "Euro",
}

TIPO_DESPACHO_MAP = {
    "7": "Despachar a Dirección de envío",
    "9": "Despachar según programa adjuntado",
    "12": "Otra Forma de Despacho, Ver Instruc.",
    "14": "Retiramos de su bodega",
    "20": "Despacho por courier o encomienda aérea",
    "21": "Despacho por courier o encomienda terrestre",
    "22": "A convenir",
}

FORMA_PAGO_MAP = {
    "1": "15 días contra la recepción de la factura",
    "2": "30 días contra la recepción de la factura",
    "39": "Otra forma de pago",
    "46": "50 días contra la recepción de la factura",
    "47": "60 días contra la recepción de la factura",
}


def normalize_orden_compra(oc: dict) -> dict:
    fechas = oc.get("Fechas") or {}
    comprador = oc.get("Comprador") or {}
    proveedor = oc.get("Proveedor") or {}
    items = oc.get("Items") or {}
    codigo = oc.get("Codigo", "")
    estado_code = str(oc.get("CodigoEstado", ""))
    estado_raw = oc.get("EstadoNombre") or oc.get("Estado") or ""
    if isinstance(estado_raw, str) and estado_raw and not estado_raw.isdigit():
        estado = estado_raw
    else:
        estado = ESTADO_OC_BY_CODE.get(estado_code, f"Estado {estado_code}" if estado_code else "Desconocido")
    tipo_code = str(oc.get("CodigoTipo") or "")
    tipo_text = TIPO_OC_BY_CODE.get(tipo_code, oc.get("Tipo", "")) or _extract_tipo_from_codigo(codigo)
    tipo_moneda = oc.get("TipoMoneda", "")
    tipo_despacho = str(oc.get("TipoDespacho") or "")
    forma_pago = str(oc.get("FormaPago") or "")
    return {
        "codigo": codigo,
        "producto": oc.get("Nombre", ""),
        "descripcion": oc.get("Descripcion", ""),
        "proveedor": proveedor.get("Nombre", ""),
        "rutProveedor": proveedor.get("RutSucursal", ""),
        "organismo": comprador.get("NombreOrganismo", ""),
        "estado": estado,
        "estadoProveedor": oc.get("EstadoProveedor", ""),
        "tipo": tipo_text,
        "tipoMoneda": tipo_moneda,
        "monto": float(oc.get("Total") or oc.get("TotalNeto") or 0),
        "totalNeto": float(oc.get("TotalNeto") or 0),
        "impuestos": float(oc.get("Impuestos") or 0),
        "descuentos": float(oc.get("Descuentos") or 0),
        "cargos": float(oc.get("Cargos") or 0),
        "cantidad": int(items.get("Cantidad") or 0),
        "fechaCreacion": parse_date(fechas.get("FechaCreacion", "")),
        "fechaEmision": parse_date(fechas.get("FechaEnvio") or fechas.get("FechaCreacion", "")),
        "fechaAceptacion": parse_date(fechas.get("FechaAceptacion", "")),
        "fechaCancelacion": parse_date(fechas.get("FechaCancelacion", "")),
        "fechaUltimaModificacion": parse_date(fechas.get("FechaUltimaModificacion", "")),
        "region": comprador.get("RegionUnidad", "") or proveedor.get("Region", ""),
        "comunaComprador": comprador.get("ComunaUnidad", ""),
        "tipoDespacho": TIPO_DESPACHO_MAP.get(tipo_despacho, tipo_despacho),
        "formaPago": FORMA_PAGO_MAP.get(forma_pago, forma_pago),
        "financiamiento": oc.get("Financiamiento", ""),
        "codigoLicitacion": oc.get("CodigoLicitacion", ""),
        "urlDetalle": f"https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC={codigo}",
    }


def cache_key_from_params(prefix: str, params: dict) -> str:
    raw = f"{prefix}_{sorted(params.items())}"
    return hashlib.md5(raw.encode()).hexdigest()


# ── CodigoUnidad → Region persistent cache ───────────────────────────────────

_UNIDAD_REGION_FILE = os.path.join(os.path.dirname(__file__), ".unidad_region_cache.json")
_unidad_region_cache: dict = {}
_unidad_region_lock = threading.Lock()


def _load_unidad_cache():
    global _unidad_region_cache
    if os.path.exists(_UNIDAD_REGION_FILE):
        try:
            with open(_UNIDAD_REGION_FILE, "r", encoding="utf-8") as f:
                _unidad_region_cache = _json.load(f)
        except Exception:
            _unidad_region_cache = {}


def _save_unidad_cache():
    try:
        with open(_UNIDAD_REGION_FILE, "w", encoding="utf-8") as f:
            _json.dump(_unidad_region_cache, f, ensure_ascii=False)
    except Exception:
        pass


def _enrich_regions(listado: list, ticket: str) -> None:
    """Populate region field for list-API results by fetching detail for unknown CodigoUnidad."""
    unknown: dict = {}  # unidad_code -> list of items needing region
    for item in listado:
        codigo = item.get("codigo", "")
        unidad = codigo.split("-")[0] if "-" in codigo else ""
        if not unidad:
            continue
        with _unidad_region_lock:
            cached = _unidad_region_cache.get(unidad)
        if cached is not None:
            if cached != "_empty":
                item["region"] = cached
        else:
            unknown.setdefault(unidad, []).append(item)

    # Batch-fetch details for unknown unidades
    enriched = 0
    for unidad, items in list(unknown.items()):
        sample_codigo = items[0].get("codigo", "")
        try:
            data = call_mp_api("licitaciones.json", {"ticket": ticket, "codigo": sample_codigo})
            detail_list = data.get("Listado") or []
            if detail_list:
                comprador = detail_list[0].get("Comprador") or {}
                region = (comprador.get("RegionUnidad", "") or "").strip()
                with _unidad_region_lock:
                    _unidad_region_cache[unidad] = region or "_empty"
                if region:
                    for item in items:
                        item["region"] = region
            else:
                with _unidad_region_lock:
                    _unidad_region_cache[unidad] = "_empty"
            enriched += 1
        except Exception:
            pass
    if enriched > 0:
        _save_unidad_cache()


def _enrich_regions_oc(listado: list, ticket: str) -> None:
    """Populate region field for OC list-API results by fetching detail for unknown units."""
    unknown: dict = {}  # unidad_code -> list of items needing region
    for item in listado:
        codigo = item.get("codigo", "")
        unidad = codigo.split("-")[0] if "-" in codigo else ""
        if not unidad:
            continue
        with _unidad_region_lock:
            cached = _unidad_region_cache.get(unidad)
        if cached is not None:
            if cached != "_empty":
                item["region"] = cached
        else:
            unknown.setdefault(unidad, []).append(item)

    enriched = 0
    for unidad, items in list(unknown.items()):
        sample_codigo = items[0].get("codigo", "")
        try:
            data = call_mp_api("ordenesdecompra.json", {"ticket": ticket, "codigo": sample_codigo})
            raw = data if isinstance(data, list) else (data.get("Listado") or [])
            if raw:
                comprador = raw[0].get("Comprador") or {}
                region = (comprador.get("RegionUnidad", "") or "").strip()
                with _unidad_region_lock:
                    _unidad_region_cache[unidad] = region or "_empty"
                if region:
                    for item in items:
                        item["region"] = region
            else:
                with _unidad_region_lock:
                    _unidad_region_cache[unidad] = "_empty"
            enriched += 1
        except Exception:
            pass
    if enriched > 0:
        _save_unidad_cache()


_load_unidad_cache()


# Serialize API calls to avoid concurrent-request rejections from MP API
_api_lock = threading.Lock()
_last_api_call = 0.0

# ── Background job store (single-process, --workers 1 required) ──────────────
_jobs: dict = {}
_jobs_lock = threading.Lock()

JOB_FINISHED_TTL_SECONDS = 600
JOB_PENDING_STALE_SECONDS = 24 * 60 * 60
HTTP_500_BACKOFF_BASE_SECONDS = 2
HTTP_500_BACKOFF_MAX_SECONDS = 60


def call_mp_api(endpoint: str, params: dict, retries: int = 2):
    """Call Mercado Público API with retry and rate-limit guard."""
    global _last_api_call
    last_err = None
    for attempt in range(1 + retries):
        with _api_lock:
            # Ensure at least 0.4s between API calls
            elapsed = time.time() - _last_api_call
            if elapsed < 0.4:
                time.sleep(0.4 - elapsed)
            try:
                resp = requests.get(
                    f"{MP_API_BASE}/{endpoint}",
                    params=params,
                    headers=MP_HEADERS,
                    timeout=90,
                    verify=False,
                )
                _last_api_call = time.time()
            except requests.Timeout as e:
                _last_api_call = time.time()
                last_err = e
                if attempt < retries:
                    time.sleep(1)
                    continue
                raise
        resp.raise_for_status()
        data = resp.json()
        # API may return application-level errors with 200 or non-200 status
        if isinstance(data, dict) and "Codigo" in data and "Listado" not in data:
            codigo = data.get("Codigo", 0)
            mensaje = data.get("Mensaje", "Error desconocido")
            if codigo == 10500:
                last_err = requests.HTTPError("Rate limited", response=type("R", (), {"status_code": 429})())
                if attempt < retries:
                    time.sleep(2)
                    continue
                raise last_err
            raise RuntimeError(f"API error {codigo}: {mensaje}")
        return data
    raise last_err or RuntimeError("Max retries exceeded")


def _cleanup_old_jobs(now: float | None = None) -> None:
    """Remove finished jobs quickly and purge pending jobs only when truly stale."""
    current_time = now if now is not None else time.time()
    with _jobs_lock:
        to_delete = []
        for job_id, job in _jobs.items():
            age = current_time - job.get("ts", 0)
            status = job.get("status")
            if status == "pending":
                if age > JOB_PENDING_STALE_SECONDS:
                    to_delete.append(job_id)
            elif age > JOB_FINISHED_TTL_SECONDS:
                to_delete.append(job_id)
        for job_id in to_delete:
            del _jobs[job_id]


def _touch_job(job_id: str) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is not None:
            job["ts"] = time.time()


def _set_job_partial(job_id: str, partial: dict) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None or job.get("status") != "pending":
            return
        job["partial"] = partial
        job["ts"] = time.time()


def _set_job_done(job_id: str, data: dict) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        job.update({"status": "done", "data": data, "ts": time.time()})
        job.pop("partial", None)


def _set_job_error(job_id: str, error_msg: str) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        job.update({"status": "error", "error": error_msg, "ts": time.time()})
        job.pop("partial", None)


def _call_mp_api_retry_500_forever(endpoint: str, params: dict, job_id: str | None = None):
    """Retry indefinitely with backoff only for HTTP 500 responses."""
    delay = HTTP_500_BACKOFF_BASE_SECONDS
    while True:
        try:
            data = call_mp_api(endpoint, params)
            if job_id:
                _touch_job(job_id)
            return data
        except requests.HTTPError as e:
            code = getattr(e.response, "status_code", None)
            if code != 500:
                raise
            app.logger.warning("HTTP 500 from MP API on %s; retrying in %ss", endpoint, delay)
            if job_id:
                _touch_job(job_id)
            time.sleep(delay)
            delay = min(delay * 2, HTTP_500_BACKOFF_MAX_SECONDS)


def _today_mp_date() -> str:
    """Return today's date as ddmmyyyy for the MP API."""
    today = datetime.now(tz=None)
    return today.strftime("%d%m%Y")


def _iso_to_mp_date(iso_date: str) -> str:
    """Convert YYYY-MM-DD (HTML date input) to ddmmyyyy for the MP API."""
    if not iso_date:
        return ""
    if len(iso_date) == 10 and iso_date[4] == "-":
        return f"{iso_date[8:10]}{iso_date[5:7]}{iso_date[:4]}"
    return iso_date


def _get_mp_ticket() -> str:
    """Read MP ticket from the request header only."""
    header_ticket = request.headers.get("X-MP-Ticket", "").strip()
    return header_ticket


def _date_range_mp(fecha_inicio_iso: str, fecha_fin_iso: str) -> list[str]:
    """Return a list of ddmmyyyy strings for each day in [inicio, fin]."""
    if not fecha_inicio_iso or not fecha_fin_iso:
        return []
    try:
        start = datetime.strptime(fecha_inicio_iso, "%Y-%m-%d")
        end = datetime.strptime(fecha_fin_iso, "%Y-%m-%d")
    except ValueError:
        return []
    if end < start:
        start, end = end, start
    days = (end - start).days + 1
    return [(start + timedelta(days=i)).strftime("%d%m%Y") for i in range(days)]


def _build_query_dates(fecha_inicio_iso: str, fecha_fin_iso: str) -> list[str]:
    """Build query dates from request filters with no fixed date-range cap."""
    if fecha_inicio_iso and fecha_fin_iso:
        date_range = _date_range_mp(fecha_inicio_iso, fecha_fin_iso)
        if date_range:
            return date_range
    if fecha_inicio_iso:
        return [_iso_to_mp_date(fecha_inicio_iso)]
    if fecha_fin_iso:
        return [_iso_to_mp_date(fecha_fin_iso)]
    return [_today_mp_date()]


# ── API routes ───────────────────────────────────────────────────────────────

def _apply_filters_and_sort(listado: list, args: dict) -> list:
    """Apply client-side filters (busqueda, tipo, region) and sort to a licitacion list."""
    busqueda = args.get("busqueda", "").strip().lower()
    if busqueda:
        listado = [r for r in listado if busqueda in r["nombre"].lower()
                   or busqueda in r["codigo"].lower()]
    tipo = args.get("tipo", "")
    if tipo:
        listado = [r for r in listado if r["tipo"] == tipo]
    region = args.get("region", "").strip()
    if region:
        listado = [r for r in listado if region.lower() in (r.get("region") or "").lower()]
    sort_field = args.get("sortField", "fechaPublicacion")
    reverse = args.get("sortOrder", "desc") == "desc"
    if sort_field == "monto":
        listado.sort(key=lambda x: x.get("monto") or 0, reverse=reverse)
    else:
        listado.sort(key=lambda x: x.get(sort_field) or "", reverse=reverse)
    return listado


def _run_lic_job(job_id: str, mp_params: dict, all_args: dict, ck: str, date_range: list[str] | None = None) -> None:
    """Background thread: calls MP API (one or multiple days), enriches regions, applies filters, stores result."""
    try:
        dates = date_range or [mp_params.get("fecha", "")]
        all_listado = []
        seen_codes: set = set()
        for idx, fecha in enumerate(dates):
            _touch_job(job_id)
            params = {**mp_params, "fecha": fecha}
            data = _call_mp_api_retry_500_forever("licitaciones.json", params, job_id=job_id)
            for lic in (data.get("Listado") or []):
                item = normalize_licitacion(lic)
                if item["codigo"] not in seen_codes:
                    seen_codes.add(item["codigo"])
                    all_listado.append(item)
            # Emit partial results so frontend can display early
            if len(dates) > 1 and idx < len(dates) - 1:
                partial = _apply_filters_and_sort(list(all_listado), all_args)
                _set_job_partial(job_id, {"total": len(partial), "listado": partial,
                                          "progress": idx + 1, "totalDays": len(dates)})
        # Enrich region from detail API for items that lack it
        ticket = mp_params.get("ticket", "")
        if ticket:
            _enrich_regions(all_listado, ticket)
        all_listado = _apply_filters_and_sort(all_listado, all_args)
        output = {"total": len(all_listado), "listado": all_listado}
        with app.app_context():
            cache.set(ck, output)
        _set_job_done(job_id, output)
    except requests.Timeout:
        _set_job_error(job_id, "La API del Mercado Público tardó demasiado")
    except requests.HTTPError as e:
        code = getattr(e.response, "status_code", 502)
        msg = ("Demasiadas solicitudes simultáneas, intenta de nuevo en unos segundos"
               if code == 429 else f"Error HTTP {code} de la API")
        _set_job_error(job_id, msg)
    except Exception as e:
        _set_job_error(job_id, str(e))


@app.route("/api/licitaciones")
def get_licitaciones():
    ticket = _get_mp_ticket()
    if not ticket:
        return jsonify({"error": "API key no configurada. Ingresa tu ticket en la configuración."}), 401

    mp_params = {"ticket": ticket}
    all_args = dict(request.args)

    # --- Búsqueda por código específico (fast path, returns 1 result) ---
    codigo = request.args.get("codigo", "").strip()
    if codigo:
        mp_params["codigo"] = codigo
        ck = cache_key_from_params("lic", all_args)
        cached = cache.get(ck)
        if cached is not None:
            return jsonify(cached)
        try:
            data = call_mp_api("licitaciones.json", mp_params)
        except requests.Timeout:
            return jsonify({"error": "La API del Mercado Público tardó demasiado"}), 504
        except requests.HTTPError as e:
            code = getattr(e.response, "status_code", 502)
            if code == 429:
                return jsonify({"error": "Demasiadas solicitudes simultáneas, intenta de nuevo en unos segundos"}), 429
            return jsonify({"error": f"Error HTTP {code} de la API"}), 502
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 502
        except requests.RequestException as e:
            return jsonify({"error": str(e)}), 502
        listado = [normalize_licitacion(l) for l in (data.get("Listado") or [])]
        listado = _apply_filters_and_sort(listado, all_args)
        output = {"total": len(listado), "listado": listado}
        cache.set(ck, output)
        return jsonify(output)

    # --- Date/list-based listing: always async to tolerate long retries on 500 ---
    fecha_inicio_iso = request.args.get("fechaInicio", "").strip()
    fecha_fin_iso = request.args.get("fechaFin", "").strip()
    query_dates = _build_query_dates(fecha_inicio_iso, fecha_fin_iso)
    mp_params["fecha"] = query_dates[0]

    estado = request.args.get("estado", "")
    if estado and estado != "Todos":
        api_estado = ESTADO_LIC_TO_API_PARAM.get(estado)
        if api_estado:
            mp_params["estado"] = api_estado

    ck = cache_key_from_params("lic", all_args)
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)

    _cleanup_old_jobs()
    with _jobs_lock:
        # Reuse an existing pending job for the same filters
        for jid, job in _jobs.items():
            if job.get("ck") == ck and job["status"] == "pending":
                return jsonify({"status": "pending", "jobId": jid}), 202
        # Start a new background job
        job_id = str(uuid.uuid4())
        _jobs[job_id] = {"status": "pending", "ck": ck, "ts": time.time()}

    t = threading.Thread(target=_run_lic_job, args=(job_id, mp_params, all_args, ck, query_dates), daemon=True)
    t.start()
    return jsonify({"status": "pending", "jobId": job_id}), 202


@app.route("/api/jobs/<job_id>")
def get_job(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        return jsonify({"error": "Job no encontrado o expirado"}), 404
    if job["status"] == "pending":
        _touch_job(job_id)
        partial = job.get("partial")
        if partial:
            return jsonify({"status": "pending", "partial": partial}), 200
        return jsonify({"status": "pending"}), 200
    if job["status"] == "done":
        return jsonify({"status": "done", "data": job["data"]}), 200
    return jsonify({"status": "error", "error": job.get("error", "Error desconocido")}), 200


def _apply_oc_filters_and_sort(listado: list, args: dict) -> list:
    """Apply client-side filters and sort to an OC list."""
    busqueda = args.get("busqueda", "").strip().lower()
    if busqueda:
        listado = [r for r in listado if busqueda in r["producto"].lower()
                   or busqueda in r["codigo"].lower()]
    tipo = args.get("tipo", "")
    if tipo:
        listado = [r for r in listado if r.get("tipo", "") == tipo]
    region = args.get("region", "").strip()
    if region and region != "Todas":
        listado = [r for r in listado if region.lower() in (r.get("region") or "").lower()]
    sort_field = args.get("sortField", "codigo")
    reverse = args.get("sortOrder", "desc") == "desc"
    if sort_field == "monto":
        listado.sort(key=lambda x: x.get("monto") or 0, reverse=reverse)
    else:
        listado.sort(key=lambda x: x.get(sort_field) or "", reverse=reverse)
    return listado


def _run_oc_job(job_id: str, mp_params: dict, all_args: dict, ck: str, date_range: list[str]) -> None:
    """Background thread: fetches OC for multiple days, merges, enriches, filters."""
    try:
        all_listado = []
        seen_codes: set = set()
        for idx, fecha in enumerate(date_range):
            _touch_job(job_id)
            params = {**mp_params, "fecha": fecha}
            data = _call_mp_api_retry_500_forever("ordenesdecompra.json", params, job_id=job_id)
            raw = data if isinstance(data, list) else (data.get("Listado") or [])
            for oc in raw:
                item = normalize_orden_compra(oc)
                if item["codigo"] not in seen_codes:
                    seen_codes.add(item["codigo"])
                    all_listado.append(item)
            # Emit partial results so frontend can display early
            if idx < len(date_range) - 1:
                partial = _apply_oc_filters_and_sort(list(all_listado), all_args)
                _set_job_partial(job_id, {"total": len(partial), "listado": partial,
                                          "progress": idx + 1, "totalDays": len(date_range)})
        ticket = mp_params.get("ticket", "")
        if ticket:
            _enrich_regions_oc(all_listado, ticket)
        all_listado = _apply_oc_filters_and_sort(all_listado, all_args)
        output = {"total": len(all_listado), "listado": all_listado}
        with app.app_context():
            cache.set(ck, output)
        _set_job_done(job_id, output)
    except requests.Timeout:
        _set_job_error(job_id, "La API del Mercado Público tardó demasiado")
    except requests.HTTPError as e:
        code = getattr(e.response, "status_code", 502)
        msg = ("Demasiadas solicitudes simultáneas, intenta de nuevo en unos segundos"
               if code == 429 else f"Error HTTP {code} de la API")
        _set_job_error(job_id, msg)
    except Exception as e:
        _set_job_error(job_id, str(e))


@app.route("/api/ordenes-compra")
def get_ordenes_compra():
    ticket = _get_mp_ticket()
    if not ticket:
        return jsonify({"error": "API key no configurada. Ingresa tu ticket en la configuración."}), 401

    # --- Búsqueda por código específico de OC (endpoint singular) ---
    codigo = request.args.get("codigo", "").strip()
    if codigo:
        ck = cache_key_from_params("oc_code", {"codigo": codigo})
        cached = cache.get(ck)
        if cached is not None:
            return jsonify(cached)
        try:
            data = call_mp_api("ordenesdecompra.json", {"codigo": codigo, "ticket": ticket})
        except requests.Timeout:
            return jsonify({"error": "La API del Mercado Público tardó demasiado"}), 504
        except requests.HTTPError as e:
            c = getattr(e.response, "status_code", 502)
            if c == 429:
                return jsonify({"error": "Demasiadas solicitudes simultáneas, intenta de nuevo en unos segundos"}), 429
            return jsonify({"error": f"Error HTTP {c} de la API"}), 502
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 502
        except requests.RequestException as e:
            return jsonify({"error": str(e)}), 502

        raw_list = data if isinstance(data, list) else (data.get("Listado") or [])
        listado = [normalize_orden_compra(o) for o in raw_list]
        output = {"total": len(listado), "listado": listado}
        cache.set(ck, output)
        return jsonify(output)

    # --- Listing by date (required) + optional estado ---
    params = {"ticket": ticket}
    all_args = dict(request.args)

    fecha_inicio_iso = request.args.get("fechaInicio", "").strip()
    fecha_fin_iso = request.args.get("fechaFin", "").strip()
    query_dates = _build_query_dates(fecha_inicio_iso, fecha_fin_iso)
    params["fecha"] = query_dates[0]

    estado = request.args.get("estado", "")
    if estado and estado != "Todos":
        api_estado = ESTADO_OC_TO_API_PARAM.get(estado)
        if api_estado:
            params["estado"] = api_estado

    ck = cache_key_from_params("oc", all_args)
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)

    _cleanup_old_jobs()
    with _jobs_lock:
        for jid, job in _jobs.items():
            if job.get("ck") == ck and job["status"] == "pending":
                return jsonify({"status": "pending", "jobId": jid}), 202
        job_id = str(uuid.uuid4())
        _jobs[job_id] = {"status": "pending", "ck": ck, "ts": time.time()}

    t = threading.Thread(target=_run_oc_job, args=(job_id, params, all_args, ck, query_dates), daemon=True)
    t.start()
    return jsonify({"status": "pending", "jobId": job_id}), 202


@app.route("/api/licitacion/<codigo>")
def get_licitacion_detail(codigo):
    """Fetch full details for a single licitacion by its code."""
    ticket = _get_mp_ticket()
    if not ticket:
        return jsonify({"error": "API key no configurada"}), 401
    ck = cache_key_from_params("lic_detail", {"codigo": codigo})
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)
    try:
        data = call_mp_api("licitaciones.json", {"ticket": ticket, "codigo": codigo})
    except requests.Timeout:
        return jsonify({"error": "Timeout"}), 504
    except (requests.HTTPError, RuntimeError, requests.RequestException) as e:
        return jsonify({"error": str(e)}), 502
    items = data.get("Listado") or []
    if not items:
        return jsonify({"error": "No encontrada"}), 404
    result = normalize_licitacion(items[0])
    cache.set(ck, result)
    return jsonify(result)


@app.route("/api/orden-compra/<path:codigo>")
def get_orden_compra_detail(codigo):
    """Fetch full details for a single OC by its code."""
    ticket = _get_mp_ticket()
    if not ticket:
        return jsonify({"error": "API key no configurada"}), 401
    ck = cache_key_from_params("oc_detail", {"codigo": codigo})
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)
    try:
        data = call_mp_api("ordenesdecompra.json", {"ticket": ticket, "codigo": codigo})
    except requests.Timeout:
        return jsonify({"error": "Timeout"}), 504
    except (requests.HTTPError, RuntimeError, requests.RequestException) as e:
        return jsonify({"error": str(e)}), 502
    raw_list = data if isinstance(data, list) else (data.get("Listado") or [])
    if not raw_list:
        return jsonify({"error": "No encontrada"}), 404
    result = normalize_orden_compra(raw_list[0])
    cache.set(ck, result)
    return jsonify(result)


# ── Static / SPA ─────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "healthy", "dist_exists": os.path.isdir(DIST_DIR)}), 200


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    if not os.path.isdir(DIST_DIR):
        return jsonify({"error": "dist/ folder not found. Frontend build may have failed.",
                        "dist_dir": DIST_DIR,
                        "cwd": os.getcwd(),
                        "files_in_cwd": os.listdir(os.getcwd())}), 500
    full_path = os.path.join(DIST_DIR, path)
    if path and os.path.exists(full_path):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

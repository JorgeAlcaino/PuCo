import os
import uuid
import hashlib
import time
import threading
import warnings
import re
import random
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
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
MP_API2_BASE = "https://api2.mercadopublico.cl"
MP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
cache = Cache(app, config={"CACHE_TYPE": "SimpleCache", "CACHE_DEFAULT_TIMEOUT": 300})

CACHE_SCHEMA_VERSION = "2026-04-15-region-fix-2"


@app.after_request
def add_cache_headers(response):
    """Prevent stale SPA/API responses while allowing long cache for hashed assets."""
    path = request.path or ""

    if path.startswith("/api/") or path in {"/", "/index.html"} or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    elif path.startswith("/assets/"):
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")

    return response

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
    "Activas": "activas",
}

# Map API query numeric codes → UI label
ESTADO_LIC_QUERY_CODE_TO_LABEL = {
    "5": "Publicada",
    "6": "Cerrada",
    "7": "Desierta",
    "8": "Adjudicada",
    "18": "Revocada",
    "19": "Suspendida",
}

# Map normalized text aliases → UI label
ESTADO_LIC_ALIAS_TO_LABEL = {
    "publicada": "Publicada",
    "cerrada": "Cerrada",
    "desierta": "Desierta",
    "adjudicada": "Adjudicada",
    "revocada": "Revocada",
    "suspendida": "Suspendida",
    "activas": "Activas",
    "activa": "Activas",
    "todos": "Todos",
    "todas": "Todos",
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


REGION_CODE_TO_NAME = {
    "1": "Tarapacá",
    "2": "Antofagasta",
    "3": "Atacama",
    "4": "Coquimbo",
    "5": "Valparaíso",
    "6": "O'Higgins",
    "7": "Maule",
    "8": "Biobío",
    "9": "La Araucanía",
    "10": "Los Lagos",
    "11": "Aysén",
    "12": "Magallanes",
    "13": "Metropolitana",
    "14": "Los Ríos",
    "15": "Arica y Parinacota",
    "16": "Ñuble",
}

REGION_ROMAN_TO_CODE = {
    "I": "1",
    "II": "2",
    "III": "3",
    "IV": "4",
    "V": "5",
    "VI": "6",
    "VII": "7",
    "VIII": "8",
    "IX": "9",
    "X": "10",
    "XI": "11",
    "XII": "12",
    "XIII": "13",
    "XIV": "14",
    "XV": "15",
    "XVI": "16",
}

REGION_ALIAS_TO_NAME = {
    "tarapaca": "Tarapacá",
    "antofagasta": "Antofagasta",
    "atacama": "Atacama",
    "coquimbo": "Coquimbo",
    "valparaiso": "Valparaíso",
    "o higgins": "O'Higgins",
    "ohiggins": "O'Higgins",
    "libertador general bernardo o higgins": "O'Higgins",
    "maule": "Maule",
    "biobio": "Biobío",
    "bio bio": "Biobío",
    "la araucania": "La Araucanía",
    "araucania": "La Araucanía",
    "los lagos": "Los Lagos",
    "aysen": "Aysén",
    "aysen del general carlos ibanez del campo": "Aysén",
    "magallanes": "Magallanes",
    "magallanes y de la antartica chilena": "Magallanes",
    "magallanes y la antartica chilena": "Magallanes",
    "metropolitana": "Metropolitana",
    "metropolitana de santiago": "Metropolitana",
    "rm": "Metropolitana",
    "region metropolitana": "Metropolitana",
    "los rios": "Los Ríos",
    "arica y parinacota": "Arica y Parinacota",
    "nuble": "Ñuble",
}


def _normalize_text(value: str) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFD", str(value).strip().lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.split())


def _normalize_mp_date(raw: str) -> str:
    """Return ddmmyyyy string if valid, else empty."""
    if not raw:
        return ""
    cleaned = raw.strip()
    if not cleaned:
        return ""
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", cleaned):
        cleaned = cleaned.replace("/", "")
    if re.fullmatch(r"\d{8}", cleaned):
        try:
            datetime.strptime(cleaned, "%d%m%Y")
            return cleaned
        except ValueError:
            return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
        return _iso_to_mp_date(cleaned)
    return ""


def _normalize_estado_licitacion(raw: str) -> str:
    if not raw:
        return ""
    cleaned = raw.strip()
    if not cleaned:
        return ""
    if cleaned.isdigit():
        return ESTADO_LIC_QUERY_CODE_TO_LABEL.get(cleaned, "")
    normalized = _normalize_text(cleaned)
    return ESTADO_LIC_ALIAS_TO_LABEL.get(normalized, "")


def _first_non_empty(*values) -> str:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            cleaned = value.strip()
        else:
            cleaned = str(value).strip()
        if cleaned:
            return cleaned
    return ""


PREFERRED_REGION_KEYS = [
    "RegionUnidad",
    "NombreRegionUnidad",
    "CodigoRegionUnidad",
    "RegionComprador",
    "NombreRegionComprador",
    "CodigoRegionComprador",
    "RegionOrganismo",
    "NombreRegionOrganismo",
    "CodigoRegionOrganismo",
    "RegionSucursal",
    "NombreRegionSucursal",
    "CodigoRegionSucursal",
    "Region",
    "NombreRegion",
    "CodigoRegion",
]


def _extract_region_candidate(*sources) -> str:
    """Extract a likely region value from nested payloads even with varying key names."""
    # 1) Strict preferred keys (top-level first)
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key in PREFERRED_REGION_KEYS:
            candidate = _first_non_empty(source.get(key))
            if candidate:
                return candidate

    # 2) Recursive fallback for any scalar field containing "region"
    stack = [s for s in sources if isinstance(s, (dict, list))]
    visited = set()

    while stack:
        current = stack.pop()
        obj_id = id(current)
        if obj_id in visited:
            continue
        visited.add(obj_id)

        if isinstance(current, dict):
            for key, value in current.items():
                if isinstance(value, (dict, list)):
                    stack.append(value)
                    continue
                if value is None:
                    continue
                key_norm = _normalize_text(str(key))
                if "region" not in key_norm:
                    continue
                candidate = _first_non_empty(value)
                if candidate:
                    return candidate
        elif isinstance(current, list):
            for item in current:
                if isinstance(item, (dict, list)):
                    stack.append(item)

    return ""


def _region_code_from_value(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if raw.isdigit():
        return str(int(raw))

    number_match = re.search(r"\b(\d{1,2})\b", raw)
    if number_match:
        return str(int(number_match.group(1)))

    roman_match = re.search(r"\b(XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b", raw.upper())
    if roman_match:
        return REGION_ROMAN_TO_CODE.get(roman_match.group(1), "")

    return ""


def _normalize_region(value) -> str:
    raw = _first_non_empty(value)
    if not raw:
        return ""

    region_code = _region_code_from_value(raw)
    if region_code in REGION_CODE_TO_NAME:
        return REGION_CODE_TO_NAME[region_code]

    normalized = _normalize_text(raw)
    for prefix in ("region de la ", "region del ", "region de ", "region "):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break

    normalized = normalized.replace("republica de chile", "").strip()
    if normalized in REGION_ALIAS_TO_NAME:
        return REGION_ALIAS_TO_NAME[normalized]

    for alias, canonical in REGION_ALIAS_TO_NAME.items():
        if alias and alias in normalized:
            return canonical

    return raw


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
    tipo_code = (lic.get("Tipo", "") or _extract_tipo_from_codigo(codigo) or "").strip().upper()
    comprador_dir = comprador.get("DireccionUnidad") if isinstance(comprador.get("DireccionUnidad"), dict) else {}
    region_raw = _first_non_empty(
        comprador.get("RegionUnidad"),
        comprador.get("NombreRegionUnidad"),
        comprador.get("CodigoRegionUnidad"),
        comprador.get("Region"),
        comprador.get("NombreRegion"),
        comprador.get("CodigoRegion"),
        comprador_dir.get("Region"),
        comprador_dir.get("RegionUnidad"),
        comprador_dir.get("NombreRegionUnidad"),
        comprador_dir.get("CodigoRegionUnidad"),
        comprador_dir.get("NombreRegion"),
        comprador_dir.get("CodigoRegion"),
        lic.get("RegionUnidad"),
        lic.get("NombreRegionUnidad"),
        lic.get("CodigoRegionUnidad"),
        lic.get("RegionComprador"),
        lic.get("NombreRegionComprador"),
        lic.get("CodigoRegionComprador"),
        lic.get("Region"),
        lic.get("NombreRegion"),
        lic.get("CodigoRegion"),
    )
    if not region_raw:
        region_raw = _extract_region_candidate(lic, comprador, comprador_dir)
    comuna_raw = _first_non_empty(
        comprador.get("ComunaUnidad"),
        comprador.get("Comuna"),
        comprador_dir.get("Comuna"),
        lic.get("Comuna"),
    )
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
        "region": _normalize_region(region_raw),
        "comunaUnidad": comuna_raw,
        "tipo": tipo_code,
        "tipoDescripcion": TIPO_LICITACION_MAP.get(tipo_code, "Tipo no informado"),
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

TIPO_OC_LABEL_BY_ABBR = {
    "SE": "Sin emisión automática",
    "CM": "Convenio Marco",
    "AG": "Compra ágil",
    "TD": "Trato directo",
    "CC": "Compra coordinada",
}

TIPO_OC_ALIAS_TO_ABBR = {
    "se": "SE",
    "sin emision automatica": "SE",
    "cm": "CM",
    "convenio marco": "CM",
    "ag": "AG",
    "compra agil": "AG",
    "td": "TD",
    "trato directo": "TD",
    "cc": "CC",
    "compra coordinada": "CC",
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


def _normalize_oc_tipo(tipo_code: str, tipo_raw: str, codigo: str) -> tuple[str, str]:
    code = TIPO_OC_BY_CODE.get(tipo_code, "")
    raw = (tipo_raw or "").strip()

    if not code and raw:
        raw_normalized = _normalize_text(raw)
        if raw_normalized in TIPO_OC_ALIAS_TO_ABBR:
            code = TIPO_OC_ALIAS_TO_ABBR[raw_normalized]
        elif raw.upper() in TIPO_OC_LABEL_BY_ABBR:
            code = raw.upper()

    if not code:
        extracted = _extract_tipo_from_codigo(codigo)
        if extracted:
            normalized_extracted = extracted.upper()
            if normalized_extracted in TIPO_OC_LABEL_BY_ABBR:
                code = normalized_extracted

    label = TIPO_OC_LABEL_BY_ABBR.get(code)
    if label:
        return code, label
    if raw:
        return code or raw, raw
    return code, "Tipo no informado"


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
    tipo_code = str(oc.get("CodigoTipo") or "").strip()
    tipo, tipo_descripcion = _normalize_oc_tipo(tipo_code, str(oc.get("Tipo") or ""), codigo)
    tipo_moneda = oc.get("TipoMoneda", "")
    tipo_despacho = str(oc.get("TipoDespacho") or "")
    forma_pago = str(oc.get("FormaPago") or "")
    comprador_dir = comprador.get("DireccionUnidad") if isinstance(comprador.get("DireccionUnidad"), dict) else {}
    proveedor_dir = proveedor.get("Direccion") if isinstance(proveedor.get("Direccion"), dict) else {}
    region_raw = _first_non_empty(
        comprador.get("RegionUnidad"),
        comprador.get("NombreRegionUnidad"),
        comprador.get("CodigoRegionUnidad"),
        comprador.get("Region"),
        comprador.get("NombreRegion"),
        comprador.get("CodigoRegion"),
        comprador_dir.get("Region"),
        comprador_dir.get("RegionUnidad"),
        comprador_dir.get("NombreRegionUnidad"),
        comprador_dir.get("CodigoRegionUnidad"),
        comprador_dir.get("NombreRegion"),
        comprador_dir.get("CodigoRegion"),
        proveedor.get("Region"),
        proveedor.get("RegionSucursal"),
        proveedor.get("NombreRegionSucursal"),
        proveedor.get("CodigoRegionSucursal"),
        proveedor.get("NombreRegion"),
        proveedor.get("CodigoRegion"),
        proveedor_dir.get("Region"),
        proveedor_dir.get("RegionSucursal"),
        proveedor_dir.get("NombreRegionSucursal"),
        proveedor_dir.get("CodigoRegionSucursal"),
        proveedor_dir.get("NombreRegion"),
        oc.get("RegionUnidad"),
        oc.get("NombreRegionUnidad"),
        oc.get("CodigoRegionUnidad"),
        oc.get("Region"),
        oc.get("NombreRegion"),
        oc.get("CodigoRegion"),
    )
    if not region_raw:
        region_raw = _extract_region_candidate(oc, comprador, comprador_dir, proveedor, proveedor_dir)
    comuna_raw = _first_non_empty(
        comprador.get("ComunaUnidad"),
        comprador.get("Comuna"),
        comprador_dir.get("Comuna"),
        oc.get("Comuna"),
    )
    return {
        "codigo": codigo,
        "producto": oc.get("Nombre", ""),
        "descripcion": oc.get("Descripcion", ""),
        "proveedor": proveedor.get("Nombre", ""),
        "rutProveedor": proveedor.get("RutSucursal", ""),
        "organismo": comprador.get("NombreOrganismo", ""),
        "estado": estado,
        "estadoProveedor": oc.get("EstadoProveedor", ""),
        "tipo": tipo,
        "tipoDescripcion": tipo_descripcion,
        "tipoMoneda": TIPO_MONEDA_MAP.get(tipo_moneda, tipo_moneda),
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
        "region": _normalize_region(region_raw),
        "comunaComprador": comuna_raw,
        "tipoDespacho": TIPO_DESPACHO_MAP.get(tipo_despacho, tipo_despacho),
        "formaPago": FORMA_PAGO_MAP.get(forma_pago, forma_pago),
        "financiamiento": oc.get("Financiamiento", ""),
        "codigoLicitacion": oc.get("CodigoLicitacion", ""),
        "urlDetalle": f"https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC={codigo}",
    }


def cache_key_from_params(prefix: str, params: dict) -> str:
    raw = f"{CACHE_SCHEMA_VERSION}_{prefix}_{sorted(params.items())}"
    return hashlib.md5(raw.encode()).hexdigest()


# Serialize API calls to avoid concurrent-request rejections from MP API
_api_lock = threading.Lock()
_last_api_call = 0.0


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


MP_MAX_RETRIES = max(0, _int_env("MP_MAX_RETRIES", 3))
MP_BASE_BACKOFF_SECONDS = 0.5
MP_MAX_BACKOFF_SECONDS = 8.0
MP_MIN_REQUEST_INTERVAL_SECONDS = 0.35
MP_CIRCUIT_FAILURE_THRESHOLD = max(1, _int_env("MP_CIRCUIT_FAILURE_THRESHOLD", 5))
MP_CIRCUIT_RESET_SECONDS = max(5, _int_env("MP_CIRCUIT_RESET_SECONDS", 45))
MP_JOB_MAX_WORKERS = max(1, min(4, _int_env("MP_JOB_MAX_WORKERS", 3)))


class SimpleCircuitBreaker:
    """Small in-process circuit breaker to fail fast and auto-recover."""

    def __init__(self, failure_threshold: int, reset_seconds: int):
        self.failure_threshold = failure_threshold
        self.reset_seconds = reset_seconds
        self.failure_count = 0
        self.opened_at = 0.0
        self.state = "closed"  # closed | open | half-open
        self.lock = threading.Lock()

    def call(self, func):
        with self.lock:
            if self.state == "open":
                elapsed = time.time() - self.opened_at
                if elapsed < self.reset_seconds:
                    raise RuntimeError("Servicio temporalmente inestable. Reintentando automáticamente en breve.")
                self.state = "half-open"

        try:
            result = func()
        except Exception:
            with self.lock:
                now = time.time()
                if self.state == "half-open":
                    self.state = "open"
                    self.opened_at = now
                    self.failure_count = self.failure_threshold
                else:
                    self.failure_count += 1
                    if self.failure_count >= self.failure_threshold:
                        self.state = "open"
                        self.opened_at = now
            raise

        with self.lock:
            self.state = "closed"
            self.failure_count = 0
            self.opened_at = 0.0
        return result


mp_circuit_breaker = SimpleCircuitBreaker(
    failure_threshold=MP_CIRCUIT_FAILURE_THRESHOLD,
    reset_seconds=MP_CIRCUIT_RESET_SECONDS,
)


def _is_retryable_status(status_code: int) -> bool:
    return status_code in {408, 425, 429, 500, 502, 503, 504}


def _backoff_seconds(attempt: int) -> float:
    base = min(MP_BASE_BACKOFF_SECONDS * (2 ** attempt), MP_MAX_BACKOFF_SECONDS)
    return base * random.uniform(0.9, 1.1)


def _throttle_mp_api() -> None:
    global _last_api_call
    with _api_lock:
        elapsed = time.time() - _last_api_call
        wait_for = MP_MIN_REQUEST_INTERVAL_SECONDS - elapsed
        if wait_for > 0:
            time.sleep(wait_for)
        _last_api_call = time.time()

# ── Background job store (single-process, --workers 1 required) ──────────────
_jobs: dict = {}
_jobs_lock = threading.Lock()

JOB_FINISHED_TTL_SECONDS = 600
JOB_PENDING_STALE_SECONDS = 24 * 60 * 60


def call_mp_api(endpoint: str, params: dict, retries: int = MP_MAX_RETRIES):
    """Call Mercado Público API with exponential retry, jitter and circuit breaker."""

    def _request_with_retry():
        last_err = None
        max_attempts = 1 + max(0, retries)

        for attempt in range(max_attempts):
            try:
                _throttle_mp_api()
                resp = requests.get(
                    f"{MP_API_BASE}/{endpoint}",
                    params=params,
                    headers=MP_HEADERS,
                    timeout=90,
                    verify=False,
                )

                if _is_retryable_status(resp.status_code):
                    raise requests.HTTPError(f"Error HTTP {resp.status_code}", response=resp)

                resp.raise_for_status()
                data = resp.json()

                # API may return application-level errors with 200
                if isinstance(data, dict) and "Codigo" in data and "Listado" not in data:
                    try:
                        codigo = int(data.get("Codigo") or 0)
                    except (TypeError, ValueError):
                        codigo = 0
                    mensaje = data.get("Mensaje", "Error desconocido")
                    if codigo == 10500:
                        fake_resp = type("R", (), {"status_code": 429})()
                        raise requests.HTTPError(f"Rate limited: {mensaje}", response=fake_resp)
                    raise RuntimeError(f"API error {codigo}: {mensaje}")

                return data

            except requests.HTTPError as e:
                status_code = getattr(getattr(e, "response", None), "status_code", 0)
                last_err = e
                if attempt < max_attempts - 1 and _is_retryable_status(status_code):
                    time.sleep(_backoff_seconds(attempt))
                    continue
                raise

            except (requests.Timeout, requests.ConnectionError, requests.RequestException, ValueError) as e:
                last_err = e
                if attempt < max_attempts - 1:
                    time.sleep(_backoff_seconds(attempt))
                    continue
                raise

        raise last_err or RuntimeError("Max retries exceeded")

    return mp_circuit_breaker.call(_request_with_retry)


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


def _date_range_mp(fecha_inicio: str, fecha_fin: str) -> list[str]:
    """Build inclusive day-by-day date range in ddmmyyyy format."""
    if not fecha_inicio or not fecha_fin:
        return []
    start_raw = _normalize_mp_date(fecha_inicio)
    end_raw = _normalize_mp_date(fecha_fin)
    if not start_raw or not end_raw:
        return []
    try:
        start = datetime.strptime(start_raw, "%d%m%Y")
        end = datetime.strptime(end_raw, "%d%m%Y")
    except ValueError:
        return []
    if end < start:
        start, end = end, start
    days = (end - start).days + 1
    return [(start + timedelta(days=i)).strftime("%d%m%Y") for i in range(days)]


def _build_query_dates(fecha_inicio: str, fecha_fin: str) -> list[str]:
    """Build dates for API calls: range if provided, else a single selected/today day."""
    if fecha_inicio and fecha_fin:
        date_range = _date_range_mp(fecha_inicio, fecha_fin)
        if date_range:
            return date_range
    if fecha_inicio:
        one = _normalize_mp_date(fecha_inicio)
        return [one] if one else []
    if fecha_fin:
        one = _normalize_mp_date(fecha_fin)
        return [one] if one else []
    return [_today_mp_date()]


def _cleanup_old_jobs(now: float | None = None) -> None:
    """Remove stale pending jobs and completed jobs after a short TTL."""
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
        job.pop("error", None)
        job.pop("recoverable", None)
        job.pop("partial", None)


def _set_job_error(job_id: str, error_msg: str, fallback_data: dict | None = None, recoverable: bool = False) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        job.update({"status": "error", "error": error_msg, "recoverable": recoverable, "ts": time.time()})
        if fallback_data is not None:
            job["data"] = fallback_data


# ── API routes ───────────────────────────────────────────────────────────────

def _apply_filters_and_sort(listado: list, args: dict) -> list:
    """Apply client-side filters (region, busqueda, tipo) and sort to a licitacion list."""
    busqueda = args.get("busqueda", "").strip().lower()
    if busqueda:
        listado = [r for r in listado if busqueda in r["nombre"].lower()
                   or busqueda in r["organismo"].lower()
                   or busqueda in r["codigo"].lower()]
    tipo = args.get("tipo", "")
    if tipo:
        listado = [r for r in listado if r["tipo"] == tipo]
    sort_field = args.get("sortField", "fechaPublicacion")
    reverse = args.get("sortOrder", "desc") == "desc"
    if sort_field == "monto":
        listado.sort(key=lambda x: x.get("monto") or 0, reverse=reverse)
    else:
        listado.sort(key=lambda x: x.get(sort_field) or "", reverse=reverse)
    return listado


def _run_lic_job(job_id: str, mp_params: dict, all_args: dict, ck: str, date_range: list[str]) -> None:
    """Background thread: fetches day range in parallel, preserving partial progress on failures."""
    try:
        all_listado: list[dict] = []
        seen_codes: set[str] = set()
        failed_days: list[str] = []
        failed_day_samples: list[str] = []
        total_days = max(1, len(date_range))
        workers = 1 if total_days <= 1 else min(MP_JOB_MAX_WORKERS, total_days)

        def _fetch_day(fecha: str) -> tuple[list[dict], str | None]:
            params = {**mp_params, "fecha": fecha}
            try:
                data = call_mp_api("licitaciones.json", params)
                return [normalize_licitacion(lic) for lic in (data.get("Listado") or [])], None
            except Exception as exc:
                return [], str(exc)

        completed = 0
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_map = {executor.submit(_fetch_day, fecha): fecha for fecha in date_range}

            for future in as_completed(future_map):
                _touch_job(job_id)
                fecha = future_map[future]
                day_items: list[dict]
                day_error: str | None

                try:
                    day_items, day_error = future.result()
                except Exception as exc:
                    day_items, day_error = [], str(exc)

                completed += 1

                if day_error:
                    failed_days.append(fecha)
                    if len(failed_day_samples) < 3:
                        failed_day_samples.append(f"{fecha}: {day_error}")
                else:
                    for item in day_items:
                        code = item.get("codigo", "")
                        if code and code in seen_codes:
                            continue
                        if code:
                            seen_codes.add(code)
                        all_listado.append(item)

                partial = _apply_filters_and_sort(list(all_listado), all_args)
                partial_payload = {
                    "total": len(partial),
                    "listado": partial,
                    "progress": completed,
                    "totalDays": total_days,
                }
                if failed_days:
                    partial_payload["failedDays"] = len(failed_days)
                    partial_payload["warning"] = (
                        f"Se omitieron {len(failed_days)} día(s) por fallos temporales. "
                        "Seguimos intentando con los días restantes."
                    )
                _set_job_partial(job_id, partial_payload)

        all_listado = _apply_filters_and_sort(all_listado, all_args)
        output = {"total": len(all_listado), "listado": all_listado}
        if failed_days:
            output["failedDays"] = len(failed_days)
            output["failedDaySamples"] = failed_day_samples
            output["warning"] = (
                f"Consulta completada con datos parciales: {len(failed_days)} día(s) fallaron. "
                "Intenta nuevamente para completar el historial."
            )

        if not all_listado and failed_days and len(failed_days) >= total_days:
            _set_job_error(
                job_id,
                "No se pudo recuperar información por ahora. Reintentaremos automáticamente en la siguiente consulta.",
                fallback_data=output,
                recoverable=True,
            )
            return

        with app.app_context():
            cache.set(ck, output)
        _set_job_done(job_id, output)
    except Exception as e:
        fallback_data = None
        if "all_listado" in locals() and all_listado:
            safe_list = _apply_filters_and_sort(list(all_listado), all_args)
            fallback_data = {"total": len(safe_list), "listado": safe_list}
        _set_job_error(job_id, str(e), fallback_data=fallback_data, recoverable=True)


def _apply_oc_filters_and_sort(listado: list, args: dict) -> list:
    """Apply client-side filters and sorting to an OC list."""
    busqueda = args.get("busqueda", "").strip().lower()
    if busqueda:
        listado = [r for r in listado if busqueda in r["producto"].lower()
                   or busqueda in r["proveedor"].lower()
                   or busqueda in r["organismo"].lower()
                   or busqueda in r["codigo"].lower()]

    tipo = args.get("tipo", "")
    if tipo:
        listado = [r for r in listado if r.get("tipo", "") == tipo]

    sort_field = args.get("sortField", "codigo")
    reverse = args.get("sortOrder", "desc") == "desc"
    if sort_field == "monto":
        listado.sort(key=lambda x: x.get("monto") or 0, reverse=reverse)
    else:
        listado.sort(key=lambda x: x.get(sort_field) or "", reverse=reverse)
    return listado


def _run_oc_job(job_id: str, mp_params: dict, all_args: dict, ck: str, date_range: list[str]) -> None:
    """Background thread: fetches OC day-by-day in parallel and keeps partial snapshots."""
    try:
        all_listado: list[dict] = []
        seen_codes: set[str] = set()
        failed_days: list[str] = []
        failed_day_samples: list[str] = []
        total_days = max(1, len(date_range))
        workers = 1 if total_days <= 1 else min(MP_JOB_MAX_WORKERS, total_days)

        def _fetch_day(fecha: str) -> tuple[list[dict], str | None]:
            params = {**mp_params, "fecha": fecha}
            try:
                data = call_mp_api("ordenesdecompra.json", params)
                raw_list = data if isinstance(data, list) else (data.get("Listado") or [])
                return [normalize_orden_compra(oc) for oc in raw_list], None
            except Exception as exc:
                return [], str(exc)

        completed = 0
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_map = {executor.submit(_fetch_day, fecha): fecha for fecha in date_range}

            for future in as_completed(future_map):
                _touch_job(job_id)
                fecha = future_map[future]
                day_items: list[dict]
                day_error: str | None

                try:
                    day_items, day_error = future.result()
                except Exception as exc:
                    day_items, day_error = [], str(exc)

                completed += 1

                if day_error:
                    failed_days.append(fecha)
                    if len(failed_day_samples) < 3:
                        failed_day_samples.append(f"{fecha}: {day_error}")
                else:
                    for item in day_items:
                        code = item.get("codigo", "")
                        if code and code in seen_codes:
                            continue
                        if code:
                            seen_codes.add(code)
                        all_listado.append(item)

                partial = _apply_oc_filters_and_sort(list(all_listado), all_args)
                partial_payload = {
                    "total": len(partial),
                    "listado": partial,
                    "progress": completed,
                    "totalDays": total_days,
                }
                if failed_days:
                    partial_payload["failedDays"] = len(failed_days)
                    partial_payload["warning"] = (
                        f"Se omitieron {len(failed_days)} día(s) por fallos temporales. "
                        "Seguimos intentando con los días restantes."
                    )
                _set_job_partial(job_id, partial_payload)

        all_listado = _apply_oc_filters_and_sort(all_listado, all_args)
        output = {"total": len(all_listado), "listado": all_listado}
        if failed_days:
            output["failedDays"] = len(failed_days)
            output["failedDaySamples"] = failed_day_samples
            output["warning"] = (
                f"Consulta completada con datos parciales: {len(failed_days)} día(s) fallaron. "
                "Intenta nuevamente para completar el historial."
            )

        if not all_listado and failed_days and len(failed_days) >= total_days:
            _set_job_error(
                job_id,
                "No se pudo recuperar información por ahora. Reintentaremos automáticamente en la siguiente consulta.",
                fallback_data=output,
                recoverable=True,
            )
            return

        with app.app_context():
            cache.set(ck, output)
        _set_job_done(job_id, output)
    except Exception as e:
        fallback_data = None
        if "all_listado" in locals() and all_listado:
            safe_list = _apply_oc_filters_and_sort(list(all_listado), all_args)
            fallback_data = {"total": len(safe_list), "listado": safe_list}
        _set_job_error(job_id, str(e), fallback_data=fallback_data, recoverable=True)


@app.route("/api/licitaciones")
def get_licitaciones():
    ticket = request.headers.get("X-MP-Ticket", "").strip() or request.args.get("ticket", "").strip()
    if not ticket:
        return jsonify({"error": "API key no configurada. Ingresa tu ticket en la configuración."}), 401

    mp_params = {"ticket": ticket}
    filter_args = dict(request.args)

    busqueda = request.args.get("busqueda", "").strip()
    codigo = request.args.get("codigo", "").strip()
    tipo = request.args.get("tipo", "").strip()
    region = request.args.get("region", "").strip()
    sort_field = request.args.get("sortField", "").strip()
    sort_order = request.args.get("sortOrder", "").strip()

    base_cache_args = {}
    if busqueda:
        base_cache_args["busqueda"] = busqueda
    if codigo:
        base_cache_args["codigo"] = codigo
    if tipo:
        base_cache_args["tipo"] = tipo
    if sort_field:
        base_cache_args["sortField"] = sort_field
    if sort_order:
        base_cache_args["sortOrder"] = sort_order

    # --- Búsqueda por código específico (fast path, returns 1 result) ---
    if codigo:
        mp_params["codigo"] = codigo
        ck = cache_key_from_params("lic", base_cache_args)
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
        listado = _apply_filters_and_sort(listado, filter_args)
        output = {"total": len(listado), "listado": listado}
        cache.set(ck, output)
        return jsonify(output)

    # --- Date range listing: API queried day-by-day in a background job ---
    fecha_param = request.args.get("fecha", "").strip()
    if fecha_param:
        normalized_fecha = _normalize_mp_date(fecha_param)
        if not normalized_fecha:
            return jsonify({"error": "Fecha inválida. Usa ddmmaaaa o YYYY-MM-DD."}), 400
        query_dates = [normalized_fecha]
    else:
        fecha_inicio = request.args.get("fechaInicio", "").strip()
        fecha_fin = request.args.get("fechaFin", "").strip()
        query_dates = _build_query_dates(fecha_inicio, fecha_fin)
        if not query_dates:
            return jsonify({"error": "Rango de fechas inválido."}), 400
    mp_params["fecha"] = query_dates[0]

    estado_raw = request.args.get("estado", "").strip()
    estado_label = _normalize_estado_licitacion(estado_raw)
    if estado_raw and not estado_label:
        return jsonify({"error": "Estado inválido. Usa nombre, código o 'activas'."}), 400
    if estado_label and estado_label != "Todos":
        api_estado = ESTADO_LIC_TO_API_PARAM.get(estado_label)
        if api_estado:
            mp_params["estado"] = api_estado

    codigo_organismo = request.args.get("CodigoOrganismo", "").strip()
    if not codigo_organismo:
        codigo_organismo = request.args.get("codigoOrganismo", "").strip()
    if codigo_organismo:
        mp_params["CodigoOrganismo"] = codigo_organismo

    codigo_proveedor = request.args.get("CodigoProveedor", "").strip()
    if not codigo_proveedor:
        codigo_proveedor = request.args.get("codigoProveedor", "").strip()
    if codigo_proveedor:
        mp_params["CodigoProveedor"] = codigo_proveedor

    cache_args = dict(base_cache_args)
    if estado_label and estado_label != "Todos":
        cache_args["estado"] = estado_label
    if len(query_dates) > 1:
        cache_args["fechaInicio"] = query_dates[0]
        cache_args["fechaFin"] = query_dates[-1]
    else:
        cache_args["fecha"] = query_dates[0]
    if codigo_organismo:
        cache_args["CodigoOrganismo"] = codigo_organismo
    if codigo_proveedor:
        cache_args["CodigoProveedor"] = codigo_proveedor

    ck = cache_key_from_params("lic", cache_args)
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

    t = threading.Thread(target=_run_lic_job, args=(job_id, mp_params, filter_args, ck, query_dates), daemon=True)
    t.start()
    return jsonify({"status": "pending", "jobId": job_id}), 202


@app.route("/api/jobs/<job_id>")
def get_job(job_id: str):
    with _jobs_lock:
        raw_job = _jobs.get(job_id)
        job = dict(raw_job) if raw_job is not None else None
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

    payload = {
        "status": "error",
        "error": job.get("error", "Error desconocido"),
        "recoverable": bool(job.get("recoverable", False)),
    }
    if job.get("partial") is not None:
        payload["partial"] = job["partial"]
    if job.get("data") is not None:
        payload["data"] = job["data"]
    return jsonify(payload), 200


@app.route("/api/ordenes-compra")
def get_ordenes_compra():
    ticket = request.headers.get("X-MP-Ticket", "").strip()
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

    # --- Listing by date range (day-by-day) + optional estado ---
    params = {"ticket": ticket}
    all_args = dict(request.args)
    all_args.pop("region", None)

    fecha_inicio_iso = request.args.get("fechaInicio", "").strip()
    fecha_fin_iso = request.args.get("fechaFin", "").strip()
    query_dates = _build_query_dates(fecha_inicio_iso, fecha_fin_iso)
    if not query_dates:
        return jsonify({"error": "Rango de fechas inválido."}), 400
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
    ticket = request.headers.get("X-MP-Ticket", "").strip() or request.args.get("ticket", "").strip()
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
    ticket = request.headers.get("X-MP-Ticket", "").strip() or request.args.get("ticket", "").strip()
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


def call_mp_api2(path: str, params: dict, ticket: str, retries: int = MP_MAX_RETRIES):
    """Call Mercado Público API v2 (Compra Ágil) with exponential retry, jitter and circuit breaker."""

    def _request_with_retry():
        last_err = None
        max_attempts = 1 + max(0, retries)
        headers = {**MP_HEADERS, "ticket": ticket}

        for attempt in range(max_attempts):
            try:
                _throttle_mp_api()
                resp = requests.get(
                    f"{MP_API2_BASE}{path}",
                    params=params,
                    headers=headers,
                    timeout=90,
                    verify=False,
                )

                if _is_retryable_status(resp.status_code):
                    raise requests.HTTPError(f"Error HTTP {resp.status_code}", response=resp)

                resp.raise_for_status()
                data = resp.json()

                if isinstance(data, dict) and data.get("success") == "NOK":
                    errors = data.get("errors") or []
                    first_err = errors[0] if errors else {}
                    codigo = str(first_err.get("codigo", ""))
                    mensaje = first_err.get("mensaje", "Error desconocido")
                    if codigo == "429":
                        fake_resp = type("R", (), {"status_code": 429})()
                        raise requests.HTTPError(f"Rate limited: {mensaje}", response=fake_resp)
                    raise RuntimeError(f"API error {codigo}: {mensaje}")

                return data

            except requests.HTTPError as e:
                status_code = getattr(getattr(e, "response", None), "status_code", 0)
                last_err = e
                if attempt < max_attempts - 1 and _is_retryable_status(status_code):
                    time.sleep(_backoff_seconds(attempt))
                    continue
                raise

            except (requests.Timeout, requests.ConnectionError, requests.RequestException, ValueError) as e:
                last_err = e
                if attempt < max_attempts - 1:
                    time.sleep(_backoff_seconds(attempt))
                    continue
                raise

        raise last_err or RuntimeError("Max retries exceeded")

    return mp_circuit_breaker.call(_request_with_retry)


ESTADO_CA_LABEL = {
    "publicada": "Publicada",
    "cerrada": "Cerrada",
    "desierta": "Desierta",
    "cancelada": "Cancelada",
    "proveedor_seleccionado": "Proveedor Seleccionado",
    "oc_emitida": "OC Emitida",
}


def normalize_compra_agil_item(item: dict) -> dict:
    """Normalize a Compra Ágil list item to a flat, frontend-friendly dict."""
    estado = item.get("estado") or {}
    convocatoria = item.get("convocatoria") or {}
    fechas = item.get("fechas") or {}
    montos = item.get("montos") or {}
    institucion = item.get("institucion") or {}
    resumen = item.get("resumen") or {}
    motivos = item.get("motivos") or {}
    links = item.get("links") or {}

    estado_codigo = estado.get("codigo", "")
    estado_glosa = estado.get("glosa") or ESTADO_CA_LABEL.get(estado_codigo, estado_codigo)

    region_code = institucion.get("region")
    region_name = institucion.get("nombre_region") or ""
    if not region_name and region_code:
        region_name = REGION_CODE_TO_NAME.get(str(region_code), "")

    return {
        "codigo": item.get("codigo", ""),
        "nombre": item.get("nombre", ""),
        "estadoCodigo": estado_codigo,
        "estadoGlosa": estado_glosa,
        "llamado": convocatoria.get("estado_convocatoria", 1),
        "descripcionLlamado": convocatoria.get("descripcion", ""),
        "fechaPublicacion": (fechas.get("fecha_publicacion") or "")[:10],
        "fechaCierre": (fechas.get("fecha_cierre") or "")[:10],
        "fechaUltimoCambio": (fechas.get("fecha_ultimo_cambio") or "")[:10],
        "moneda": montos.get("moneda", "CLP"),
        "monto": float(montos.get("monto_disponible_clp") or montos.get("monto_disponible") or 0),
        "organismo": institucion.get("organismo_comprador", ""),
        "rutOrganismo": institucion.get("rut", ""),
        "unidadCompra": institucion.get("unidad_compra", ""),
        "region": _normalize_region(region_name or str(region_code or "")),
        "regionCode": region_code,
        "totalOfertas": resumen.get("total_ofertas_recibidas", 0),
        "motivoCancelacion": motivos.get("motivo_cancelacion") or "",
        "motivoDesierta": motivos.get("motivo_desierta") or "",
        "motivoSeleccion": motivos.get("motivo_seleccion") or "",
        "urlDetalle": links.get("detalle") or f"/v2/compra-agil/{item.get('codigo', '')}",
    }


def normalize_compra_agil_detail(payload: dict) -> dict:
    """Normalize full Compra Ágil detail response."""
    base = normalize_compra_agil_item(payload)
    presupuesto = payload.get("presupuesto") or {}
    entrega = payload.get("entrega") or {}
    orden_compra = payload.get("orden_compra") or {}
    flags = payload.get("flags") or {}
    convocatoria = payload.get("convocatoria") or {}

    proveedores = []
    for prov in payload.get("proveedores_cotizando") or []:
        proveedores.append({
            "rut": prov.get("rut_proveedor", ""),
            "razonSocial": prov.get("razon_social", ""),
            "esEmt": bool(prov.get("es_emt", False)),
            "valorNeto": float(prov.get("valor_neto") or 0),
            "montoTotal": float(prov.get("monto_total") or 0),
            "montoDespacho": float(prov.get("monto_despacho") or 0),
            "totalImpuesto": float(prov.get("total_impuesto") or 0),
            "estadoCotizacion": (prov.get("estado_por_comprador") or ""),
            "seleccionado": bool((prov.get("seleccion") or {}).get("proveedor_seleccionado", False)),
            "activo": bool(prov.get("activo", True)),
            "descripcionCotizacion": prov.get("descripcion_cotizacion") or "",
        })

    productos = []
    for prod in payload.get("productos_solicitados") or []:
        productos.append({
            "codigoProducto": prod.get("codigo_producto", ""),
            "nombre": prod.get("nombre", ""),
            "descripcion": prod.get("descripcion") or "",
            "cantidad": float(prod.get("cantidad") or 0),
            "unidadMedida": prod.get("unidad_medida", ""),
        })

    base.update({
        "descripcion": payload.get("descripcion", ""),
        "presupuestoEstimado": float(presupuesto.get("presupuesto_estimado") or 0),
        "tipoPresupuesto": presupuesto.get("tipo_presupuesto") or "",
        "direccionEntrega": entrega.get("direccion_entrega") or "",
        "plazoEntregaDias": entrega.get("plazo_entrega_dias"),
        "idOrdenCompra": orden_compra.get("id_orden_compra"),
        "idOC": orden_compra.get("id_oc"),
        "codigoOrdenCompra": orden_compra.get("codigo_orden_compra"),
        "estadoOrdenCompra": orden_compra.get("estado_orden_compra"),
        "tieneOC": orden_compra.get("id_orden_compra") is not None,
        "fechaCierrePrimerLlamado": (convocatoria.get("fecha_cierre_primer_llamado") or "")[:10],
        "fechaCierreSegundoLlamado": (convocatoria.get("fecha_cierre_segundo_llamado") or "")[:10],
        "consideraMedioAmbiental": bool(flags.get("considera_requisitos_medioambientales", False)),
        "consideraImpactoSocial": bool(flags.get("considera_requisitos_impacto_social_economico", False)),
        "proveedoresCotizando": proveedores,
        "productosSolicitados": productos,
    })
    return base


@app.route("/api/compra-agil")
def get_compra_agil():
    """Search/list Compras Ágiles using the v2 API with full filtering and pagination."""
    ticket = request.headers.get("X-MP-Ticket", "").strip() or request.args.get("ticket", "").strip()
    if not ticket:
        return jsonify({"error": "API key no configurada. Ingresa tu ticket en la configuración."}), 401

    # Build API params
    api_params = {}

    # Time window filters (Grupo 1)
    ttl_cambio_ms = request.args.get("ttl_cambio_ms", "").strip()
    cambio_desde = request.args.get("cambio_desde", "").strip()
    cambio_hasta = request.args.get("cambio_hasta", "").strip()
    publicado_desde = request.args.get("publicado_desde", "").strip()
    publicado_hasta = request.args.get("publicado_hasta", "").strip()

    if ttl_cambio_ms:
        try:
            api_params["ttl_cambio_ms"] = int(ttl_cambio_ms)
        except ValueError:
            pass
    elif cambio_desde or cambio_hasta:
        if cambio_desde:
            api_params["cambio_desde"] = cambio_desde
        if cambio_hasta:
            api_params["cambio_hasta"] = cambio_hasta
    elif publicado_desde or publicado_hasta:
        if publicado_desde:
            # Convert YYYY-MM-DD to ISO-8601
            if len(publicado_desde) == 10:
                api_params["publicado_desde"] = publicado_desde + "T00:00:00Z"
            else:
                api_params["publicado_desde"] = publicado_desde
        if publicado_hasta:
            if len(publicado_hasta) == 10:
                api_params["publicado_hasta"] = publicado_hasta + "T23:59:59Z"
            else:
                api_params["publicado_hasta"] = publicado_hasta
    else:
        # Default: last 7 days
        api_params["ttl_cambio_ms"] = 7 * 24 * 60 * 60 * 1000

    # Estado filter (Grupo 3) - can be comma-separated
    estado = request.args.get("estado", "").strip()
    if estado:
        api_params["estado"] = estado

    # Region filter (Grupo 4) - can be comma-separated numeric codes
    region = request.args.get("region", "").strip()
    if region:
        # Convert region name to code if needed
        region_parts = []
        for r in region.split(","):
            r = r.strip()
            if r.isdigit():
                region_parts.append(r)
            else:
                # Try to map name to code
                r_norm = _normalize_text(r)
                for code, name in REGION_CODE_TO_NAME.items():
                    if _normalize_text(name) == r_norm or r_norm in _normalize_text(name):
                        region_parts.append(code)
                        break
        if region_parts:
            api_params["region"] = ",".join(region_parts)

    # Keyword search (Grupo 5)
    q = request.args.get("q", "").strip()
    codigo_ca = request.args.get("id", "").strip()
    if codigo_ca:
        api_params["id"] = codigo_ca
    elif q:
        api_params["q"] = q

    # Pagination (Grupo 6)
    tamano_pagina = min(50, max(1, int(request.args.get("tamano_pagina", "50") or 50)))
    numero_pagina = max(1, int(request.args.get("numero_pagina", "1") or 1))
    api_params["tamano_pagina"] = tamano_pagina
    api_params["numero_pagina"] = numero_pagina

    # Sort (Grupo 7)
    ordenar_por = request.args.get("ordenar_por", "FechaPublicacion").strip()
    if ordenar_por:
        api_params["ordenar_por"] = ordenar_por

    # Cache
    ck = cache_key_from_params("ca_list", {**api_params})
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)

    try:
        data = call_mp_api2("/v2/compra-agil", api_params, ticket)
    except requests.Timeout:
        return jsonify({"error": "La API de Compra Ágil tardó demasiado"}), 504
    except requests.HTTPError as e:
        code = getattr(getattr(e, "response", None), "status_code", 502)
        if code == 429:
            return jsonify({"error": "Cuota diaria agotada. Intenta mañana o usa un ticket con mayor límite."}), 429
        return jsonify({"error": f"Error HTTP {code} de la API"}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 502

    payload = data.get("payload") or {}
    items_raw = payload.get("items") or []
    paginacion = payload.get("paginacion") or {}

    # Client-side busqueda filter (keyword on organismo)
    busqueda = request.args.get("busqueda", "").strip().lower()
    items = [normalize_compra_agil_item(i) for i in items_raw]
    if busqueda:
        items = [
            i for i in items
            if busqueda in i["nombre"].lower()
            or busqueda in i["organismo"].lower()
            or busqueda in i["codigo"].lower()
        ]

    output = {
        "total": paginacion.get("total_resultados", len(items)),
        "totalPaginas": paginacion.get("total_paginas", 1),
        "numeroPagina": paginacion.get("numero_pagina", numero_pagina),
        "tamanoPagina": paginacion.get("tamano_pagina", tamano_pagina),
        "listado": items,
    }
    cache.set(ck, output)
    return jsonify(output)


@app.route("/api/compra-agil/<path:codigo>")
def get_compra_agil_detail(codigo):
    """Fetch full detail for a single Compra Ágil by its code."""
    ticket = request.headers.get("X-MP-Ticket", "").strip() or request.args.get("ticket", "").strip()
    if not ticket:
        return jsonify({"error": "API key no configurada"}), 401
    ck = cache_key_from_params("ca_detail", {"codigo": codigo})
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)
    try:
        data = call_mp_api2(f"/v2/compra-agil/{codigo}", {}, ticket)
    except requests.Timeout:
        return jsonify({"error": "Timeout"}), 504
    except (requests.HTTPError, RuntimeError, requests.RequestException) as e:
        return jsonify({"error": str(e)}), 502
    payload = data.get("payload")
    if not payload:
        return jsonify({"error": "No encontrada"}), 404
    result = normalize_compra_agil_detail(payload)
    cache.set(ck, result)
    return jsonify(result)


@app.route("/api/compra-agil-analytics")
def get_compra_agil_analytics():
    """Returns aggregated market analytics from Compra Ágil results."""
    ticket = request.headers.get("X-MP-Ticket", "").strip() or request.args.get("ticket", "").strip()
    if not ticket:
        return jsonify({"error": "API key no configurada"}), 401

    # Fetch up to 3 pages of data (150 records) for analytics
    all_items = []
    for page in range(1, 4):
        api_params = {
            "ttl_cambio_ms": 30 * 24 * 60 * 60 * 1000,  # last 30 days
            "tamano_pagina": 50,
            "numero_pagina": page,
            "ordenar_por": "FechaPublicacion",
        }

        # Apply any filters from request
        estado = request.args.get("estado", "").strip()
        if estado:
            api_params["estado"] = estado
        region = request.args.get("region", "").strip()
        if region and region.isdigit():
            api_params["region"] = region
        q = request.args.get("q", "").strip()
        if q:
            api_params["q"] = q

        ck = cache_key_from_params("ca_analytics", {**api_params})
        cached = cache.get(ck)
        if cached is not None:
            batch = cached
        else:
            try:
                data = call_mp_api2("/v2/compra-agil", api_params, ticket)
                payload = data.get("payload") or {}
                batch_raw = payload.get("items") or []
                paginacion = payload.get("paginacion") or {}
                batch = [normalize_compra_agil_item(i) for i in batch_raw]
                cache.set(ck, batch)
                if page >= paginacion.get("total_paginas", 1):
                    all_items.extend(batch)
                    break
            except Exception:
                break
        all_items.extend(batch)

    # Build analytics
    total_monto = sum(i["monto"] for i in all_items if i["monto"])
    total_ofertas = sum(i["totalOfertas"] for i in all_items)

    # By estado
    by_estado: dict = {}
    for i in all_items:
        k = i["estadoGlosa"]
        by_estado.setdefault(k, {"count": 0, "monto": 0})
        by_estado[k]["count"] += 1
        by_estado[k]["monto"] += i["monto"]

    # By region
    by_region: dict = {}
    for i in all_items:
        k = i["region"] or "Sin región"
        by_region.setdefault(k, {"count": 0, "monto": 0})
        by_region[k]["count"] += 1
        by_region[k]["monto"] += i["monto"]

    # By organismo (top 10)
    by_organismo: dict = {}
    for i in all_items:
        k = i["organismo"] or "Sin organismo"
        by_organismo.setdefault(k, {"count": 0, "monto": 0})
        by_organismo[k]["count"] += 1
        by_organismo[k]["monto"] += i["monto"]
    top_organismos = sorted(by_organismo.items(), key=lambda x: x[1]["monto"], reverse=True)[:10]

    # By date (last 30 days trend)
    by_date: dict = {}
    for i in all_items:
        k = i["fechaPublicacion"][:7] if i["fechaPublicacion"] else "Sin fecha"  # YYYY-MM
        by_date.setdefault(k, {"count": 0, "monto": 0})
        by_date[k]["count"] += 1
        by_date[k]["monto"] += i["monto"]

    return jsonify({
        "totalProcesos": len(all_items),
        "totalMonto": total_monto,
        "totalOfertas": total_ofertas,
        "promedioOfertas": round(total_ofertas / len(all_items), 2) if all_items else 0,
        "promedioMonto": round(total_monto / len(all_items), 2) if all_items else 0,
        "byEstado": [{"estado": k, **v} for k, v in by_estado.items()],
        "byRegion": sorted([{"region": k, **v} for k, v in by_region.items()], key=lambda x: x["monto"], reverse=True),
        "topOrganismos": [{"organismo": k, **v} for k, v in top_organismos],
        "tendenciaMensual": sorted([{"mes": k, **v} for k, v in by_date.items()], key=lambda x: x["mes"]),
    })


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
    if path:
        full_path = os.path.join(DIST_DIR, path)
        if os.path.isfile(full_path):
            return send_from_directory(DIST_DIR, path)

        # Return 404 for missing static files instead of SPA fallback HTML.
        _, ext = os.path.splitext(path)
        is_assets_path = path == "assets" or path.startswith("assets/")
        if is_assets_path or ext:
            return jsonify({"error": "Static file not found", "path": path}), 404

    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

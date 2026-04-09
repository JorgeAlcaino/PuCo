import os
import hashlib
from datetime import datetime, timedelta

import requests
from flask import Flask, jsonify, send_from_directory, request
from flask_caching import Cache
from flask_cors import CORS

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
TICKET = os.environ.get("MERCADO_PUBLICO_TICKET", "")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
cache = Cache(app, config={"CACHE_TYPE": "SimpleCache", "CACHE_DEFAULT_TIMEOUT": 300})

# ── Estado mappings ──────────────────────────────────────────────────────────

ESTADO_LIC_TO_CODE = {
    "Publicada": "5",
    "Cerrada": "6",
    "Desierta": "7",
    "Adjudicada": "8",
    "Revocada": "18",
    "Suspendida": "19",
}
ESTADO_LIC_BY_CODE = {v: k for k, v in ESTADO_LIC_TO_CODE.items()}

ESTADO_OC_BY_CODE = {
    "1": "Enviada al Proveedor",
    "2": "Aceptada",
    "3": "Cancelada",
    "6": "Recepción Conforme",
    "7": "Pendiente",
    "8": "Parcialmente Recepcionada",
    "9": "Recepción Incompleta",
}
ESTADO_OC_TO_CODE = {v: k for k, v in ESTADO_OC_BY_CODE.items()}


# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_date(value: str) -> str:
    """Normalize /Date(ms)/ and ISO formats to YYYY-MM-DD."""
    if not value:
        return ""
    if value.startswith("/Date("):
        ts = int(value[6:value.index(")")])
        return datetime.utcfromtimestamp(ts / 1000).strftime("%Y-%m-%d")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value[:19], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value[:10]


def normalize_licitacion(lic: dict) -> dict:
    fechas = lic.get("Fechas") or {}
    comprador = lic.get("Comprador") or {}
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
    return {
        "codigo": codigo,
        "nombre": lic.get("Nombre", ""),
        "organismo": comprador.get("NombreOrganismo", ""),
        "estado": estado,
        "monto": float(monto),
        "fechaPublicacion": parse_date(fechas.get("FechaPublicacion", "")),
        "fechaCierre": parse_date(lic.get("FechaCierre") or fechas.get("FechaCierre", "")),
        "region": comprador.get("RegionUnidad", "") or comprador.get("Region", ""),
        "tipo": lic.get("Tipo", ""),
        "urlDetalle": f"https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs={codigo}",
    }


def normalize_orden_compra(oc: dict) -> dict:
    fechas = oc.get("Fechas") or {}
    comprador = oc.get("Comprador") or {}
    proveedor = oc.get("Proveedor") or {}
    items = oc.get("Items") or {}
    codigo = oc.get("Codigo", "")
    estado_code = str(oc.get("CodigoEstado", ""))
    return {
        "codigo": codigo,
        "producto": oc.get("Nombre", ""),
        "proveedor": proveedor.get("Nombre", ""),
        "organismo": comprador.get("NombreOrganismo", ""),
        "estado": ESTADO_OC_BY_CODE.get(estado_code, f"Estado {estado_code}"),
        "monto": float(oc.get("Total") or oc.get("TotalNeto") or 0),
        "cantidad": int(items.get("Cantidad") or 0),
        "fechaEmision": parse_date(fechas.get("FechaEnvio") or fechas.get("FechaCreacion", "")),
        "fechaEntrega": parse_date(fechas.get("FechaAceptacion", "")),
        "region": comprador.get("RegionUnidad", "") or proveedor.get("Region", ""),
        "urlDetalle": f"https://www.mercadopublico.cl/Procurement/Modules/PO/DetailsPurchaseOrder.aspx?qs={codigo}",
    }


def cache_key_from_params(prefix: str, params: dict) -> str:
    raw = f"{prefix}_{sorted(params.items())}"
    return hashlib.md5(raw.encode()).hexdigest()


def call_mp_api(endpoint: str, params: dict):
    """Call Mercado Público API and return parsed JSON or raise."""
    resp = requests.get(
        f"{MP_API_BASE}/{endpoint}",
        params=params,
        headers=MP_HEADERS,
        timeout=30,
        verify=False,
    )
    resp.raise_for_status()
    data = resp.json()
    # API may return application-level errors with 200 or non-200 status
    if isinstance(data, dict) and "Codigo" in data and "Listado" not in data:
        codigo = data.get("Codigo", 0)
        mensaje = data.get("Mensaje", "Error desconocido")
        if codigo == 10500:
            raise requests.HTTPError("Rate limited", response=type("R", (), {"status_code": 429})())
        raise RuntimeError(f"API error {codigo}: {mensaje}")
    return data


def _default_date_range(days_back: int = 30) -> tuple:
    """Return (fechaInicio, fechaFin) covering the last N days in DD/MM/YYYY."""
    today = datetime.utcnow()
    since = today - timedelta(days=days_back)
    return since.strftime("%d/%m/%Y"), today.strftime("%d/%m/%Y")


def _to_mp_date(iso_date: str) -> str:
    """Convert YYYY-MM-DD (HTML input) or DD/MM/YYYY to DD/MM/YYYY for MP API."""
    if not iso_date:
        return ""
    if len(iso_date) == 10 and iso_date[4] == "-":
        # YYYY-MM-DD → DD/MM/YYYY
        return f"{iso_date[8:10]}/{iso_date[5:7]}/{iso_date[:4]}"
    return iso_date  # already DD/MM/YYYY or unknown


# ── API routes ───────────────────────────────────────────────────────────────

@app.route("/api/licitaciones")
def get_licitaciones():
    if not TICKET:
        return jsonify({"error": "API ticket no configurado en el servidor"}), 503

    params = {"ticket": TICKET}

    estado = request.args.get("estado", "")
    if estado and estado != "Todos":
        codigo = ESTADO_LIC_TO_CODE.get(estado)
        if codigo:
            params["estado"] = codigo

    busqueda = request.args.get("busqueda", "")
    if busqueda:
        params["nombre"] = busqueda

    tipo = request.args.get("tipo", "")
    if tipo:
        params["tipo"] = tipo

    # Use explicit date range from user, or default to last 30 days to avoid
    # returning tens-of-thousands of results that cause API timeouts.
    fecha_inicio = _to_mp_date(request.args.get("fechaInicio", ""))
    fecha_fin = _to_mp_date(request.args.get("fechaFin", ""))
    if fecha_inicio:
        params["fechaInicio"] = fecha_inicio
    if fecha_fin:
        params["fechaFin"] = fecha_fin
    if not busqueda and not fecha_inicio:
        fi, ff = _default_date_range(30)
        params["fechaInicio"] = fi
        params["fechaFin"] = ff

    ck = cache_key_from_params("lic", params)
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)

    try:
        data = call_mp_api("licitaciones.json", params)
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

    region = request.args.get("region", "")
    if region and region != "Todas":
        listado = [r for r in listado if region.lower() in r["region"].lower()]

    sort_field = request.args.get("sortField", "fechaPublicacion")
    reverse = request.args.get("sortOrder", "desc") == "desc"
    listado.sort(key=lambda x: x.get(sort_field) or "", reverse=reverse)

    output = {"total": len(listado), "listado": listado}
    cache.set(ck, output)
    return jsonify(output)


@app.route("/api/ordenes-compra")
def get_ordenes_compra():
    if not TICKET:
        return jsonify({"error": "API ticket no configurado en el servidor"}), 503

    params = {"ticket": TICKET}

    estado = request.args.get("estado", "")
    if estado and estado != "Todos":
        codigo = ESTADO_OC_TO_CODE.get(estado)
        if codigo:
            params["estado"] = codigo

    busqueda = request.args.get("busqueda", "")
    if busqueda:
        params["nombre"] = busqueda

    tipo = request.args.get("tipo", "")
    if tipo:
        params["tipo"] = tipo

    fecha_inicio = _to_mp_date(request.args.get("fechaInicio", ""))
    fecha_fin = _to_mp_date(request.args.get("fechaFin", ""))
    if fecha_inicio:
        params["fechaInicio"] = fecha_inicio
    if fecha_fin:
        params["fechaFin"] = fecha_fin
    if not busqueda and not fecha_inicio:
        fi, ff = _default_date_range(30)
        params["fechaInicio"] = fi
        params["fechaFin"] = ff

    ck = cache_key_from_params("oc", params)
    cached = cache.get(ck)
    if cached is not None:
        return jsonify(cached)

    try:
        data = call_mp_api("OrdenCompra.json", params)
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

    listado = [normalize_orden_compra(o) for o in (data.get("Listado") or [])]

    region = request.args.get("region", "")
    if region and region != "Todas":
        listado = [r for r in listado if region.lower() in r["region"].lower()]

    # Extra client-side text filtering on proveedor/codigo
    if busqueda:
        low = busqueda.lower()
        listado = [
            r for r in listado
            if low in r.get("producto", "").lower()
            or low in r.get("codigo", "").lower()
            or low in r.get("proveedor", "").lower()
        ]

    sort_field = request.args.get("sortField", "fechaEmision")
    if sort_field == "monto":
        listado.sort(key=lambda x: x.get("monto") or 0, reverse=request.args.get("sortOrder", "desc") == "desc")
    else:
        listado.sort(key=lambda x: x.get(sort_field) or "", reverse=request.args.get("sortOrder", "desc") == "desc")

    output = {"total": len(listado), "listado": listado}
    cache.set(ck, output)
    return jsonify(output)


# ── Static / SPA ─────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "healthy"}), 200


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    full_path = os.path.join(DIST_DIR, path)
    if path and os.path.exists(full_path):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

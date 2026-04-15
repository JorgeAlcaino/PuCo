
## PuCo

Aplicacion web para consultar licitaciones y ordenes de compra de Mercado Publico.

Stack:
- Frontend: Vite + React
- Backend: Flask + Gunicorn
- Deploy: Render (Blueprint via render.yaml)

## Ejecutar localmente

1. Instala dependencias Python:

```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Instala dependencias Node:

```bash
pnpm install
```

3. Levanta frontend y backend:

```bash
pnpm dev
python app.py
```

El frontend usa proxy a http://localhost:5000 para /api.

## Deploy en Render

Este repo ya incluye [render.yaml](render.yaml) para deploy automatico.

### Opcion recomendada: Blueprint

1. Sube el repo a GitHub.
2. En Render, usa New + Blueprint.
3. Selecciona el repo.
4. Render detectara [render.yaml](render.yaml) y creara el servicio web.

### Variables de entorno importantes

- MERCADO_PUBLICO_TICKET (opcional, recomendado en produccion)
  - Si esta definida, el backend la usa automaticamente cuando no llega header X-MP-Ticket desde el navegador.
- PYTHON_VERSION (ya definida en render.yaml)
- NODE_VERSION (ya definida en render.yaml)

### Build y arranque configurados

- Build:
  - instala dependencias Python
  - instala pnpm
  - instala dependencias Node con lockfile
  - compila frontend en dist/
- Start:
  - gunicorn app:app --bind 0.0.0.0:$PORT --timeout 180 --workers 1 --threads 4

### Health check

- Endpoint: /health

## Notas operativas

- El backend sirve el frontend compilado desde dist/.
- Si no configuras ticket en el navegador, igual puedes operar con MERCADO_PUBLICO_TICKET en Render.
  
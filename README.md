
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

Este repo ya incluye [render.yaml](render.yaml) para deploy automatico. El despliegue usa un solo web service en Render: Flask sirve la API y también el frontend compilado desde `dist/`, así que en producción no necesitas un servidor aparte para Vite.

### Opcion recomendada: Blueprint

1. Sube el repo a GitHub.
2. En Render, usa New + Blueprint.
3. Selecciona el repo.
4. Render detectara [render.yaml](render.yaml) y creara el servicio web.

### Variables de entorno importantes

- PYTHON_VERSION (ya definida en render.yaml)
- NODE_VERSION (ya definida en render.yaml)
- El ticket se ingresa por usuario desde la navbar y se guarda solo en su navegador.

### Build y arranque configurados

- Build:
  - instala dependencias Python
  - instala pnpm
  - instala dependencias Node con lockfile
  - compila frontend en dist/
- Start:
  - gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120 --workers 1
- Routing:
  - `/api/*` queda atendido por Flask
  - rutas SPA del frontend se resuelven con `dist/index.html`
  - assets faltantes (por ejemplo en `/assets/*`) responden 404 para evitar errores MIME

### Health check

- Endpoint: /health

### Checklist rapido

1. Crear el Blueprint en Render desde este repositorio.
2. Verificar que el deploy termine y que `/health` responda `200`.
3. Abrir la URL pública y configurar la API key desde la navbar.
4. Probar una búsqueda en Licitaciones u Órdenes de Compra.

## Notas operativas

- El backend sirve el frontend compilado desde dist/.
- Si no configuras ticket en el navegador, la app no puede consultar la API hasta que cada usuario ingrese su propio ticket.
  
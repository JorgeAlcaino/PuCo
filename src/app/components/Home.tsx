import { ArrowRight, FileText, Hospital, KeyRound, ShoppingCart, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';

export function Home() {
  const openApiKeyDialog = () => {
    window.dispatchEvent(new Event('mp-open-api-key'));
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 md:px-10 md:py-12">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative max-w-3xl space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Monitoreo de compras del Estado de Chile
          </p>

          <div className="space-y-3">
            <h1 className="text-3xl leading-tight md:text-4xl">
              Consulta licitaciones y ordenes de compra en un solo lugar
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              PuCo conecta con Mercado Publico para ayudarte a buscar, filtrar y exportar resultados de forma rapida.
              Puedes empezar configurando tu API key y luego navegar directo a cada funcionalidad.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={openApiKeyDialog} size="lg" className="sm:min-w-56">
              <KeyRound className="h-4 w-4" />
              Configurar API key primero
            </Button>
            <Button asChild variant="outline" size="lg" className="sm:min-w-56">
              <Link to="/como-funciona">
                Ver como funciona
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent/30">
          <div className="mb-4 flex items-start justify-between">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Busqueda API</span>
          </div>
          <h2 className="mb-2 text-lg">Licitaciones</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Revisa oportunidades abiertas, estados, tipos y regiones. Luego refina los resultados sin volver a consultar la API.
          </p>
          <Button asChild className="w-full" variant="secondary">
            <Link to="/licitaciones">Ir a licitaciones</Link>
          </Button>
        </article>

        <article className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent/30">
          <div className="mb-4 flex items-start justify-between">
            <div className="rounded-lg bg-green-500/10 p-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Seguimiento</span>
          </div>
          <h2 className="mb-2 text-lg">Ordenes de compra</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Busca compras emitidas por organismos publicos, analiza su estado y exporta en CSV lo que realmente te interesa.
          </p>
          <Button asChild className="w-full" variant="secondary">
            <Link to="/ordenes-compra">Ir a ordenes</Link>
          </Button>
        </article>

        <article className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent/30">
          <div className="mb-4 flex items-start justify-between">
            <div className="rounded-lg bg-red-500/10 p-2">
              <Hospital className="h-5 w-5 text-red-600" />
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Sector salud</span>
          </div>
          <h2 className="mb-2 text-lg">Establecimientos</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Explora el directorio de establecimientos de salud para entender mejor el filtro especializado del sistema.
          </p>
          <Button asChild className="w-full" variant="secondary">
            <Link to="/establecimientos-salud">Ver establecimientos</Link>
          </Button>
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <h2 className="mb-4 text-xl">Como empezar en 3 pasos</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-sm text-muted-foreground">Paso 1</p>
            <p className="font-medium">Configura tu ticket API</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Usa el boton principal o el icono de llave en la barra superior.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-sm text-muted-foreground">Paso 2</p>
            <p className="font-medium">Elige un modulo</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Licitaciones para oportunidades o ordenes para compras ya emitidas.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-sm text-muted-foreground">Paso 3</p>
            <p className="font-medium">Refina y exporta</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Aplica filtros secundarios, revisa detalle y descarga tus resultados.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

import { ExternalLink, FileText, HelpCircle, Hospital, Info, KeyRound, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';

export function ComoFunciona() {
  const openApiKeyDialog = () => {
    window.dispatchEvent(new Event('mp-open-api-key'));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1>Como funciona PuCo</h1>
        <p className="mt-1 text-muted-foreground">
          Guia rapida para entender la plataforma y pasar de la explicacion a la accion.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <HelpCircle className="h-5 w-5 text-primary" />
          Que es esta plataforma
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          PuCo consulta licitaciones y ordenes de compra publicadas en
          <a
            href="https://www.mercadopublico.cl"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
          >
            Mercado Publico
            <ExternalLink className="h-3 w-3" />
          </a>
          . La idea es simple: haces una busqueda principal en la API, luego aplicas filtros para quedarte solo con lo relevante y finalmente exportas los resultados.
        </p>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="h-5 w-5 text-yellow-500" />
          Paso 1: configura tu API key
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          Para consultar datos en tiempo real necesitas tu ticket API de Mercado Publico. Se guarda localmente en tu navegador.
        </p>
        <div className="flex flex-col gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Puedes configurarla ahora mismo desde esta guia y luego entrar a cualquier modulo.
          </p>
          <Button onClick={openApiKeyDialog} className="w-full md:w-auto">
            Configurar API key
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Elige tu funcionalidad</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <article className="space-y-3 rounded-lg border border-border bg-background p-4">
            <h3 className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-blue-600" />
              Licitaciones
            </h3>
            <p className="text-sm text-muted-foreground">
              Busca por palabra clave o codigo, filtra por estado, tipo y region, y exporta el resultado final a CSV.
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/licitaciones">Ir a licitaciones</Link>
            </Button>
          </article>

          <article className="space-y-3 rounded-lg border border-border bg-background p-4">
            <h3 className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4 text-green-600" />
              Ordenes de compra
            </h3>
            <p className="text-sm text-muted-foreground">
              Revisa compras emitidas por organismos publicos y usa filtros para depurar informacion por fecha, tipo y estado.
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/ordenes-compra">Ir a ordenes</Link>
            </Button>
          </article>

          <article className="space-y-3 rounded-lg border border-border bg-background p-4">
            <h3 className="flex items-center gap-2 text-base">
              <Hospital className="h-4 w-4 text-red-600" />
              Establecimientos de salud
            </h3>
            <p className="text-sm text-muted-foreground">
              Consulta el directorio de establecimientos usado para el filtro de salud en licitaciones y ordenes.
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/establecimientos-salud">Ver establecimientos</Link>
            </Button>
          </article>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Consejos para mejores resultados</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Usa una busqueda principal amplia y luego aplica el filtro secundario debajo de la tabla.</li>
          <li>Si buscas por codigo exacto, el resultado llega mas rapido y con menos ruido.</li>
          <li>Activa el filtro de establecimientos de salud cuando quieras una vista sectorial.</li>
        </ul>

        <div className="flex gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
          <p className="text-muted-foreground">
            Si aun no tienes ticket, puedes solicitarlo desde el portal de API de ChileCompra y volver a esta app para continuar.
          </p>
        </div>
      </section>
    </div>
  );
}

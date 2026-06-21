import { ArrowRight, FileText, Hospital, KeyRound, ShoppingCart, Sparkles, Zap, TrendingUp, BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';

const FEATURES = [
  {
    to: '/licitaciones',
    icon: FileText,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600',
    badge: 'Búsqueda API',
    badgeBg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    title: 'Licitaciones',
    desc: 'Revisa oportunidades abiertas, estados, tipos y regiones. Refina sin volver a consultar la API.',
    cta: 'Ir a licitaciones',
  },
  {
    to: '/ordenes-compra',
    icon: ShoppingCart,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-600',
    badge: 'Seguimiento',
    badgeBg: 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300',
    title: 'Órdenes de Compra',
    desc: 'Busca compras emitidas por organismos públicos, analiza su estado y exporta en CSV.',
    cta: 'Ir a órdenes',
  },
  {
    to: '/compra-agil',
    icon: Zap,
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600',
    badge: 'API v2 · Tiempo real',
    badgeBg: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    title: 'Compra Ágil',
    desc: 'Monitorea procesos de contratación simplificada en tiempo real. Visualiza cotizaciones, proveedores y órdenes de compra emitidas.',
    cta: 'Explorar Compra Ágil',
    highlight: true,
  },
  {
    to: '/analisis-mercado',
    icon: TrendingUp,
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-600',
    badge: 'Inteligencia de mercado',
    badgeBg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
    title: 'Análisis de Mercado',
    desc: 'Dashboard cruzado con tendencias, top organismos compradores, distribución regional y comparativas entre Compras Ágiles y Licitaciones.',
    cta: 'Ver análisis',
    highlight: true,
  },
  {
    to: '/establecimientos-salud',
    icon: Hospital,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-600',
    badge: 'Sector salud',
    badgeBg: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    title: 'Establecimientos',
    desc: 'Directorio de establecimientos de salud para análisis especializados del sector.',
    cta: 'Ver establecimientos',
  },
] as const;

export function Home() {
  const openApiKeyDialog = () => {
    window.dispatchEvent(new Event('mp-open-api-key'));
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-indigo-600/10 via-card to-violet-600/10 px-6 py-10 md:px-10 md:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative max-w-3xl space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Plataforma de análisis de mercado público chileno
          </p>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              Inteligencia de mercado para el Estado de Chile
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              PuCo conecta con Mercado Público para buscar, filtrar y analizar Licitaciones,
              Órdenes de Compra y Compras Ágiles en tiempo real. Toma decisiones con datos actualizados.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={openApiKeyDialog} size="lg" className="sm:min-w-52">
              <KeyRound className="h-4 w-4" />
              Configurar API key primero
            </Button>
            <Button asChild variant="outline" size="lg" className="sm:min-w-52">
              <Link to="/analisis-mercado">
                <BarChart2 className="h-4 w-4" />
                Ir al panel de análisis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section>
        <h2 className="text-xl font-bold mb-4">Funcionalidades</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.to}
              className={`rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:bg-accent/20 flex flex-col ${
                f.highlight ? 'border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-card to-indigo-50/30 dark:to-indigo-950/20' : 'border-border'
              }`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className={`rounded-lg p-2 ${f.iconBg}`}>
                  <f.icon className={`h-5 w-5 ${f.iconColor}`} />
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${f.badgeBg}`}>{f.badge}</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground flex-1">{f.desc}</p>
              <Button asChild className="w-full" variant={f.highlight ? 'default' : 'secondary'}>
                <Link to={f.to}>
                  {f.cta}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </article>
          ))}
        </div>
      </section>

      {/* How to start */}
      <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <h2 className="mb-4 text-xl font-bold">Cómo empezar en 3 pasos</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Configura tu ticket API',
              desc: 'Usa el botón principal o el ícono de llave en la barra superior. Obtén tu ticket gratis en chilecompra.cl/api/',
            },
            {
              step: '2',
              title: 'Elige una funcionalidad',
              desc: 'Explora Compras Ágiles en tiempo real, busca Licitaciones o sigue Órdenes de Compra ya emitidas.',
            },
            {
              step: '3',
              title: 'Analiza y exporta',
              desc: 'Usa el panel de Análisis de Mercado para visión estratégica, o exporta CSV para trabajo offline.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="rounded-lg border border-border bg-background p-4 flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold text-sm">{step}</span>
              <div>
                <p className="font-semibold text-sm">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

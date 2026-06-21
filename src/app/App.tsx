import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Navbar } from './components/Navbar';
import { Home } from './components/Home';
import { ApiKeyProvider } from './context/ApiKeyContext';
import { Loader2 } from 'lucide-react';

const Licitaciones = React.lazy(() => import('./components/Licitaciones').then(m => ({ default: m.Licitaciones })));
const OrdenesCompra = React.lazy(() => import('./components/OrdenesCompra').then(m => ({ default: m.OrdenesCompra })));
const CompraAgil = React.lazy(() => import('./components/CompraAgil').then(m => ({ default: m.CompraAgil })));
const AnalisisMercado = React.lazy(() => import('./components/AnalisisMercado').then(m => ({ default: m.AnalisisMercado })));
const ComoFunciona = React.lazy(() => import('./components/ComoFunciona').then(m => ({ default: m.ComoFunciona })));
const EstablecimientosSalud = React.lazy(() => import('./components/EstablecimientosSalud').then(m => ({ default: m.EstablecimientosSalud })));

const PageLoader = () => (
  <div className="flex h-64 w-full items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

export default function App() {
  return (
    <ApiKeyProvider>
    <ThemeProvider attribute="class" defaultTheme="light">
      <BrowserRouter>
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="container mx-auto w-full flex-1 px-4 py-8">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/licitaciones" element={<Licitaciones />} />
                <Route path="/ordenes-compra" element={<OrdenesCompra />} />
                <Route path="/compra-agil" element={<CompraAgil />} />
                <Route path="/analisis-mercado" element={<AnalisisMercado />} />
                <Route path="/como-funciona" element={<ComoFunciona />} />
                <Route path="/establecimientos-salud" element={<EstablecimientosSalud />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          <footer className="border-t border-border bg-background/80">
            <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
              Desarrollado por Maximiliano Gaete
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </ThemeProvider>
    </ApiKeyProvider>
  );
}


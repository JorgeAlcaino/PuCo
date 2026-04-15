import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Navbar } from './components/Navbar';
import { Licitaciones } from './components/Licitaciones';
import { OrdenesCompra } from './components/OrdenesCompra';
import { ComoFunciona } from './components/ComoFunciona';
import { Home } from './components/Home';
import { EstablecimientosSalud } from './components/EstablecimientosSalud';
import { ApiKeyProvider } from './context/ApiKeyContext';

export default function App() {
  return (
    <ApiKeyProvider>
    <ThemeProvider attribute="class" defaultTheme="light">
      <BrowserRouter>
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="container mx-auto w-full flex-1 px-4 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/licitaciones" element={<Licitaciones />} />
              <Route path="/ordenes-compra" element={<OrdenesCompra />} />
              <Route path="/como-funciona" element={<ComoFunciona />} />
              <Route path="/establecimientos-salud" element={<EstablecimientosSalud />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
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

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Navbar } from './components/Navbar';
import { Licitaciones } from './components/Licitaciones';
import { OrdenesCompra } from './components/OrdenesCompra';
import { ApiKeyProvider } from './context/ApiKeyContext';

export default function App() {
  return (
    <ApiKeyProvider>
    <ThemeProvider attribute="class" defaultTheme="light">
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Navbar />
          <main className="container mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/licitaciones" replace />} />
              <Route path="/licitaciones" element={<Licitaciones />} />
              <Route path="/ordenes-compra" element={<OrdenesCompra />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ThemeProvider>
    </ApiKeyProvider>
  );
}

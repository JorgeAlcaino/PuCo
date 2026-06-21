import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, FileText, ShoppingCart, KeyRound, CheckCircle2, AlertCircle, HelpCircle, Zap, TrendingUp, Menu, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useApiKey } from '../context/ApiKeyContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

const NAV_LINKS = [
  { to: '/licitaciones', label: 'Licitaciones', icon: FileText },
  { to: '/ordenes-compra', label: 'Órdenes de Compra', icon: ShoppingCart },
  { to: '/compra-agil', label: 'Compra Ágil', icon: Zap },
  { to: '/analisis-mercado', label: 'Análisis', icon: TrendingUp },
  { to: '/como-funciona', label: '¿Cómo funciona?', icon: HelpCircle },
] as const;

export function Navbar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { apiKey, setApiKey } = useApiKey();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const openApiKeyDialog = () => {
      setInputValue(apiKey);
      setDialogOpen(true);
    };
    window.addEventListener('mp-open-api-key', openApiKeyDialog);
    return () => window.removeEventListener('mp-open-api-key', openApiKeyDialog);
  }, [apiKey]);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const openDialog = () => {
    setInputValue(apiKey);
    setDialogOpen(true);
  };

  const handleSave = () => {
    setApiKey(inputValue);
    setDialogOpen(false);
  };

  return (
    <>
    <nav className="border-b border-border bg-card/90 backdrop-blur sticky top-0 z-40">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:text-primary flex-shrink-0">
            <span className="text-xl font-bold">PuCo</span>
            <span className="hidden md:inline text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">Mercado Público</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex gap-0.5 flex-1 justify-center">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive(to)
                    ? to === '/compra-agil'
                      ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                      : to === '/analisis-mercado'
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                        : 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1">
            {/* API key button */}
            <button
              onClick={openDialog}
              className="flex items-center gap-1.5 px-2 py-2 rounded-md hover:bg-accent transition-colors text-sm"
              aria-label="Configurar API key"
              title={apiKey ? 'API key configurada' : 'Configurar API key'}
            >
              {apiKey ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-destructive" />
              )}
              <KeyRound className="w-4 h-4" />
              <span className="hidden sm:inline text-muted-foreground text-xs">
                {apiKey ? 'API key' : 'Sin key'}
              </span>
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-2 rounded-md hover:bg-accent transition-colors"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle mobile menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-border py-2 pb-3 space-y-1">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive(to)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API key de Mercado Público</DialogTitle>
          <DialogDescription>
              Cada usuario debe ingresar su propio código API (ticket) de Mercado Público para que la app funcione.{' '}
              Puedes obtenerlo en el portal oficial de API de ChileCompra.{' '}
            <a
              href="https://www.chilecompra.cl/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
                Cómo obtener tu ticket
            </a>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Label htmlFor="api-key-input">Ticket</Label>
          <Input
            id="api-key-input"
            type="password"
            placeholder="Pega tu ticket aquí…"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            autoComplete="off"
          />
          <p className="text-sm text-muted-foreground">
            El ticket se guarda solo en este navegador. Si lo borras, tendrás que volver a ingresarlo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

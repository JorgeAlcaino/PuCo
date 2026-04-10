import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, FileText, ShoppingCart, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
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

export function Navbar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { apiKey, setApiKey } = useApiKey();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

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
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="flex items-center gap-2">
              <span className="text-xl">Mercado Público</span>
            </h1>

            <div className="flex gap-1">
              <Link
                to="/licitaciones"
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  isActive('/licitaciones')
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <FileText className="w-4 h-4" />
                Licitaciones
              </Link>

              <Link
                to="/ordenes-compra"
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  isActive('/ordenes-compra')
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                Órdenes de Compra
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openDialog}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent transition-colors text-sm"
              aria-label="Configurar API key"
              title={apiKey ? 'API key configurada' : 'Configurar API key'}
            >
              {apiKey ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-destructive" />
              )}
              <KeyRound className="w-4 h-4" />
              <span className="hidden sm:inline text-muted-foreground">
                {apiKey ? 'API key' : 'Sin API key'}
              </span>
            </button>

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
          </div>
        </div>
      </div>
    </nav>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API key de Mercado Público</DialogTitle>
          <DialogDescription>
            Ingresa tu ticket de acceso a la API de Mercado Público. Se guarda localmente en tu navegador y se envía con cada consulta.{' '}
            <a
              href="https://www.mercadopublico.cl/Modules/BL/BLPublico/RegistrarUsuario/Register.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              Obtener ticket
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
          {inputValue.trim() === '' && apiKey && (
            <p className="text-sm text-muted-foreground">Deja vacío para eliminar el ticket guardado.</p>
          )}
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

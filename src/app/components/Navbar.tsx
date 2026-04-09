import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, FileText, ShoppingCart } from 'lucide-react';
import { useTheme } from 'next-themes';

export function Navbar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const isActive = (path: string) => location.pathname === path;

  return (
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
    </nav>
  );
}

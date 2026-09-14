import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/** Casca visual comum a toda tela autenticada — cabeçalho com marca, navegação e logout. */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="border-b border-wine-900/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-lg font-bold text-wine-900">
            Brechó da Vovó Isabel
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link to="/" className="font-medium text-wine-700 hover:text-wine-900">
              Dashboard
            </Link>
            <Link to="/products" className="font-medium text-wine-700 hover:text-wine-900">
              Produtos
            </Link>
            {user?.role === "admin" && (
              <>
                <Link to="/admin/categories" className="font-medium text-wine-700 hover:text-wine-900">
                  Categorias
                </Link>
                <Link to="/admin/users" className="font-medium text-wine-700 hover:text-wine-900">
                  Usuários
                </Link>
                <Link to="/admin/audit-logs" className="font-medium text-wine-700 hover:text-wine-900">
                  Auditoria
                </Link>
              </>
            )}
            <span className="text-gray-500">{user?.name}</span>
            <button
              type="button"
              className="rounded-md border border-wine-900/15 px-3 py-1.5 font-medium text-wine-900 hover:bg-wine-50"
              onClick={() => void logout()}
            >
              Sair
            </button>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}

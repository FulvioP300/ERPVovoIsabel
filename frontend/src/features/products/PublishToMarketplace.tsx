import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useMarketplaceAccounts } from "../../hooks/useMarketplaceAccounts";
import { usePublishListing } from "../../hooks/useMarketplaceListings";
import { MARKETPLACE_LABELS, MarketplaceEnum, type Marketplace } from "../../schemas/marketplace-account.schema";
import type { Product } from "../../schemas/product.schema";

const sectionClass = "space-y-4 rounded-lg border border-gray-200 bg-white p-4";
const sectionTitleClass = "font-display text-base font-semibold text-wine-900";
const inputClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-wine-600 focus:outline-none focus:ring-1 focus:ring-wine-600";
const buttonClass =
  "rounded-md bg-wine-800 px-4 py-2 text-sm font-medium text-gold-100 hover:bg-wine-900 disabled:opacity-50";

/**
 * Botão/seletor de publicação de produto em marketplaces (spec 011, seção 4.3) — só faz
 * sentido num produto já salvo (`product.id` existe), nunca no cadastro de um produto novo.
 * Integrado à tela de edição (005/`ProductFormPage`), fora do `ProductForm` em si (publicar não
 * é um campo do formulário, é uma ação separada sobre o produto já persistido).
 */
export function PublishToMarketplace({ product }: { product: Product }) {
  const { user } = useAuth();
  const [marketplace, setMarketplace] = useState<Marketplace>(MarketplaceEnum.options[0]);
  // Escolha explícita do operador, só relevante quando há mais de uma conta ativa — reiniciada
  // ao trocar de marketplace (no próprio handler de troca, nunca via efeito).
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const { data: accounts, isLoading: isLoadingAccounts } = useMarketplaceAccounts({ marketplace, active: true });
  const publish = usePublishListing();

  // Pula a escolha de conta quando só há uma ativa para o marketplace selecionado (spec 011,
  // seção 4.3) — derivado durante a renderização, não via `useEffect` + `setState`.
  const accountId = accounts?.length === 1 ? (accounts[0]?.id ?? "") : selectedAccountId;

  function handleMarketplaceChange(value: Marketplace) {
    setMarketplace(value);
    setSelectedAccountId("");
  }

  async function handlePublish() {
    if (!accountId) return;
    await publish.mutateAsync({ productId: product.id, marketplace, accountId });
  }

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>Marketplaces</h2>

      {product.marketplaces.length > 0 && (
        <ul className="space-y-1 text-sm">
          {product.marketplaces.map((listing) => (
            <li key={`${listing.marketplace}-${listing.conta_id}`} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  listing.status === "publicado"
                    ? "bg-green-100 text-green-800"
                    : listing.status === "erro"
                      ? "bg-red-100 text-red-800"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {listing.status === "publicado"
                  ? "Publicado"
                  : listing.status === "erro"
                    ? "Erro"
                    : "Não publicado"}
              </span>
              <span>
                {MARKETPLACE_LABELS[listing.marketplace]} ({listing.conta_apelido})
              </span>
              {listing.status === "publicado" && listing.url_anuncio && (
                <a
                  href={listing.url_anuncio}
                  target="_blank"
                  rel="noreferrer"
                  className="text-wine-700 hover:underline"
                >
                  Ver anúncio
                </a>
              )}
              {listing.status === "erro" && listing.erro && (
                <span className="text-red-600">{listing.erro}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500">Marketplace</label>
          <select
            className={`${inputClass} w-40`}
            value={marketplace}
            onChange={(e) => handleMarketplaceChange(e.target.value as Marketplace)}
          >
            {MarketplaceEnum.options.map((option) => (
              <option key={option} value={option}>
                {MARKETPLACE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        {accounts && accounts.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-500">Conta</label>
            <select
              className={`${inputClass} w-48`}
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          className={buttonClass}
          disabled={!accountId || publish.isPending || isLoadingAccounts}
          onClick={() => void handlePublish()}
        >
          {publish.isPending ? "Publicando..." : `Publicar no ${MARKETPLACE_LABELS[marketplace]}`}
        </button>
      </div>

      {!isLoadingAccounts && accounts && accounts.length === 0 && (
        <p className="text-sm text-gray-500">
          Nenhuma conta ativa cadastrada para {MARKETPLACE_LABELS[marketplace]}.{" "}
          {user?.role === "admin" && (
            <Link to="/admin/marketplace-accounts" className="text-wine-700 hover:underline">
              Cadastrar conta
            </Link>
          )}
        </p>
      )}

      {publish.isError && (
        <p className="text-sm text-red-600">
          {publish.error instanceof Error ? publish.error.message : "Não foi possível publicar."}
        </p>
      )}
    </section>
  );
}

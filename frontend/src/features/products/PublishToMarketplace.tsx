import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useMarketplaceAccounts } from "../../hooks/useMarketplaceAccounts";
import { useCategorySuggestion, useCloseListing, usePublishListing, useSizeSuggestion } from "../../hooks/useMarketplaceListings";
import {
  MARKETPLACE_LABELS,
  MarketplaceEnum,
  MERCADO_LIVRE_LISTING_TYPES,
  type Marketplace,
} from "../../schemas/marketplace-account.schema";
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
  const close = useCloseListing();
  const suggestion = useCategorySuggestion();
  // Categoria escolhida na tela de revisão (spec 012, seção 4; ADR-025) — pré-preenchida com a
  // sugestão do preditor quando ela existir; o operador confirma ou troca antes de publicar.
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Tipo de anúncio, mesma tela de revisão (spec 012, seção 3.2; ADR-026) — sempre pré-selecionado
  // no mais barato (`free`, primeiro da lista estática), o operador troca se quiser mais exposição.
  const [selectedListingTypeId, setSelectedListingTypeId] = useState(MERCADO_LIVRE_LISTING_TYPES[0]!.id);
  // Tamanho de calçado (spec 012, achado real 24/09/2026) — só relevante quando a categoria usa
  // tabela BRAND/STANDARD do Mercado Livre (`sizeSuggestion.data?.applicable`); consultado de
  // novo toda vez que a categoria muda, porque a tabela é por categoria.
  const sizeSuggestion = useSizeSuggestion();
  const [selectedSize, setSelectedSize] = useState("");

  /** Busca a sugestão de tamanho pra uma categoria — chamado sempre que `selectedCategoryId`
   * muda (pré-seleção inicial e troca manual), nunca automaticamente por efeito. */
  async function refreshSizeSuggestion(categoryId: string) {
    if (marketplace !== "mercado_livre" || !accountId || !categoryId) {
      sizeSuggestion.reset();
      setSelectedSize("");
      return;
    }
    try {
      const result = await sizeSuggestion.mutateAsync({ productId: product.id, marketplace, accountId, categoryId });
      setSelectedSize(result.applicable && result.currentMatches ? (result.current ?? "") : "");
    } catch {
      setSelectedSize("");
    }
  }

  // Pula a escolha de conta quando só há uma ativa para o marketplace selecionado (spec 011,
  // seção 4.3) — derivado durante a renderização, não via `useEffect` + `setState`.
  const accountId = accounts?.length === 1 ? (accounts[0]?.id ?? "") : selectedAccountId;

  // Conta escolhida já tem um anúncio no ar: o botão vira "Republicar" (spec 012, tarefa T034) —
  // a decisão de criar × atualizar é sempre do backend/conector (spec 012, seção 3.1), isto é só o rótulo.
  const hasPublishedListing = product.marketplaces.some(
    (listing) => listing.marketplace === marketplace && listing.conta_id === accountId && listing.status === "publicado",
  );

  function handleMarketplaceChange(value: Marketplace) {
    setMarketplace(value);
    setSelectedAccountId("");
  }

  /**
   * Mercado Livre exige revisão de categoria antes de publicar, sempre — criar, republicar ou
   * recriar (spec 012, seção 4; ADR-025). Outros marketplaces (sem esse passo ainda) publicam
   * direto, como antes.
   */
  async function handlePublishClick() {
    if (!accountId) return;
    if (marketplace !== "mercado_livre") {
      await publish.mutateAsync({ productId: product.id, marketplace, accountId });
      return;
    }
    const result = await suggestion.mutateAsync({ productId: product.id, marketplace, accountId });
    // A sugestão do preditor pode cair fora da lista curada (ex.: um título com "teste" no nome
    // confundiu o preditor com categorias de teste de piscina) — nesse caso não dá pra pré-selecionar
    // algo que não existe no <select>; melhor deixar em branco e avisar do que fingir uma escolha.
    const suggestionIsCurated = result.suggested && result.options.some((o) => o.categoryId === result.suggested!.categoryId);
    const categoryId = suggestionIsCurated ? result.suggested!.categoryId : "";
    setSelectedCategoryId(categoryId);
    setCategoryFilter("");
    setSelectedListingTypeId(MERCADO_LIVRE_LISTING_TYPES[0]!.id);
    await refreshSizeSuggestion(categoryId);
  }

  async function handleCategoryChange(categoryId: string) {
    setSelectedCategoryId(categoryId);
    await refreshSizeSuggestion(categoryId);
  }

  // Tamanho de calçado (spec 012, achado real 24/09/2026): `applicable` só quando a categoria usa
  // tabela BRAND/STANDARD; sem tabela nenhuma não dá pra publicar (mesmo bloqueio que o Mercado
  // Livre já faria, só que antes de tentar); com tabela, precisa de uma escolha antes de publicar.
  const sizeIsApplicable = sizeSuggestion.data?.applicable === true;
  const sizeHasNoOptions = sizeIsApplicable && sizeSuggestion.data!.available.length === 0;
  const sizeNeedsChoice = sizeIsApplicable && !sizeHasNoOptions && !selectedSize;

  async function handleConfirmPublish() {
    if (!accountId || !selectedCategoryId || sizeHasNoOptions || sizeNeedsChoice) return;
    await publish.mutateAsync({
      productId: product.id,
      marketplace,
      accountId,
      categoryId: selectedCategoryId,
      listingTypeId: selectedListingTypeId,
      sizeOverride: selectedSize || undefined,
    });
    suggestion.reset();
    sizeSuggestion.reset();
    setSelectedSize("");
  }

  function handleCancelReview() {
    suggestion.reset();
    sizeSuggestion.reset();
    setSelectedSize("");
    setSelectedCategoryId("");
    setCategoryFilter("");
  }

  async function handleClose(listingMarketplace: Marketplace, listingAccountId: string) {
    // Texto de confirmação da spec 011, seção 4.7 — não parafrasear.
    const confirmed = window.confirm(
      `O anúncio deixará de estar à venda no ${MARKETPLACE_LABELS[listingMarketplace]}. Para vender de novo será preciso publicar outra vez.`,
    );
    if (!confirmed) return;
    await close.mutateAsync({ productId: product.id, marketplace: listingMarketplace, accountId: listingAccountId });
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
                      : listing.status === "encerrado"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-gray-100 text-gray-600"
                }`}
              >
                {listing.status === "publicado"
                  ? "Publicado"
                  : listing.status === "erro"
                    ? "Erro"
                    : listing.status === "encerrado"
                      ? "Encerrado"
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
              {listing.status === "encerrado" && listing.encerrado_em && (
                <span className="text-gray-500">
                  Anúncio encerrado em {listing.encerrado_em.toLocaleDateString("pt-BR")}
                </span>
              )}
              {listing.status === "publicado" && (
                <button
                  type="button"
                  className="text-sm text-wine-700 underline hover:text-wine-900 disabled:opacity-50"
                  disabled={close.isPending}
                  onClick={() => void handleClose(listing.marketplace, listing.conta_id)}
                >
                  {close.isPending ? "Encerrando..." : "Encerrar anúncio"}
                </button>
              )}
              {(listing.status === "erro" || listing.status === "publicado") && listing.erro && (
                <span className="text-red-600">{listing.erro}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {suggestion.data ? (
        <div className="space-y-3 rounded-md border border-gold-400 bg-cream-50 p-3">
          <p className="text-sm font-medium text-wine-900">
            Revise a categoria no {MARKETPLACE_LABELS[marketplace]} antes de publicar
          </p>
          {suggestion.data.suggested && suggestion.data.options.some((o) => o.categoryId === suggestion.data!.suggested!.categoryId) && (
            <p className="text-sm text-gray-600">
              Sugestão do Mercado Livre: <strong>{suggestion.data.suggested.categoryName}</strong>
            </p>
          )}
          {suggestion.data.suggested && !suggestion.data.options.some((o) => o.categoryId === suggestion.data!.suggested!.categoryId) && (
            <p className="text-sm text-amber-700">
              O Mercado Livre sugeriu <strong>{suggestion.data.suggested.categoryName}</strong>, mas essa categoria não
              é de moda — escolha manualmente na lista abaixo.
            </p>
          )}
          {!suggestion.data.suggested && (
            <p className="text-sm text-gray-600">
              Não foi possível obter uma sugestão automática — escolha a categoria manualmente.
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500">Filtrar categorias</label>
            <input
              type="text"
              className={`${inputClass} w-full`}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Digite para filtrar..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">Categoria</label>
            <select
              className={`${inputClass} w-full`}
              value={selectedCategoryId}
              onChange={(e) => void handleCategoryChange(e.target.value)}
            >
              <option value="">Selecione...</option>
              {suggestion.data.options
                .filter((option) => option.categoryName.toLowerCase().includes(categoryFilter.toLowerCase()))
                .map((option) => (
                  <option key={option.categoryId} value={option.categoryId}>
                    {option.categoryName}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">
              Tipo de anúncio (do mais barato ao mais caro)
            </label>
            <select
              className={`${inputClass} w-full`}
              value={selectedListingTypeId}
              onChange={(e) => setSelectedListingTypeId(e.target.value)}
            >
              {MERCADO_LIVRE_LISTING_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {sizeSuggestion.isPending && <p className="text-sm text-gray-600">Consultando tamanhos disponíveis no Mercado Livre...</p>}

          {sizeSuggestion.isError && (
            <p className="text-sm text-red-600">
              {sizeSuggestion.error instanceof Error ? sizeSuggestion.error.message : "Não foi possível checar os tamanhos disponíveis."}
            </p>
          )}

          {sizeIsApplicable && sizeHasNoOptions && (
            <p className="text-sm text-red-600">
              Não há tabela de medidas (da marca ou padrão) para esta categoria no Mercado Livre — não é possível
              publicar este calçado. Escolha outra categoria que tenha tabela, ou não publique esta peça por ora.
            </p>
          )}

          {sizeIsApplicable && !sizeHasNoOptions && (
            <div>
              <label className="block text-xs font-medium text-gray-500">Tamanho</label>
              {!sizeSuggestion.data!.currentMatches && (
                <p className="mb-1 text-sm text-amber-700">
                  {sizeSuggestion.data!.current
                    ? `O tamanho do cadastro ("${sizeSuggestion.data!.current}") não está na tabela do Mercado Livre — escolha um tamanho real abaixo.`
                    : "A peça não tem tamanho cadastrado — escolha um tamanho real da tabela do Mercado Livre abaixo."}
                </p>
              )}
              <select className={`${inputClass} w-full`} value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                <option value="">Selecione...</option>
                {sizeSuggestion.data!.available.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={!selectedCategoryId || publish.isPending || sizeSuggestion.isPending || sizeHasNoOptions || sizeNeedsChoice}
              onClick={() => void handleConfirmPublish()}
            >
              {publish.isPending ? "Publicando..." : "Confirmar e publicar"}
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={publish.isPending}
              onClick={handleCancelReview}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
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
            disabled={!accountId || publish.isPending || suggestion.isPending || isLoadingAccounts}
            onClick={() => void handlePublishClick()}
          >
            {publish.isPending || suggestion.isPending
              ? "Carregando..."
              : hasPublishedListing
                ? `Republicar no ${MARKETPLACE_LABELS[marketplace]}`
                : `Publicar no ${MARKETPLACE_LABELS[marketplace]}`}
          </button>
        </div>
      )}

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

      {suggestion.isError && (
        <p className="text-sm text-red-600">
          {suggestion.error instanceof Error ? suggestion.error.message : "Não foi possível revisar a categoria."}
        </p>
      )}

      {publish.isError && (
        <p className="text-sm text-red-600">
          {publish.error instanceof Error ? publish.error.message : "Não foi possível publicar."}
        </p>
      )}

      {close.isError && (
        <p className="text-sm text-red-600">
          {close.error instanceof Error ? close.error.message : "Não foi possível encerrar o anúncio."}
        </p>
      )}
    </section>
  );
}

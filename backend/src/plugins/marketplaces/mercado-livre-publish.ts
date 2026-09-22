import { getDb } from "../../database/mongo.client.js";
import { mercadoLivreOAuthClient } from "./mercado-livre-oauth.client.js";
import * as api from "./mercado-livre-api.client.js";
import type { CategoryAttribute, MercadoLivreWarning, SizeChartRow, SizeChartSummary } from "./mercado-livre-api.client.js";
import { MarketplaceConnectorError, type MarketplacePublishResult, type PublishInput } from "./marketplace-connector.port.js";
import { resolvePackage } from "./mercado-livre-package.config.js";
import {
  type MercadoLivreAttributeCandidate,
  assertPriceInRange,
  brandAttribute,
  buildChartName,
  buildChartPayload,
  buildChartRowPayload,
  buildCreatePayload,
  buildPictureUrls,
  buildUpdatePayload,
  colorAttributes,
  garmentMeasureAttributes,
  genderAttribute,
  gtinAttribute,
  immediateTag,
  isKnownGarmentMeasureAttribute,
  mapCondition,
  modelAttribute,
  normalizeFootwearSize,
  packageAttributes,
  pickAttributes,
  pickChartRow,
  sanitizePlainText,
  sizeChartAttributes,
  skuAttribute,
  warrantyTerms,
} from "./mercado-livre-item.mapper.js";
import type { Product } from "../../schemas/product.schema.js";

/**
 * Orquestra a criação/atualização de um anúncio (spec 012, seções 3, 3.1, 3.3, 3.5; T025/T026) —
 * chama a API (T022) e monta o payload com o mapeador puro (T023). `categoryId`/`listingTypeId`
 * chegam já resolvidos pela revisão do operador (ADR-025/ADR-026); esta função nunca chama o
 * preditor nem decide o tipo de anúncio.
 */
export async function publishItem(accessToken: string, input: PublishInput): Promise<MarketplacePublishResult> {
  const { product, listing } = input;
  const categoryId = input.categoryId;
  const listingTypeId = input.listingTypeId;
  if (!categoryId) {
    throw new MarketplaceConnectorError("Nenhuma categoria confirmada — revise a categoria na tela de publicação antes de continuar.");
  }
  if (!listingTypeId) {
    throw new MarketplaceConnectorError("Nenhum tipo de anúncio escolhido — revise antes de publicar.");
  }
  const price = product.preco.preco_venda;
  if (price === null) {
    throw new MarketplaceConnectorError("Informe o preço de venda antes de publicar.");
  }

  const currentUser = await mercadoLivreOAuthClient.fetchCurrentUser(accessToken);
  const sellerId = String(currentUser.id);
  const useUserProducts = currentUser.tags.includes("user_product_seller");

  const settings = await api.getCategory(accessToken, categoryId);
  if (!settings.listingAllowed || settings.status !== "enabled") {
    throw new MarketplaceConnectorError(
      `A categoria escolhida não aceita novos anúncios no momento (${settings.status ?? "indisponível"}) — escolha outra categoria na revisão.`,
    );
  }
  assertPriceInRange(price, settings.minimumPrice, settings.maximumPrice);

  const categoryAttributes = await api.getCategoryAttributes(accessToken, categoryId);

  // Republicar (spec 012, seção 3.1): só quando a entrada já tem id_anuncio e status = publicado.
  if (listing?.id_anuncio && listing.status === "publicado") {
    return updateExistingItem(accessToken, listing.id_anuncio, product, categoryId, categoryAttributes, settings, useUserProducts, sellerId);
  }

  // Criar (entrada nova, ou recriar sobre um anúncio encerrado): resposta perdida — procura antes
  // pelo SKU, para nunca duplicar um item que já existe no Mercado Livre (spec 012, seção 3.1).
  const foundIds = await api.searchItemsBySellerSku(accessToken, sellerId, product.sku);
  if (foundIds.length > 0) {
    const items = await api.getItemsByIds(accessToken, foundIds.slice(0, 20));
    const adopted = items.find((item) => item.status !== "closed");
    if (adopted) {
      return updateExistingItem(accessToken, adopted.id, product, categoryId, categoryAttributes, settings, useUserProducts, sellerId);
    }
  }

  return createNewItem(accessToken, product, categoryId, categoryAttributes, settings, useUserProducts, listingTypeId, sellerId);
}

/**
 * `POST /catalog/charts/search` e `POST /catalog/charts` (T022 `searchSizeCharts`/`createSizeChart`)
 * esperam o `domain_id` **sem** o prefixo do site (ex.: `"SHORTS"`), diferente de todo o resto da
 * API (`GET /categories/{id}`, `active_domains`, `technical_specs`, o preditor — todos usam
 * `"MLB-SHORTS"`). Confirmado ao vivo no T043: sem isso, o Mercado Livre recusa com "Domain
 * MLB-MLB-SHORTS not active" (o `site_id` enviado à parte duplica o prefixo).
 */
function stripSitePrefix(domainId: string): string {
  const prefix = "MLB-";
  return domainId.startsWith(prefix) ? domainId.slice(prefix.length) : domainId;
}

function warningsToPendencia(warnings: MercadoLivreWarning[]): string | null {
  return warnings.length > 0 ? warnings.map((w) => w.message).join(" ") : null;
}

function appendPendencia(current: string | null, addition: string): string {
  return current ? `${current} ${addition}` : addition;
}

async function createNewItem(
  accessToken: string,
  product: Product,
  categoryId: string,
  categoryAttributes: CategoryAttribute[],
  settings: api.CategorySettings,
  useUserProducts: boolean,
  listingTypeId: string,
  sellerId: string,
): Promise<MarketplacePublishResult> {
  const attributes = await buildAttributes(accessToken, product, categoryId, categoryAttributes, settings, sellerId);

  const payload = buildCreatePayload({
    categoryId,
    useUserProducts,
    name: product.identificacao.nome,
    price: product.preco.preco_venda!,
    attributes,
    pictureUrls: buildPictureUrls(product, settings.maxPicturesPerItem),
    listingTypeId,
    tags: immediateTag(settings.immediatePayment),
  });

  const created = await api.createItem(accessToken, payload);
  let pendencia = warningsToPendencia(created.warnings);

  if (product.identificacao.descricao) {
    try {
      await api.createDescription(accessToken, created.id, sanitizePlainText(product.identificacao.descricao, settings.maxDescriptionLength));
    } catch (err) {
      const message = err instanceof api.MercadoLivreApiError ? err.message : "erro desconhecido ao enviar a descrição.";
      pendencia = appendPendencia(pendencia, `Anúncio criado, mas a descrição não foi enviada: ${message}`);
    }
  }

  return { id_anuncio: created.id, url_anuncio: created.permalink ?? "", pendencia };
}

async function updateExistingItem(
  accessToken: string,
  itemId: string,
  product: Product,
  categoryId: string,
  categoryAttributes: CategoryAttribute[],
  settings: api.CategorySettings,
  useUserProducts: boolean,
  sellerId: string,
): Promise<MarketplacePublishResult> {
  const currentItem = await api.getItem(accessToken, itemId);
  if (currentItem.status === "closed") {
    throw new MarketplaceConnectorError(
      'Este anúncio já foi encerrado no Mercado Livre — use "Encerrar anúncio" no ERP e publique de novo para criar um item novo.',
    );
  }

  const attributes = await buildAttributes(accessToken, product, categoryId, categoryAttributes, settings, sellerId);

  const payload = buildUpdatePayload({
    useUserProducts,
    name: product.identificacao.nome,
    soldQuantity: currentItem.soldQuantity,
    price: product.preco.preco_venda!,
    attributes,
    pictureUrls: buildPictureUrls(product, settings.maxPicturesPerItem),
  });

  const updated = await api.updateItem(accessToken, itemId, payload);
  let pendencia = warningsToPendencia(updated.warnings);

  if (product.identificacao.descricao) {
    const text = sanitizePlainText(product.identificacao.descricao, settings.maxDescriptionLength);
    try {
      await api.updateDescription(accessToken, itemId, text);
    } catch (err) {
      if (!(err instanceof api.MercadoLivreApiError)) throw err;
      // O item pode ainda não ter descrição (falha parcial anterior) — PUT falha, tenta POST.
      try {
        await api.createDescription(accessToken, itemId, text);
      } catch (err2) {
        const message = err2 instanceof api.MercadoLivreApiError ? err2.message : "erro desconhecido ao enviar a descrição.";
        pendencia = appendPendencia(pendencia, `A descrição não foi atualizada: ${message}`);
      }
    }
  }

  return { id_anuncio: itemId, url_anuncio: updated.permalink ?? currentItem.permalink ?? "", pendencia };
}

/** Monta todos os candidatos a atributo e filtra pelo que a categoria de fato aceita (spec 012, seção 4). */
async function buildAttributes(
  accessToken: string,
  product: Product,
  categoryId: string,
  categoryAttributes: CategoryAttribute[],
  settings: api.CategorySettings,
  sellerId: string,
): Promise<MercadoLivreAttributeCandidate[]> {
  const itemConditionDef = categoryAttributes.find((a) => a.id === "ITEM_CONDITION");
  const candidates: MercadoLivreAttributeCandidate[] = [
    mapCondition(product.condicao.estado, itemConditionDef),
    skuAttribute(product.sku),
    ...warrantyTerms(),
  ];

  const brand = brandAttribute(
    product.marca.nome,
    categoryAttributes.some((a) => a.id === "BRAND"),
  );
  if (brand) candidates.push(brand);

  candidates.push(...colorAttributes(product.caracteristicas.cor_principal, categoryAttributes));

  const model = modelAttribute(
    product.identificacao.nome,
    categoryAttributes.some((a) => a.id === "MODEL"),
  );
  if (model) candidates.push(model);

  const resolvedPackage = await resolvePackage(getDb(), product);
  candidates.push(...packageAttributes(resolvedPackage));

  const gtin = await resolveGtinAttribute(accessToken, categoryId, categoryAttributes);
  if (gtin) candidates.push(gtin);

  // Moda com tabela de medidas (domínio em active_domains) já traz GENDER + SIZE (+ grid) prontos.
  // Fora disso, GENDER e SIZE ainda podem ser atributos comuns exigidos pela categoria — sem
  // tabela nenhuma envolvida (confirmado ao vivo, T043: categoria "Cintos" exige os dois sem
  // fazer parte de active_domains).
  const chartAttributes = settings.catalogDomain
    ? await resolveSizeChartAttributes(accessToken, product, settings.catalogDomain, categoryAttributes, sellerId)
    : [];
  if (chartAttributes.length > 0) {
    candidates.push(...chartAttributes);
  } else {
    const genderDef = categoryAttributes.find((a) => a.id === "GENDER");
    const gender = genderAttribute(product.classificacao.departamento, genderDef);
    if (gender) candidates.push(gender);

    const plainSize = product.caracteristicas.tamanho_etiqueta ?? product.caracteristicas.tamanho_equivalente;
    if (plainSize) candidates.push({ id: "SIZE", value_name: plainSize });
  }

  return pickAttributes(candidates, categoryAttributes);
}

/** GTIN (spec 012, seção 5): exigido → `EMPTY_GTIN_REASON`, nunca um GTIN inventado. */
async function resolveGtinAttribute(
  accessToken: string,
  categoryId: string,
  categoryAttributes: CategoryAttribute[],
): Promise<MercadoLivreAttributeCandidate | null> {
  const gtinDef = categoryAttributes.find((a) => a.id === "GTIN");
  if (!gtinDef) return null;

  let required = gtinDef.tags.required;
  if (!required && gtinDef.tags.conditionalRequired) {
    // Corpo do item exigido pela documentação — a chamada é read-only (não publica nada); o
    // formato exato do "corpo do item" não está confirmado nas fontes salvas (a confirmar Fase 8).
    const requiredIds = await api.getConditionallyRequiredAttributes(accessToken, categoryId, { category_id: categoryId });
    required = requiredIds.includes("GTIN");
  }
  if (!required) return null;

  const reasonDef = categoryAttributes.find((a) => a.id === "EMPTY_GTIN_REASON");
  const reasonValue = reasonDef?.values.find((v) => v.name === "No registrado") ?? reasonDef?.values.find((v) => v.name === "Otro");
  if (!reasonDef || !reasonValue) {
    throw new MarketplaceConnectorError(
      "A categoria exige GTIN, mas o Mercado Livre não devolveu um motivo de ausência de GTIN disponível.",
    );
  }
  return gtinAttribute({ valueId: reasonValue.id, valueName: reasonValue.name });
}

/**
 * Moda com tabela de medidas (spec 012, seção 3.5; ADR-024) — devolve `GENDER` + `SIZE` +
 * `SIZE_GRID_ID` + `SIZE_GRID_ROW_ID`, ou `[]` se o domínio não estiver em `active_domains`.
 */
async function resolveSizeChartAttributes(
  accessToken: string,
  product: Product,
  domain: string,
  categoryAttributes: CategoryAttribute[],
  sellerId: string,
): Promise<MercadoLivreAttributeCandidate[]> {
  const activeDomains = await api.getActiveSizeChartDomains(accessToken);
  if (!activeDomains.includes(domain)) return [];

  const genderDef = categoryAttributes.find((a) => a.id === "GENDER");
  const gender = genderAttribute(product.classificacao.departamento, genderDef);
  if (!gender?.value_name) {
    throw new MarketplaceConnectorError(
      `O Mercado Livre não reconhece o departamento "${product.classificacao.departamento}" como gênero — ajuste a categoria/departamento antes de publicar.`,
    );
  }

  const size = product.caracteristicas.tamanho_etiqueta ?? product.caracteristicas.tamanho_equivalente;
  if (!size) {
    throw new MarketplaceConnectorError("Informe o tamanho da peça (tamanho da etiqueta) para publicar esta categoria no Mercado Livre.");
  }

  // Calçado (T050): domínio SAPT — tabela BRAND/STANDARD. Demais domínios de moda: tabela SPECIFIC
  // do vendedor (ADR-024), com as medidas reais da peça.
  if (product.classificacao.categoria_codigo === "SAPT") {
    const chartAttributes = await resolveFootwearChart(accessToken, domain, sellerId, size, gender.value_name, product.marca.nome);
    return [gender, ...chartAttributes];
  }

  const requiredSpecs = await api.getDomainSizeChartAttributes(accessToken, domain);
  const garmentAttributeIds = requiredSpecs.filter((spec) => spec.id.startsWith("GARMENT_")).map((spec) => spec.id);
  const { attributes: garmentAttributes, missingAttributeIds } = garmentMeasureAttributes(garmentAttributeIds, product.medidas);

  if (missingAttributeIds.length > 0) {
    const blank = missingAttributeIds.filter(isKnownGarmentMeasureAttribute);
    const unconfirmed = missingAttributeIds.filter((id) => !isKnownGarmentMeasureAttribute(id));
    if (blank.length > 0) {
      throw new MarketplaceConnectorError(`Informe as medidas da peça (${blank.join(", ")}) para publicar esta categoria no Mercado Livre.`);
    }
    throw new MarketplaceConnectorError(
      `Esta categoria do Mercado Livre exige medidas que o cadastro ainda não captura (${unconfirmed.join(", ")}) — fale com o time técnico antes de publicar.`,
    );
  }

  const chartAttributes = await resolveClothingChart(accessToken, domain, sellerId, size, gender.value_name, garmentAttributes);
  return [gender, ...chartAttributes];
}

async function resolveFootwearChart(
  accessToken: string,
  domain: string,
  sellerId: string,
  size: string,
  genderValueName: string,
  brandName: string | null,
): Promise<MercadoLivreAttributeCandidate[]> {
  const normalizedSize = normalizeFootwearSize(size);
  let chart: SizeChartSummary | undefined;

  if (brandName) {
    const brandCharts = await api.searchSizeCharts(accessToken, {
      domainId: stripSitePrefix(domain),
      sellerId,
      type: "BRAND",
      attributes: [
        { id: "GENDER", values: [genderValueName] },
        { id: "BRAND", values: [brandName] },
      ],
    });
    chart = brandCharts[0];
  }
  if (!chart) {
    const standardCharts = await api.searchSizeCharts(accessToken, {
      domainId: stripSitePrefix(domain),
      sellerId,
      type: "STANDARD",
      attributes: [{ id: "GENDER", values: [genderValueName] }],
    });
    chart = standardCharts[0];
  }
  if (!chart) {
    throw new MarketplaceConnectorError(
      `Não há tabela de medidas (da marca ou padrão) para "${domain}" no Mercado Livre — não é possível publicar este calçado.`,
    );
  }

  const detail = await api.getSizeChart(accessToken, chart.id);
  const row = pickChartRow(detail.rows, [{ id: "SIZE", value: normalizedSize }]);
  if (!row) {
    throw new MarketplaceConnectorError(`A tabela de medidas do Mercado Livre não tem o tamanho "${normalizedSize}" para "${domain}".`);
  }
  return sizeChartAttributes(normalizedSize, chart.id, row.id);
}

async function resolveClothingChart(
  accessToken: string,
  domain: string,
  sellerId: string,
  size: string,
  genderValueName: string,
  garmentAttributes: MercadoLivreAttributeCandidate[],
): Promise<MercadoLivreAttributeCandidate[]> {
  const criteria = [{ id: "SIZE", value: size }, ...garmentAttributes.map((a) => ({ id: a.id, value: a.value_name ?? "" }))];

  const existingCharts = await api.searchSizeCharts(accessToken, {
    domainId: stripSitePrefix(domain),
    sellerId,
    type: "SPECIFIC",
    attributes: [{ id: "GENDER", values: [genderValueName] }],
  });

  let chartId: string;
  let row: SizeChartRow | null;

  if (existingCharts.length === 0) {
    const created = await api.createSizeChart(
      accessToken,
      buildChartPayload({
        name: buildChartName(domain, genderValueName),
        domainId: stripSitePrefix(domain),
        genderValueName,
        sizeLabel: size,
        garmentAttributes,
      }),
    );
    chartId = created.id;
    const detail = await api.getSizeChart(accessToken, chartId);
    row = pickChartRow(detail.rows, criteria);
  } else {
    chartId = existingCharts[0]!.id;
    const detail = await api.getSizeChart(accessToken, chartId);
    row = pickChartRow(detail.rows, criteria);
    if (!row) {
      await api.addSizeChartRow(accessToken, chartId, buildChartRowPayload(size, garmentAttributes));
      const refreshed = await api.getSizeChart(accessToken, chartId);
      row = pickChartRow(refreshed.rows, criteria);
    }
  }

  if (!row) {
    throw new MarketplaceConnectorError("Falha ao localizar a linha da tabela de medidas depois de criá-la — tente publicar de novo.");
  }
  return sizeChartAttributes(size, chartId, row.id);
}

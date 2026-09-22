# Tasks 012 — Conector Mercado Livre

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [011-integracao-marketplaces/tasks.md](../011-integracao-marketplaces/tasks.md)
(contas, porta, publicação, ciclo de vida da conta),
[005-produtos-cadastro-manual/tasks.md](../005-produtos-cadastro-manual/tasks.md),
[008-auditoria/tasks.md](../008-auditoria/tasks.md)
**Convenção:** `[P]` = tarefa paralelizável; `[x]` = concluída. Cada fase termina com `npm run
lint` e `npm run test` nos pacotes tocados (`backend/`, `frontend/`, `shared/`) — e, nas fases 7 e
8, `npm test` em `e2e/`. O frontend não tem testes unitários (convenção do projeto): o que ele faz é
coberto pelo E2E e pela verificação no navegador.

As fases seguem o [plan.md](plan.md) (seção 5), com uma fase A à frente para o que já foi entregue
antes de o plano existir (cadastro por OAuth, PKCE e teste de integração — spec, seções 2.2 e 2.4).

## Fase A — Já entregue: cadastro por OAuth, PKCE e teste de integração (spec, seções 2.1, 2.2, 2.4)

- [x] T001 Backend do cadastro por OAuth: `schemas/mercado-livre-credential.schema.ts` (credencial
      estruturada), `plugins/marketplaces/mercado-livre-oauth.client.ts` (`buildAuthorizationUrl`,
      `exchangeCode`), `services/mercado-livre-oauth.service.ts` (`startMercadoLivreAuthorization`,
      `completeMercadoLivreAuthorization`, `state` de uso único com 10 min), campos `oauthState*` no
      repositório, rotas `GET /oauth/redirect-uri`, `POST /:id/oauth/authorize` e
      `POST /oauth/mercado-livre/complete`. Testes: `mercado-livre-oauth.client.test.ts` e
      `tests/integration/mercado-livre-oauth.spec.ts`.
- [x] T002 PKCE (S256) sempre ligado — spec, seção 2.2: `code_verifier` gerado no "Conectar" e guardado
      com o `state` (`oauthCodeVerifier`), `code_challenge` na URL de autorização, verifier na troca do
      `code`; apagado no consumo do `state` e ao desconectar. Motivo: o aplicativo do Mercado Livre
      tem `use_pkce: true` e recusa a autorização sem `code_challenge` — depende de T001.
- [x] T003 Teste de integração no cadastro — spec, seção 2.4: `requestApplicationToken`
      (`client_credentials`) e `fetchCurrentUser` (`GET /users/me`) no cliente OAuth,
      `testMercadoLivreIntegration`, rota `POST /api/marketplace-accounts/mercado-livre/test-connection`
      (admin, 10/min) — depende de T001.
- [x] T004 Frontend do cadastro: campos Client ID/Client Secret, botão "Testar integração" que libera
      "Criar e conectar ao Mercado Livre", `OAuthCallbackPage` + rota
      `/admin/marketplace-accounts/oauth/callback`, botão Conectar/Reconectar na lista, redirect URI
      exibido a partir de `FRONTEND_URL` — depende de T001, T003.


- [x] T055 Usuário do Mercado Livre na conta (spec, seção 2.5): campo `expectedUser` (apelido ou ID) no cadastro e na edição;
      após o OAuth o backend confere `GET /users/me` com o esperado — divergência é `400` sem gravar tokens; a conta
      guarda `connectedUserId`/`connectedNickname` (limpos ao desconectar); editar o esperado desconecta a conta;
      coluna "Usuário" na lista de contas. Testes unitários do casamento (apelido, ID, `@`, maiúsculas) e de integração
      (confere, diverge, conta antiga sem esperado, editar desconecta) — depende de T001, T003, T004.
      **Feito** (21/09/2026): casamento em `mercado-livre-user-match.ts`; conferência em
      `completeMercadoLivreAuthorization` (`GET /users/me` após a troca do `code`); `expectedUser`,
      `connectedUserId` e `connectedNickname` na conta; `UnexpectedMercadoLivreUserError` → `400`; auditoria com
      `mlUserId`. A conta já conectada continua sem usuário esperado ("não informado") até ser editada.

## Fase 0 — Confirmações na documentação e no app (bloqueiam partes da Fase 4)

A documentação do Mercado Livre respondeu 403 para leitura automática; estas tarefas são de
confirmação **humana ou empírica**. Cada uma termina removendo o ⚠ correspondente da
[spec](spec.md) (e ajustando o plano, se o fato mudar algo).

- [x] T005 [P] Edição de anúncio com vendas (spec, seção 3.1) — confirmado em "Sincronização e
      modificação de publicações" (24/03/2026): com vendas não muda `title`/`buying_mode`/meios de
      pagamento; `title` só com `sold_quantity = 0`; `PUT` só com `price` é rejeitado se há
      automatização de preços (com outros campos, o preço é ignorado com *warning*). O "formato do erro
      de campo recusado" deixou de ser necessário: a regra é aplicada antes de enviar.
- [x] T006 [P] SKU (spec, seções 3 e 3.1) — confirmado em "Busca de itens": `GET
      /users/{user_id}/items/search?sku=…` (campo `seller_custom_field`) e `?seller_sku=…` (atributo
      `SELLER_SKU`); resposta `{ paging, results: [ids] }`; multiget `GET /items?ids=…&attributes=…` (até 20
      ids). "Só ativos" vale para a busca pública, não para esta — o conector confere o `status`.
- [x] T007 [P] Encerrar (spec, seção 7) — confirmado: `PUT /items/{id}` com `{"status":"closed"}`;
      estado final (não reativa); encerrados são descartados pelo próprio Mercado Livre; excluir é um
      segundo `PUT` com `{"deleted":"true"}` (fora de escopo); não há erro documentado para "já
      encerrado" → idempotência por `GET /items/{id}`; `POST /items/{id}/relist` existe mas não serve
      (só `price`/`quantity`/`listing_type_id`).
- [x] T008 [P] Categoria e payload de criação (spec, seções 3, 3.3, 4 e 6) — confirmado em "Publicar
      produtos", "User Products", "Domínios e Categorias", "Categorização de produtos", "Atributos",
      "Descrição de produtos" e "Validações": `settings` de `GET /categories/{id}`
      (`max_title_length`, `minimum_price`, `maximum_price` — pode ser `null` —, `max_pictures_per_item`,
      `max_description_length`, `immediate_payment`, `listing_allowed`); tags dos atributos e
      `POST /categories/{id}/attributes/conditional` para o GTIN; **modelo *User Products*: `family_name`
      no lugar de `title`, sem `variations`**; `condition` descontinuado (usa `ITEM_CONDITION`); descrição
      por `POST` (criar) e `PUT ...?api_version=2` (substituir); formato de erro `{ message, error,
      status, cause: [...] }`.
- [x] T009 [P] `sandbox_mode: true` do app (visto nos metadados do app "ERP VovoIsabel") — confirmado em
      "Realização de testes": o Mercado Livre **não tem sandbox**; usa-se **usuário de teste** em
      produção. A página não explica o `sandbox_mode` do app; tratado como sem efeito, a confirmar no
      primeiro teste da Fase 8. A Fase 8 passou a usar usuário de teste (título e categoria prescritos).
- [ ] T010 [P] Decisão de negócio (spec, seção 3.2): a dona do brechó escolhe o
      `MERCADO_LIVRE_LISTING_TYPE_ID` (custo × exposição). Já reunido: tipos do MLB, `gold_special` e
      `gold_pro` sem prazo, `free` restrito, `listing_prices` para comparar o custo por tipo e categoria
      (exige token). Não bloqueia código (o padrão é `gold_special`), mas bloqueia o primeiro anúncio
      real (T043).
- [x] T046 [P] **Dimensões do pacote** (spec, seção 3.4) — decidido (b): pacote padrão configurável em
      `MERCADO_LIVRE_PACKAGE_DEFAULTS` (JSON com `padrao`, `por_departamento` e `por_categoria`; `altura_cm`,
      `largura_cm`, `comprimento_cm` inteiros e `peso_g` opcional), resolvido por categoria > departamento >
      padrão; peso do produto (kg → g, arredondado para cima) com `peso_g` como reserva. Implementação em
      T052; valores reais em T051. (Dimensões por produto no cadastro ficam como evolução — spec 005.)
- [x] T047 [P] **Moda: `GENDER` e tabela de medidas** (spec, seção 3.5) — leitura concluída ("Primeiros passos",
      "Gerenciar tabela de medidas" e "Validação da tabela de medidas"): domínios com tabela via
      `active_domains`; item leva `GENDER`, `SIZE`, `SIZE_GRID_ID` e `SIZE_GRID_ROW_ID`; tabela encontrada por
      `POST /catalog/charts/search` (preferência `BRAND` > `STANDARD`), linha por `GET /catalog/charts/{id}`;
      criar tabelas `SPECIFIC` fica fora de escopo. A implementação está em T022, T023 e T025.
- [x] T048 [P] "Identificadores de produtos" lida — `EMPTY_GTIN_REASON` confirmado (`Artesanal` 17055158, `Kit`
      17055159, `No registrado` 17055160, `Otro` 17055161; `value_id` vindo de `GET /categories/{id}/
      attributes`); implementação em T023.
- [x] T050 [P] **Tamanhos do ERP × tabelas de medidas** (spec, seção 3.5) — medido em 21/09/2026 com a conta real
      conectada (só leituras): `active_domains` tem 59 domínios (quase todos os de roupa); `STANDARD` existe só para
      5 domínios de calçado e `BRAND` só para 9 de calçado; **nenhum domínio de roupa tem tabela pronta** (busca
      `STANDARD` devolve 0). No ERP de dev, 7 de 9 produtos não têm `tamanho_etiqueta`; as linhas de calçado usam
      `"34,0 BR"` e o ERP guarda `"32"`. Consequências e decisões em T053 e T054.
- [ ] T053 [P] **Decisão — tabela de medidas de roupas** (spec, seção 3.5): como obter a tabela `SPECIFIC` que o
      Mercado Livre exige para roupas — (1) **achar** as tabelas que a dona do brechó criar no painel do Mercado
      Livre (uma por domínio e gênero, uma linha por tamanho) e escolher a linha pelo `SIZE`; (2) **criar** por API
      (`POST /catalog/charts`, com medidas da peça por linha — domínios `TOPS`/`BOTTOMS`, `CLOTHING_MEASURE`); ou (3)
      limitar a v1 a calçados e publicar roupas depois. Recomendação: (1) na v1 — o conector só lê. Bloqueia T023 e
      T025 para roupas.
- [ ] T054 [P] **Decisão — categoria do Mercado Livre por peça** (spec, seção 4): trocar o preditor por um
      **mapeamento configurável categoria do ERP → categoria/domínio do Mercado Livre** (as 12 categorias do brechó:
      BERM, CALC, CAMI, POLO, JAQU, VEST, BLUS, SAIA, SAPT, BOLS, ACES, CHAP), com o preditor só como reserva. O T050
      mostrou o preditor errando o domínio de peças comuns. Se aprovado, entra em T023 (mapeador) e T052 (mesma
      configuração do pacote padrão). Bloqueia T023 e T025.
- [ ] T051 [P] **Valores reais do pacote padrão** (spec, seção 3.4) — a dona do brechó informa as medidas (altura,
      largura, comprimento em cm) e o peso típico da embalagem por tipo de peça (ex.: peça leve dobrada em
      saco, calçado, casaco); com isso se monta o JSON de `MERCADO_LIVRE_PACKAGE_DEFAULTS` (`padrao`,
      `por_departamento`, `por_categoria`). Bloqueia a primeira publicação real (T049), não o código.

## Fase 1 — Contrato compartilhado, auditoria e contagem

- [x] T011 `shared/schemas/marketplace.schema.ts`: `encerrado` em `MarketplaceListingStatusEnum` e
      `encerrado_em` (`z.coerce.date().nullable().default(null)` — documentos antigos não têm o
      campo); `npm run build` em `shared/` (backend e frontend importam `shared/dist`). Testes em
      `shared/schemas/` para o campo novo e para documento antigo sem `encerrado_em`.
- [x] T012 [P] Auditoria: `PRODUCT_UNPUBLISH` no `AuditActionEnum` do backend **e** no do frontend
      (`frontend/src/schemas/audit-log.schema.ts`, cópia própria), com o rótulo "Anúncio encerrado" em
      `AuditLogsPage.tsx`; registrar a ação na lista da spec 008. Teste de contrato no backend
      (`tests/`) que lê `frontend/src/schemas/audit-log.schema.ts` como texto, extrai os literais do
      enum e falha se os dois lados diferirem — a omissão dessa cópia já quebrou a tela de Auditoria
      (ações `MARKETPLACE_*`).
- [x] T013 [P] `productRepository.countPublishedListingsByAccount(db)`: `aggregate` com `$unwind` de
      `marketplaces`, `$match` em `status = "publicado"`, `$group` por `conta_id` → `Map<string, number>`.
      Conta todos os produtos, inclusive `vendido`/`inativo`. Teste com MongoDB em memória.
- [x] T014 `publishedListingsCount` (inteiro) no schema de resposta de conta — backend e frontend — e um
      helper único em `marketplace-account.service.ts` que o preenche em **todas** as respostas de conta
      (listar, obter, criar, editar, ativar/desativar, desconectar, conectar); atualizar os testes de
      conta existentes — depende de T013. **Feito** com `presentMarketplaceAccount`/`presentMarketplaceAccounts` em
      `marketplace-account.service.ts` (um só `aggregate` por chamada) e o teste de integração
      `tests/integration/marketplace-published-count.spec.ts`. Como efeito colateral, o tipo da porta passou a usar
      `ConnectorAccount` (conta sem a contagem) até T015 redefinir a porta.

## Fase 2 — Porta, registro de conectores e migração dos dublês

- [x] T015 `plugins/marketplaces/marketplace-connector.port.ts`: `publish({ product, listing, account,
      credential })` e `close({ listing, account, credential })`, ambos → `ConnectorOutcome<T> = { value;
      updatedCredential? }`; `PublishResult = { id_anuncio, url_anuncio, pendencia: string | null }`;
      `MarketplaceConnectorError { updatedCredential?, reconnectRequired }` — depende de T011.
- [x] T016 `plugins/marketplaces/connector-registry.ts`: `getConnector(marketplace)`; o override de teste
      (`setMarketplaceConnectorForTesting`, mantido) vale para qualquer marketplace; sem override usa o
      registro; marketplace sem conector → erro "Nenhum conector configurado para X" (comportamento
      atual) — depende de T015.
- [x] T017 Adaptar `publishListing` ao contrato novo **sem mudar comportamento** e migrar os dublês de
      `marketplace-listing.service.test.ts` e `tests/integration/marketplace-listings.spec.ts`: todos os
      testes existentes de 011 continuam passando com as mesmas afirmações — depende de T016.
      **Feito** (21/09/2026): `publishListing` passa `{ product, listing, account, credential }` ao conector (a conta sem a
      credencial cifrada) e grava `erro = pendencia`; o seam `setMarketplaceConnectorForTesting` segue exportado do
      serviço; testes novos do registro e do contrato da porta.

## Fase 3 — Trava por conta e persistência de credencial

- [x] T018 `marketplace-account.repository.ts`: `acquireOperationLease(db, id, owner, ttlMs)`
      (`findOneAndUpdate` condicionado a "sem trava ou trava vencida", campos internos
      `operationLeaseOwner`/`operationLeaseExpiresAt`, nunca expostos) e `releaseOperationLease(db, id,
      owner)` (só libera se o dono for o mesmo). Testes com MongoDB em memória: dois donos disputando,
      trava vencida retomada, liberação por dono errado ignorada.
- [x] T019 `services/account-operation.service.ts` — `runAccountOperation(accountId, op)`: espera a trava
      (poll de 250 ms, até 15 s, senão `AccountBusyError`), validade da trava 120 s; relê a conta e
      decifra a credencial; roda `op`; no `finally` persiste `updatedCredential` (condicional ao
      ciphertext lido, via `replaceCredentialCiphertext` — no sucesso **e** no erro), aplica
      `reconnectRequired → connectionStatus = expired` e solta a trava; nunca loga credencial. Testes:
      duas operações na mesma conta rodam em série; ocupada além de 15 s → `AccountBusyError`; par novo
      descartado se a conta foi desconectada durante a operação; `expired` só com `reconnectRequired` —
      depende de T015, T018.
      **Feito** (21/09/2026): `account-operation.service.ts` (`runAccountOperation`, `tryAcquireAccountLease`,
      `AccountBusyError`); repositório com `acquireOperationLease`/`releaseOperationLease` e `markExpiredIfUnchanged`
      (só marca `expired` se a conta não mudou nem foi desconectada); `tests/integration/account-operation.spec.ts`
      (19 casos).
- [x] T020 `credential-key-rotation.service.ts`: tenta a trava por conta e **pula** a ocupada (conta em
      `skippedConcurrent`); atualizar `credential-key-rotation.service.test.ts` e
      `tests/integration/credential-key-rotation.spec.ts` — depende de T018.

## Fase 4 — Adaptador do Mercado Livre

- [ ] T021 `mercado-livre-oauth.client.ts`: `refreshToken({ clientId, clientSecret, refreshToken })`
      (`grant_type=refresh_token`); `invalid_grant` → erro com `reconnectRequired`, erro de rede/5xx sem
      o flag; incluir o método na interface `MercadoLivreOAuthClient` e atualizar os fakes de teste
      (`mercado-livre-oauth.spec.ts`, `marketplace-account-lifecycle.spec.ts`). Testes em
      `mercado-livre-oauth.client.test.ts` (corpo enviado, `invalid_grant`, erro de rede, mensagem sem
      segredo) — depende de T001.
- [ ] T022 [P] `plugins/marketplaces/mercado-livre-api.client.ts`: uma função por chamada — `GET /users/me`
      (tag `user_product_seller`), predictor de categoria, `GET /categories/{id}`,
      `GET /categories/{id}/attributes`, `POST /categories/{id}/attributes/conditional`,
      `GET /categories/{id}/sale_terms`, `POST`/`PUT /items`, `GET /items/{id}`, multiget
      `GET /items?ids=…&attributes=…` (até 20 ids), `POST`/`PUT /items/{id}/description[?api_version=2]`,
      busca por SKU `GET /users/{user_id}/items/search?seller_sku=…&orders=start_time_desc`,
      `PUT /items/{id}` com `status: closed` e, para moda, `GET /catalog/charts/MLB/configurations/active_domains`,
      `GET /domains/{id}/technical_specs`, `POST /catalog/charts/search` e `GET /catalog/charts/{id}` — todas
      com `Authorization: Bearer`, timeout de 15 s, resposta validada por Zod, erro classificado
      (`MercadoLivreApiError { status, code, causes }`, lendo `cause[]` no formato da spec 3.6), mensagens
      sem token nem `client_secret`; base URL de `MERCADO_LIVRE_API_BASE_URL` (aceita só fora de
      `NODE_ENV=production`). 429/5xx sem repetição; **única** repetição automática: `409` de versão no
      encerramento (espera e repete, até 3×). Testes com `fetch` simulado e relógio falso — depende de
      T005, T006, T007, T008 (todas confirmadas).
- [ ] T023 [P] `plugins/marketplaces/mercado-livre-item.mapper.ts` — funções **puras**: `buildCreatePayload`
      (`family_name` × `title` conforme o modelo do vendedor), `buildUpdatePayload`, `mapCondition`
      (`novo → "Novo"`; `seminovo`/`usado → "Usado"`, `value_id` dos atributos da categoria, atributo
      `ITEM_CONDITION` — nunca `condition`), `pickAttributes` (só o que a categoria aceita; nunca
      `read_only`/`fixed`/`inferred`), `skuAttribute` (`SELLER_SKU`), `packageAttributes` (inteiros, cm e g; a partir de `resolvePackage`, T052), `gtinAttribute` (`EMPTY_GTIN_REASON` com o `value_id` da categoria,
      só quando exigido), `genderAttribute` (departamento → `GENDER`), `sizeChartAttributes` (`SIZE`,
      `SIZE_GRID_ID`, `SIZE_GRID_ROW_ID`), `pickChartRow` (`SIZE` igual a `tamanho_etiqueta`, senão
      `tamanho_equivalente`; `BRAND` > `STANDARD` > `SPECIFIC`), `truncateName` (`max_title_length`),
      `capPictures` (`max_pictures_per_item`, capa primeiro), `sanitizePlainText` (só `\n`, sem
      HTML/emoji, `max_description_length`), `immediateTag`, `assertPriceInRange` (falha antes de qualquer
      `POST`/`PUT`), garantia (sem garantia; nunca "Recondicionado"), `available_quantity = 1`,
      `listing_type_id` configurável. Testes em tabela — depende de T008, T052, T053, T054.
- [ ] T024 `plugins/marketplaces/mercado-livre.connector.ts` — token: lê a credencial
      (`parseMercadoLivreCredential`); sem tokens → erro "conta não conectada" (`reconnectRequired`);
      `expires_at` a menos de 5 min → `refreshToken()` e devolve o par novo em `updatedCredential`; um
      `401` da API → renova e repete a chamada 1×; lê a tag `user_product_seller` de `GET /users/me`; todo
      erro sai como `MarketplaceConnectorError` **carregando o `updatedCredential`** se houve renovação
      antes da falha. Testes com API/OAuth falsos — depende de T015, T021, T022.
- [ ] T025 Conector — **criar**: predictor (`q` = nome do produto) → `GET /categories/{id}` (exige
      `listing_allowed` e `status = enabled`) → atributos (+ endpoint condicional para o GTIN) → **moda:**
      se o domínio está em `active_domains`, procura a tabela de medidas e a linha (spec 3.5) e falha
      **antes do `POST`** com mensagem clara se não houver → valida faixa de preço → `POST /items` →
      `POST` da descrição; descrição que falha vira `pendencia` (o item não é desfeito); retentativa de
      entrada sem `id_anuncio` procura antes pelo SKU (`GET /users/{user_id}/items/search?seller_sku=…`),
      consulta os ids achados em multiget e adota o mais recente que **não** esteja `closed`. Testes:
      criação completa nos dois modelos (`family_name` e `title`), descrição falha, resposta perdida com
      adoção por SKU, preço fora da faixa (nenhuma chamada de escrita), categoria sem `listing_allowed`,
      moda com tabela `BRAND`/`STANDARD`, moda sem linha correspondente, domínio fora de `active_domains`
      — depende de T023, T024.
- [ ] T026 Conector — **atualizar**: `GET /items/{id}` (status, `sold_quantity`, categoria) → categoria e
      atributos → `PUT /items/{id}` → descrição por `PUT ...?api_version=2` (queda para `POST` se o item
      ainda não tem descrição); `family_name`/título só se `sold_quantity = 0`; `pictures` sempre incluído;
      `warnings` da resposta (preço ignorado) viram `pendencia`; item já `closed` no Mercado Livre → erro que
      orienta usar "Encerrar anúncio". Testes correspondentes (nome com e sem vendas, *warning* de preço,
      descrição inexistente) — depende de T023, T024.
- [ ] T027 Conector — **encerrar**: `GET /items/{id}` antes (`status = closed` → sucesso sem `PUT`); senão
      `PUT { status: "closed" }`; `409` repetido antes de falhar; item `under_review`/`payment_required`
      que recuse `closed` → mensagem do Mercado Livre ao operador. Testes — depende de T022, T024.
- [ ] T028 Configuração e registro: `MERCADO_LIVRE_LISTING_TYPE_ID` (padrão `gold_special`) e
      `MERCADO_LIVRE_API_BASE_URL` lidos na criação do conector; ambos documentados em
      `backend/.env.example`; registrar o conector em `connector-registry.ts` — depende de T016, T025,
      T026, T027.


- [ ] T052 Configuração do pacote padrão (spec, seção 3.4): `plugins/marketplaces/mercado-livre-package.config.ts`
      — schema Zod de `MERCADO_LIVRE_PACKAGE_DEFAULTS` (`padrao` obrigatório; entradas com `altura_cm`,
      `largura_cm`, `comprimento_cm` inteiros > 0 e `peso_g` opcional), leitura tardia (só quando o conector
      precisa), `resolvePackage(product)` com prioridade categoria > departamento > padrão e peso do produto
      (kg → g, `ceil`) com `peso_g` de reserva; erros claros (`PackageConfigError`) para variável ausente,
      JSON quebrado e peso inexistente, que o serviço grava como `erro` **antes** do `POST`; exemplo em
      `backend/.env.example`. Testes em tabela (as três prioridades, peso do produto × reserva, variável
      ausente, JSON inválido) — depende de T015.

## Fase 5 — Serviços e rotas de anúncio

- [ ] T029 `marketplace-listing.service.ts`: `publishListing` sobre `runAccountOperation` e a porta nova,
      aplicando a tabela de transições da spec 3.1 — criar, atualizar, recriar sobre `encerrado`;
      falha parcial (`publicado` + `erro`); falha de atualização que **mantém** `publicado`; recriação
      que falha mantém `encerrado` com `erro`; `publicado_em` atualizado a cada sucesso; auditoria
      `PRODUCT_PUBLISH` sem credencial. Testes unitários, uma linha da tabela por caso — depende de T012,
      T017, T019, T028.
- [ ] T030 `closeListing` (novo): entrada existe e está `publicado` (senão `ListingNotPublishedError` →
      `409`); conta existe (`404`), ativa e conectada (senão `AccountNotReadyError` → `409` com o passo
      que resolve, **sem** chamar o conector); `runAccountOperation` → `connector.close`; sucesso grava
      `encerrado` + `encerrado_em`, falha mantém `publicado` com `erro` "Falha ao encerrar: …";
      auditoria `PRODUCT_UNPUBLISH` (marketplace, `accountId`, `id_anuncio`, sucesso/erro). Testes
      unitários — depende de T011, T012, T019, T029.
- [ ] T031 `routes/marketplace-listing.routes.ts`: `POST /api/products/:id/marketplace-listings/close`
      (`admin`/`operator`), corpo `{ marketplace, accountId }` validado por Zod, mapeia 404/409/400 como
      as rotas vizinhas — depende de T030.
- [ ] T032 Testes de integração (Fastify + MongoDB em memória, **conector real** com API/OAuth falsos) em
      `tests/integration/marketplace-mercado-livre.spec.ts`: fluxo publicar → republicar → encerrar →
      publicar de novo (id novo); `viewer` recebe `403` em publicar e encerrar; `409` fora de ordem;
      auditoria sem credencial; `publishedListingsCount` correto por conta (inclui produto `vendido`);
      par de tokens renovado é gravado mesmo quando a operação falha depois; duas publicações
      simultâneas na mesma conta gastam o `refresh_token` uma vez só; desconectar durante a operação
      descarta o par novo; desativar/desconectar/apagar conta com anúncio no ar continua permitido —
      depende de T014, T031.

## Fase 6 — Frontend

- [ ] T033 Serviço e hook: `closeListing` em `services/marketplace-listing.service.ts` e `useCloseListing`
      em `hooks/useMarketplaceListings.ts` (invalida a query do produto) — depende de T031.
- [ ] T034 `features/products/PublishToMarketplace.tsx`: badge "Encerrado"; "Ver anúncio" só em
      `publicado`; entrada `publicado` com `erro` mostra o aviso de pendência; o botão principal vira
      "Republicar no Mercado Livre" quando a conta escolhida já tem entrada `publicado`; "Encerrar
      anúncio" por linha, com confirmação inline (texto da spec 011, seção 4.7) e o erro da API visível
      — depende de T011, T033.
- [ ] T035 `features/products/ActiveListingsNotice.tsx` (novo): aviso "esta peça tem anúncio no ar" com
      "Encerrar anúncios e continuar" / "Continuar sem encerrar" / "Cancelar"; encerra em sequência e, se
      algum encerramento falhar, para, mostra o erro e **não** muda o status da peça — depende de T033.
- [ ] T036 `pages/products/ProductsPage.tsx`: usa o aviso antes de "Marcar como vendida" e "Desativar"
      quando o produto tem entrada `publicado` — depende de T035.
- [ ] T037 `pages/products/ProductFormPage.tsx`: usa o aviso ao salvar mudando o status para `vendido` ou
      `inativo` (o formulário permite editar o status) — depende de T035.
- [ ] T038 `pages/admin/MarketplaceAccountsPage.tsx`: coluna "Anúncios no ar" e
      `publishedListingsCount` no texto da confirmação de **Desconectar** e de **Apagar** (só avisa, não
      bloqueia — ADR-022, adendo) — depende de T014.

## Fase 7 — E2E com servidor falso

- [ ] T039 `e2e/fake-mercado-livre.ts`: servidor HTTP em porta local com respostas roteirizáveis por teste
      (categorias, criação, atualização, descrição, encerramento, erros); o backend do `webServer` do
      Playwright sobe com `MERCADO_LIVRE_API_BASE_URL` apontando para ele — depende de T028.
- [ ] T040 Helper de `global-setup` que cria uma conta do Mercado Livre **já conectada** direto no banco
      de teste, com credencial cifrada e tokens válidos (o OAuth de navegador não é automatizável) —
      depende de T039.
- [ ] T041 `e2e/tests/marketplace-mercado-livre.spec.ts`: publicar, republicar e encerrar pela tela; aviso
      ao marcar como vendida com anúncio no ar (encerrar e continuar / continuar sem encerrar /
      cancelar); confirmação de Desconectar mostrando "N anúncio(s) no ar" — depende de T036, T038, T040.
      Roda contra o cluster de teste do Atlas (`e2e/AGENTS.md`).

## Fase 8 — Verificação manual contra o Mercado Livre real

Fecha a Fase 0 com evidência. Publicar cria um anúncio **real**: usar uma peça de teste e encerrá-la
no mesmo dia.

- [ ] T042 Preparar o teste real com **usuário de teste** (o Mercado Livre não tem sandbox): criar o usuário
      de teste vendedor (`POST /users/test_user`, `{"site_id":"MLB"}`) e **guardar** apelido e senha; pedir a
      ambientação ao modelo *User Products* pelo formulário da documentação (ativação a cada 7 dias); cadastrar
      a conta no ERP com o Client ID/Secret do app e conectá-la por OAuth logando como o usuário de teste;
      registrar o resultado — status "Conectada" e renovação de token funcionando — depende de T004, T032.
      **Andamento (21/09/2026):** conta real conectada no ambiente de desenvolvimento (token válido, tag
      `user_product_seller` presente); usuário de teste vendedor **criado** (id 3699839278; credenciais em
      `humandevnotes.md`, ignorado pelo git). Faltam o formulário de ambientação ao modelo *User Products* e conectar
      o usuário de teste por OAuth.
- [ ] T043 Publicar uma peça de teste — título "Item de Teste – Por favor, NÃO OFERTAR!", categoria "Outros",
      `MERCADO_LIVRE_LISTING_TYPE_ID` diferente de `gold`/`gold_premium` — e conferir o anúncio no Mercado Livre
      (nome/título, preço, fotos, descrição, dimensões do pacote, tipo de anúncio) — depende de T009, T041, T042.
- [ ] T044 Republicar (mudando o preço) e **encerrar**; conferir que o anúncio saiu do ar e que o ERP
      mostra "Encerrado"; registrar o que o Mercado Livre devolveu — em especial o formato real do *warning*
      de preço ignorado (`warnings` da resposta do `PUT`), a resposta do encerramento e o efeito do
      `sandbox_mode` — depende de T043.
- [ ] T049 Primeira **publicação real** (uma peça de verdade na conta da loja — a conta de produção é a que já está
      conectada, `user_id` 3692153317, decisão de 21/09/2026 — com o tipo de anúncio decidido
      em T010): é uso, não teste; conferir e, se algo divergir do teste, registrar — depende de T010, T044, T051, T053.
- [ ] T045 Documentação: registrar na [spec](spec.md) o que a Fase 8 confirmou (formato do *warning*, resposta
      do encerramento, `sandbox_mode`, decisões de T008 e T010); mudar o `Status` da spec de Draft para o
      estado real; registrar em `specs/011-integracao-marketplaces/tasks.md` uma fase nova com a
      mudança de contrato (porta e `MarketplaceListingSchema`) e corrigir a assinatura da porta em
      `specs/011-integracao-marketplaces/plan.md` (seção 5, passo 2) — depende de T049.

## Dependências entre tarefas

```
T001 → T002, T003 → T004                      (Fase A, já entregue)
T005, T006, T007, T008 → T022                 (todas confirmadas)
T008, T052, T053, T054 → T023                 (T053 e T054 são decisões abertas)
T015 → T052
T023, T024 → T025, T026    T022, T024 → T027
T010 → T049    T009 → T043

T011 → T015, T029, T030, T034
T012 → T029, T030
T013 → T014 → T032, T038
T015 → T016 → T017
T015, T018 → T019 → T020
T019, T017, T012, T028 → T029 → T030 → T031 → T032
T001 → T021 → T024
T015, T021, T022 → T024
T016, T025, T026, T027 → T028
T031 → T033 → T034, T035 → T036, T037
T028 → T039 → T040 → T041   (T036, T038 também alimentam T041)
T004, T032 → T042 → T043 → T044 → T049 → T045
T053, T051 → T049
```

## Nota

T005 a T009, T046 a T048 e T050 estão confirmados, decididos ou medidos. O que mais mudou o desenho: o
**modelo *User Products*** (`family_name` no lugar de `title`), o **SKU em `SELLER_SKU`**, o **pacote padrão
configurável** (T046) e o fato de o Mercado Livre **não ter sandbox** (a Fase 8 usa usuário de teste). A
**conta de produção** é a que já está conectada (decisão de 21/09/2026).

O T050 mudou o escopo de roupas: **nenhum domínio de roupa tem tabela de medidas pronta** (só calçados), então
roupas exigem uma tabela `SPECIFIC` do vendedor — decisão **T053**. Junto veio a decisão **T054** (o preditor de
categorias errou o domínio de peças comuns; proposta de mapeamento configurável) e o requisito de que o
`tamanho_etiqueta` seja obrigatório para publicar moda (hoje 7 de 9 produtos de dev não têm).

Continuam abertos: **T053** e **T054** (decisões), **T051** (valores reais do pacote — dona do brechó) e
T010 (tipo de anúncio). As fases 1 a 3 e as tarefas T021, T022, T024, T027 e T052 não dependem deles; **calçados**
já poderiam publicar com a tabela `STANDARD`. Pontos cinza menores: o texto exato do *warning* de preço ignorado
(plano, seção 7). Nenhuma tarefa de código depende de T010 ou T051.

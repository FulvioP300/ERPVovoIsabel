---
name: decisions
description: Registro de decisões arquiteturais (ADR) do ERP da Vovó Isabel — histórico de escolhas técnicas que desviam ou detalham o documento fonte original.
---

# Registro de Decisões Arquiteturais — ERP da Vovó Isabel

Este documento mantém o histórico de decisões técnicas relevantes tomadas ao longo do
projeto, no formato ADR (*Architecture Decision Record*). Fica separado de
[constitution.md](constitution.md) para que a constituição continue enxuta e focada em
princípios estáveis, enquanto este arquivo cresce com o tempo.

Toda decisão aqui registrada que altere a stack tecnológica da seção 2 da constituição deve
também atualizar a tabela correspondente em `constitution.md`. Decisões que desviam do
documento fonte original (`Especificação Funcional e Técnica — Brechó da Vovó Isabel.md`)
devem apontar para a versão do documento fonte que reflete a mudança, quando existir (ver
`Especificação Funcional e Técnica — Brechó da Vovó Isabel (v1.1).md`).

## Convenção

Cada ADR segue o formato:

```
## ADR-NNN — Título

**Status:** Proposta | Aceita | Superada por ADR-XXX
**Data:** AAAA-MM-DD
**Specs afetadas:** lista de specs em specs/

### Contexto
### Decisão
### Consequências
```

---

## ADR-001 — Provedor de armazenamento de imagens: Azure Blob Storage

**Status:** Aceita
**Data:** 2026-08-22
**Specs afetadas:** [007-imagens](../specs/007-imagens/spec.md)

### Contexto

O documento fonte original (v1.0, seção 4.4) sugeria **Cloudinary** como provedor
preferencial de armazenamento de imagens, com AWS S3 e Cloudflare R2 como alternativas
futuras. O time do projeto decidiu adotar diretamente **Azure Blob Storage** como provedor
de imagens desde o MVP.

### Decisão

Substituir Cloudinary por Azure Blob Storage em todas as referências de stack e
implementação:

- `memory/constitution.md`, seção 2 (tabela de stack).
- [specs/007-imagens/spec.md](../specs/007-imagens/spec.md): seção de armazenamento
  reescrita (container privado, acesso via URL pública de blob ou SAS token, upload/remoção
  exclusivos do backend).
- [specs/007-imagens/plan.md](../specs/007-imagens/plan.md): adapter
  `backend/src/plugins/images/azure-blob.adapter.ts` usando `@azure/storage-blob`.
- [specs/007-imagens/tasks.md](../specs/007-imagens/tasks.md): tarefa de implementação do
  adapter e de configuração de dependência/variáveis de ambiente.
- `backend/.env.example`: `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
  `CLOUDINARY_API_SECRET` → `AZURE_STORAGE_CONNECTION_STRING` / `AZURE_STORAGE_CONTAINER_NAME`.
- `backend/package.json`: dependência `@azure/storage-blob`.
- Nova versão do documento fonte:
  `Especificação Funcional e Técnica — Brechó da Vovó Isabel (v1.1).md` (documento original
  v1.0 preservado sem alterações, como referência histórica).

### Consequências

- **Sem impacto em regras de negócio.** A troca foi viabilizada inteiramente pela abstração
  de provedor de imagens exigida pela constituição, princípio VI (`ImageProviderPort`): só o
  adapter concreto muda. O contrato (`upload`/`remove`) e o modelo de dados persistido em
  `products.imagens` (id, URL, metadados, ordem, tipo) permanecem idênticos.
- ~~Decisão em aberto sobre leitura pública vs. SAS token~~ e topologia de containers —
  resolvidas pelo [ADR-003](#adr-003--topologia-do-azure-blob-storage-1-storage-account-leitura-pública-a-nível-de-blob).
- Nenhuma outra spec ou domínio (categorias, SKU, produtos, IA) precisou de alteração.

---

## ADR-002 — Adapter de IA genérico compatível com a API OpenAI

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [006-produtos-cadastro-ia](../specs/006-produtos-cadastro-ia/spec.md)

### Contexto

`plan.md` de 006 deixava em aberto a escolha do provedor de IA multimodal concreto
(`<provider>.adapter.ts`), sem fixar um vendor. Em vez de acoplar a implementação a um SDK
proprietário de um único provedor, foi adotado o SDK oficial `openai` (Node), que permite
apontar `baseURL` para qualquer endpoint compatível com o formato OpenAI Chat Completions
(texto + imagem → JSON estruturado via `response_format: json_object`).

### Decisão

Implementar `backend/src/plugins/ai/openai-compatible.adapter.ts` como a implementação
concreta de `AiProviderPort` ([ai-provider.port.ts](../backend/src/plugins/ai/ai-provider.port.ts)),
configurável inteiramente por variáveis de ambiente — nenhuma troca de código necessária para
trocar de provedor:

- `AI_API_KEY` — chave do provedor.
- `AI_BASE_URL` — endpoint da API; vazio usa a OpenAI oficial
  (`https://api.openai.com/v1`); pode apontar para qualquer gateway/servidor compatível
  (OpenRouter, Groq, Together AI, vLLM, Ollama, LM Studio, Azure OpenAI em modo compatível
  etc.).
- `AI_MODEL` — identificador do modelo no provedor escolhido.

`backend/.env.example` e `backend/package.json` (dependência `openai`) atualizados de acordo.
O prompt de sistema padrão do adapter já reforça o princípio I da constituição (campo
indeterminável ⇒ `null`, nunca valor inventado); a validação estrutural via Zod continua
ocorrendo em `services/ai-intake.service.ts` (T002/T006 de
[006/tasks.md](../specs/006-produtos-cadastro-ia/tasks.md)), nunca no adapter.

**Validado contra o endpoint real configurado em `.env`** (gateway interno
`modelpool.p300cognitive.com`, modelo `qwen/qwen3.8-27b`, com suporte a visão): a chamada de
texto simples e a chamada com imagem (`image_url` em base64) funcionam. Descoberta relevante:
esse gateway rejeita `response_format: {type: "json_object"}` com `400` (só aceita
`json_schema` ou `text`) — divergência real de "compatibilidade OpenAI" entre provedores. Por
isso o adapter **não** envia `response_format` por padrão; a saída JSON é garantida só via
instrução no prompt de sistema + parsing defensivo (remove cercas Markdown, extrai o primeiro
objeto/array JSON válido do texto). Um flag `useJsonObjectResponseFormat` no construtor permite
reativar o parâmetro para provedores que o suportam (ex.: OpenAI oficial).

### Consequências

- Resolve parcialmente o risco em aberto do `plan.md` de 006 (seção 7): o provedor concreto
  continua não fixado a um vendor específico, mas a implementação já existe e funciona com
  qualquer provedor compatível com o formato OpenAI, sem código adicional.
- **Fora do escopo desta decisão:** provedores com formato de API não compatível com OpenAI
  Chat Completions (ex.: Anthropic Claude, Google Gemini em suas APIs nativas) exigiriam um
  adapter próprio implementando o mesmo `AiProviderPort` — a abstração já suporta isso sem
  alterar `ai-intake.service.ts`.
- T001 e T005 de [006/tasks.md](../specs/006-produtos-cadastro-ia/tasks.md) foram concluídas
  antes do restante da feature (que ainda depende de 003, 004 e 005).

---

## ADR-003 — Topologia do Azure Blob Storage: 1 Storage Account, leitura pública a nível de blob

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [007-imagens](../specs/007-imagens/spec.md)

### Contexto

`plan.md` de 007 (seção 7) deixava em aberto duas decisões de implementação do Azure Blob
Storage adotado no [ADR-001](#adr-001--provedor-de-armazenamento-de-imagens-azure-blob-storage):
(1) se o container teria leitura pública a nível de blob ou seria privado com SAS token gerado
sob demanda pelo backend; (2) como isolar dev/test/prod (mesmo padrão de separação já adotado
para o MongoDB Atlas — 3 Projects/clusters distintos).

Durante o provisionamento, a Storage Account foi criada com **"Allow Blob anonymous access"
desabilitado** (padrão de segurança de contas novas no portal Azure), o que impedia configurar
qualquer container como público — resolvido habilitando essa opção a nível de conta antes de
criar os containers.

### Decisão

- **Acesso do container**: leitura pública a nível de **blob** (`Anonymous access level =
  Blob`), não a nível de container (que permitiria listar todos os blobs). URLs de blob são
  estáveis e não expiram — adequado para persistir diretamente em `products.imagens.*.url`,
  sem depender de renovação de SAS token. Upload e remoção continuam exclusivos do backend,
  autenticado via `AZURE_STORAGE_CONNECTION_STRING` (chave de acesso da conta), nunca exposta
  ao frontend.
- **Topologia**: **1 única Storage Account** (`stvovoisabel`) compartilhada entre ambientes,
  com **3 containers separados**: `product-images-dev`, `product-images-test`,
  `product-images-prod`. A `AZURE_STORAGE_CONNECTION_STRING` é a mesma nos três ambientes; só
  `AZURE_STORAGE_CONTAINER_NAME` muda. Isolamento é por container/namespace, não por
  credencial — mais simples de provisionar que 3 storage accounts, ao custo de os três
  ambientes compartilharem a mesma chave de acesso.
- `backend/.env.example` atualizado: `AZURE_STORAGE_CONTAINER_NAME` passa de `product-images`
  (genérico) para `product-images-dev` (com comentário explicando a variação por ambiente).

### Consequências

- Resolve as duas decisões em aberto do `plan.md` de 007, seção 7.
- **Validado de ponta a ponta** contra a Storage Account real (`stvovoisabel`): os 3
  containers existem, o container de dev tem `blobPublicAccess = "blob"`, e um blob de teste
  fez upload → leitura anônima via URL pública (200 OK, sem token) → remoção, com sucesso.
- **Risco aceito**: como as 3 credenciais de ambiente são idênticas (mesma Storage Account),
  um bug ou vazamento de `AZURE_STORAGE_CONNECTION_STRING` de um ambiente expõe escrita/leitura
  em todos os containers, inclusive `-prod`. Mitigação mínima: nunca versionar `.env`
  (já garantido pelo `.gitignore`) e, se o projeto crescer, migrar para 3 storage accounts ou
  para SAS delegado por ambiente — não é necessário no MVP.
- Como as URLs de blob são públicas e estáveis, qualquer pessoa que descubra a URL de uma
  imagem pode acessá-la (mas não listar nem escrever) — aceitável porque fotos de peça não são
  dado sensível (mesma justificativa já registrada no ADR-001).

---

## ADR-004 — Bootstrap do admin inicial via script de seed

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [001-autenticacao](../specs/001-autenticacao/spec.md),
[002-usuarios](../specs/002-usuarios/spec.md)

### Contexto

`POST /api/users` (002) é restrito a `role = admin`, mas `001-autenticacao` só autentica —
não cria usuários. Sem nenhum usuário na collection `users`, não há como logar pela primeira
vez nem criar o primeiro admin pela própria API (problema "ovo e galinha"). Nenhuma spec
cobria esse bootstrap. Duas opções foram consideradas: (a) script de seed manual, reexecutável
e idempotente; (b) o `server.ts` criar automaticamente um admin no boot se a collection
`users` estiver vazia.

### Decisão

Optou-se por **(a)**: `backend/src/scripts/seed-admin.ts`, rodado via `npm run seed:admin`
(não faz parte do bootstrap do Fastify em `server.ts`).

- Exige `SEED_ADMIN_EMAIL` no ambiente (erro claro se ausente) — nunca inventa um e-mail.
- `SEED_ADMIN_PASSWORD` é opcional: se ausente, gera uma senha aleatória de 12 bytes
  (`crypto.randomBytes(12).toString("base64url")`) e imprime uma única vez no console,
  seguindo a mesma ideia de "senha temporária" já prevista em 002-usuarios, seção 5.
- **Idempotente**: se já existir qualquer usuário `role = admin`, o script não faz nada e
  informa qual e-mail já existe — seguro rodar múltiplas vezes, inclusive por engano em CI.
- Usa `hashPassword()` de `services/password.service.ts` (Argon2id, T008 de
  [001/tasks.md](../specs/001-autenticacao/tasks.md)) e `connectMongo()`/`getDb()` de
  `database/mongo.client.ts` (T001) — nenhuma lógica de hashing/conexão duplicada.
- Insere diretamente na collection `users` (sem passar por um `user.repository.ts` de
  escrita, que pertence a 002-usuarios e ainda não existe) — é uma ferramenta operacional de
  bootstrap, não um endpoint da API.

### Consequências

- Rejeitada a opção (b) (auto-criação no boot): criar um admin implicitamente toda vez que a
  collection estiver vazia é mais fácil de disparar sem querer (ex.: apontar `.env` para um
  banco novo por engano em produção) e menos auditável que um comando explícito.
- **Validado contra o cluster de dev real**: rodado duas vezes — a primeira criou
  `admin@vovoisabel.com.br` (senha temporária gerada e entregue ao usuário fora deste
  documento); a segunda, com outro e-mail, corretamente recusou criar um segundo admin.
- Mesmo padrão deve ser reaproveitado (mesmo script, apontando para o `.env` daquele
  ambiente) ao provisionar os ambientes de teste e produção mais adiante.

---

## ADR-005 — Identidade visual do frontend: paleta e tipografia inspiradas no site institucional

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** nenhuma spec específica — decisão transversal de UI, vale para toda tela
construída daqui em diante (001, 002 e futuras).

### Contexto

Nenhuma spec, a constituição ou o documento fonte definiam paleta de cores, tipografia ou
identidade visual — só "CSS Modules/Tailwind" como opção de stack (constituição, seção 2).
`LoginPage.tsx` (001) foi implementada em HTML puro sem estilo; as telas de 002-usuários
usaram Tailwind com uma paleta azul genérica, escolhida sem nenhuma referência de marca. O
usuário pediu um design inspirado no site institucional real
([vovoisabel.com.br](https://www.vovoisabel.com.br/)), que hoje é uma página "Em breve" com
um emblema dourado (medalhão com a Vóvó Isabel ilustrada) sobre fundo bordô.

### Decisão

Extraídas por amostragem de pixel do logo real (não estimadas visualmente):

| Token | Hex | Origem |
|---|---|---|
| `wine-900` | `#3d0006` | fundo bordô da página institucional |
| `gold-400` | `#f1b233` | brilho do anel do medalhão |
| `gold-600` | `#c9891f` | tom médio das letras douradas |
| `gold-800` | `#693f09` | sombra/bronze do relevo dourado |

Escalas completas (`wine-50`...`950`, `gold-50`...`900`) interpoladas a partir desses pontos,
mais `cream-50`/`cream-100` (fundo neutro claro para telas de trabalho) — definidas em
`frontend/src/app/index.css` via `@theme` do Tailwind v4 (CSS-first, sem `tailwind.config.js`).
Tipografia: `Playfair Display` (serifada, mesmo espírito do logo) para títulos/marca via
`font-display`, `Inter` para todo o resto (formulários, tabelas) via `font-sans` — carregadas
por `@import` do Google Fonts no mesmo CSS.

**Uso diferenciado por contexto**: a tela de login usa o bordô como fundo cheio (dramático,
"vitrine" da marca — `bg-wine-950`), enquanto as telas de trabalho (home, admin) usam fundo
claro (`bg-cream-50`) com bordô só em acentos (título, links, botões primários) — telas
densas de dados (tabelas, formulários) precisam de contraste alto e leitura prolongada
confortável, um fundo bordô cheio nelas seria pior para uso real. Cores semânticas de status
(`Badge.tsx`: verde/cinza/vermelho para ativo/inativo/bloqueado) foram mantidas como estão,
não substituídas por bordô/dourado — cor de status carrega significado (sucesso/neutro/
alerta) que não deve ser sacrificado por consistência de marca.

Criado também `components/AppLayout.tsx` — cabeçalho comum (marca + navegação + "Sair") para
toda tela autenticada, resolvendo de quebra uma lacuna real: `UsersPage`/`UserFormPage` não
tinham nenhum jeito de deslogar sem voltar manualmente para `/`.

### Consequências

- `LoginPage.tsx`, `App.tsx`/`HomePage`, `UsersPage.tsx`, `UserFormPage.tsx`, `UserForm.tsx`
  migrados da paleta azul genérica/HTML sem estilo para `wine`/`gold`/`cream`. Nenhum uso de
  `blue-*` restante no frontend.
- Qualquer tela nova (003 em diante) deve reutilizar os tokens `wine-*`/`gold-*`/`cream-*` e
  `font-display`/`font-sans` já definidos em `index.css`, envolvida em `AppLayout`, em vez de
  reintroduzir cores ad-hoc.
- **Fora do escopo desta decisão**: o site institucional real não tem nenhuma página além do
  "Em breve" — não há mockups de e-commerce, catálogo público etc. para se inspirar; quando
  essas telas existirem (fase 3, fora do MVP), a paleta aqui definida é o ponto de partida,
  não uma garantia de que baterá com o design final do site quando ele for ao ar.

---

## ADR-006 — `ignoreUndefined: true` no MongoClient (bug de semântica de campo opcional)

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [008-auditoria](../specs/008-auditoria/spec.md) (onde foi descoberto),
mas a correção vale para **todo** o backend, já que é uma opção do client compartilhado.

### Contexto

Implementando o teste de integração de 008 (T002), um caso previsto na própria spec —
`LOGIN_FAILED` para e-mail inexistente não deve ter `userId` — falhava de um jeito
inesperado: o campo não vinha ausente, vinha `null`. Investigação: o driver oficial do
MongoDB (Node) converte, por padrão, campos com valor `undefined` em BSON `null` na
inserção, em vez de simplesmente omitir a chave do documento. Todo o código do projeto
(schemas Zod com `.optional()`, `record()` recebendo `userId?: string`) foi escrito supondo
que "opcional" significa "ausente quando não aplicável", não "`null` quando não aplicável".

### Decisão

Adicionar `{ ignoreUndefined: true }` na construção do `MongoClient` em
`backend/src/database/mongo.client.ts` — com isso, campos `undefined` passados a
`insertOne`/`updateOne` etc. são omitidos de verdade, restaurando a semântica original em
todo o app (não só em `audit_logs` — qualquer repository futuro que insira um campo opcional
como `undefined` se beneficia da mesma correção).

**Documentos gravados antes desta correção continuam com `null` explícito no banco** (dev e
possivelmente test/prod, dependendo de quando cada um recebeu o fix) — não houve migração
retroativa dos dados existentes, é uma mudança pontual barata demais para justificar isso.
Por causa disso, os schemas de leitura que podem encontrar dados antigos
(`AuditLogOutputSchema` no backend, `AuditLogEntrySchema` no frontend) aceitam `null` além de
ausente (`.nullable().optional()`) nos campos afetados (`userId`, `entityId`, `metadata`) —
já os schemas de **escrita** (`AuditLogSchema`, usado por `record()`) continuam só
`.optional()`, já que código novo nunca deve gravar `null` de propósito.

### Consequências

- Qualquer repository futuro (categorias, produtos, imagens) que insira um documento com
  campo opcional ausente (`ObjectId | undefined`, por exemplo) já se beneficia da correção
  sem precisar de nenhuma mudança adicional — não é preciso lembrar de tratar isso caso a
  caso.
- Schemas de **leitura** de dados que já existiam antes desta data (14/09/2026) devem
  continuar aceitando `null` nos campos que eram opcionais — não assumir que só porque o
  client foi corrigido, todo dado no banco já reflete isso.
- `user.repository.ts` não foi afetado na prática porque seus campos opcionais já eram
  modelados como `T | null` explícito (`createdBy`, `lastLoginAt`), nunca `T | undefined` —
  só `audit_logs` usava a semântica `undefined` de fato.

---

## ADR-007 — `department` pertence à categoria, não ao produto (resolve conflito spec vs. glossário)

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [003-categorias](../specs/003-categorias/spec.md)

### Contexto

`specs/003-categorias/spec.md` (seção 2, modelo de dados; seção 5, critérios de aceite)
define `department` como campo obrigatório de `categories`. `memory/glossary.md` (versão
anterior) descrevia "Departamento" como campo do **produto**
(`classificacao.departamento`), "distinto de categoria" — direta contradição. O catálogo de
referência da spec (seção 2 — 11 códigos) não atribui departamento a nenhum deles.

### Decisão

Seguir `specs/003-categorias/spec.md` ao pé da letra: `department` é campo obrigatório de
`categories`, validado na criação (`CreateCategorySchema`). `memory/glossary.md` corrigido
para refletir isso — quando 005-produtos-cadastro-manual for implementada, o departamento
exibido/filtrado no produto deriva da categoria selecionada, não é digitado
independentemente.

Distribuição de `department` para o catálogo de referência (script `seed-categories.ts`,
sem base na spec, que não atribui nenhum) — decisão de dado inicial, editável depois pela
tela de admin:

| Departamento | Categorias |
|---|---|
| Masculino | BERM, CALC, CAMI, POLO, JAQU |
| Feminino | VEST, BLUS, SAIA |
| Unissexo | SAPT, BOLS, ACES |

### Consequências

- Uma categoria tem exatamente um departamento fixo — uma peça "unissex" dentro de uma
  categoria departamentalizada (ex.: uma calça jeans unissex em `CALC`, marcada
  "Masculino") usa o departamento da categoria mesmo assim; não há mecanismo de override por
  produto nesta fase. Se isso se mostrar problemático quando 005 for implementada, é uma
  revisão de escopo da spec 003, não um bug de 003 em si.
- `memory/glossary.md` deixou de ser fonte confiável nesse ponto específico até esta
  correção — reforça a prática de verificar a spec real antes de confiar cegamente no
  glossário quando os dois divergem (o glossário é resumo, a spec é a fonte primária).

---

## ADR-008 — `z.coerce.boolean()` não serve para query strings (bug real, corrigido)

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [003-categorias](../specs/003-categorias/spec.md)

### Contexto

Testando `GET /api/categories?active=false` manualmente no navegador (fluxo real, não só
`app.inject()`), o filtro não funcionava — retornava categorias ativas mesmo pedindo
`active=false`. Causa: `ListCategoriesQuerySchema` usava `z.coerce.boolean()`, que por baixo
dos panos chama o construtor `Boolean(valor)` do JavaScript — e `Boolean("false")` é `true`,
porque qualquer string não vazia é *truthy*. Como toda query string chega como texto,
`?active=false` sempre virava `true`. O teste de integração original só cobria
`?active=true` (que por coincidência também dá `true` com o bug), então passou sem detectar
o problema — só apareceu testando manualmente no navegador.

### Decisão

Trocado por um enum explícito com transform:
```ts
active: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true"))
```
Adicionado um teste de integração específico para `active=false` (não só `active=true`), que
teria pego esse bug automaticamente.

### Consequências

- Nenhum outro uso de `z.coerce.boolean()` no backend (conferido via busca no código) — bug
  isolado a este único campo.
- **Regra geral para qualquer schema futuro de query string**: nunca usar
  `z.coerce.boolean()` para um parâmetro que pode chegar como `"false"` — sempre usar
  `z.enum(["true","false"]).transform(...)` ou equivalente. `z.coerce.number()` e
  `z.coerce.date()` não têm esse problema (não dependem de truthiness de string) e continuam
  seguros de usar.
- Reforça a prática já estabelecida na sessão: sempre que possível, testar o fluxo real no
  navegador/via curl além dos testes automatizados — os testes de integração cobrem o que
  quem os escreveu pensou em cobrir, não substituem validação manual contra o comportamento
  real.

---

## ADR-009 — Topologia do MongoDB Atlas: 3 ambientes (dev/test/prod), M0 por enquanto

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** nenhuma spec específica — infraestrutura transversal.

### Contexto

O projeto precisava de um MongoDB Atlas real (constituição, seção 2) hospedado com Azure
como provedor de nuvem, já que o usuário tinha uma subscription Azure com créditos
disponíveis e queria aproveitá-los. Duas perguntas em aberto: quantos ambientes provisionar
agora, e qual tier de cluster usar.

### Decisão

- **3 Organizations/Projects separados no Atlas** — `vovoisabel-dev`, `-test`, `-prod` — em
  vez de um projeto único com múltiplos bancos. Isolamento de rede, usuários de banco e
  billing por ambiente.
- **Tier M0 (gratuito) nos três**, por enquanto — não M10 dedicado via Azure Marketplace.
- Credenciais de cada ambiente ficam em `mongodbEnvironments/*.env` (gitignored, nunca
  versionado) — cada arquivo com `MONGODB_URI` própria.
- `backend/.env` (dev) e `e2e/.env` (test) apontam cada um para o cluster do seu ambiente.

### Consequências

- **Os créditos Azure não são consumidos por este provisionamento** — M0 é cobrado (na
  prática, gratuito) diretamente pela MongoDB, não passa pela Azure Marketplace. Só clusters
  M10+ dedicados são faturados através da subscription Azure. Isso foi uma escolha
  consciente: adiar o custo de M10 até existir necessidade real de produção (constituição,
  princípio V), mesmo sabendo que isso significa não usar os créditos ainda.
- Quando o projeto for para produção de verdade, migrar o Project `vovoisabel-prod` de M0
  para M10 (Azure Marketplace) é o gatilho que efetivamente consome os créditos — documentado
  como próximo passo, não implementado agora.
- `mongodb+srv://` (formato padrão do Atlas) depende de resolução de registro DNS **SRV**, que
  algumas redes domésticas/de provedor (comum no Brasil) não suportam — causa
  `querySrv ECONNREFUSED`. Correção não é trocar a URI para o formato "expandido" (sem SRV)
  permanentemente — isso muda se o Atlas reconfigurar os nós do cluster — e sim trocar o DNS
  da máquina para um resolvedor público (8.8.8.8/1.1.1.1); a forma expandida é só um
  workaround documentado em `backend/.env.example` para quem não puder trocar o DNS.

---

## ADR-010 — Infraestrutura de E2E: Playwright Test em `e2e/` na raiz, contra o cluster de teste

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [001-autenticacao](../specs/001-autenticacao/spec.md),
[002-usuarios](../specs/002-usuarios/spec.md) (primeiras specs com tarefas de E2E concluídas)

### Contexto

001 e 002 têm tarefas de E2E no `tasks.md` (ex.: "login completo até o dashboard", "acesso
negado para operador"), mas o projeto não tinha nenhuma infraestrutura de E2E — só os testes
de integração do backend (`mongodb-memory-server` + `app.inject()`, que nunca abrem um
browser real nem servem o frontend).

### Decisão

- **Playwright Test** (não só a lib `playwright` usada manualmente) como test runner de E2E.
- Vive em **`e2e/` na raiz do projeto** — não dentro de `backend/` nem `frontend/`, porque
  cobre os dois juntos. Pacote npm próprio (`@vovo-isabel/e2e`), com seu próprio
  `package.json`, `.env` e `tsconfig.json`.
- `playwright.config.ts` usa `webServer` (array) para subir backend e frontend juntos antes
  dos testes, com `reuseExistingServer: !process.env.CI` (aproveita servidores já rodando em
  dev local; sempre sobe do zero em CI).
- `global-setup.ts` garante o admin de fixture (idempotente) **reaproveitando os módulos reais
  do backend** (`connectMongo`, `userRepository`, `hashPassword`) em vez de duplicar lógica de
  seed — mesmo espírito do `seed-admin.ts` (ADR-004).
- **Banco: o cluster de teste dedicado do Atlas** (`vovoisabel-test`, ver ADR-009) — não
  `mongodb-memory-server` (que os testes de integração do backend já usam) nem o cluster de
  dev. E2E existe justamente para validar contra infraestrutura próxima da real; usar
  memory-server aqui reduziria essa garantia.
- Cada spec de teste é autossuficiente (specs rodam em paralelo por padrão) — nunca depende de
  outro arquivo de teste ter rodado antes; recursos de teste (usuários) usam e-mail com
  timestamp para nunca colidir com o índice único.

### Consequências

- Rodar `npm test` em `e2e/` cria dados reais no cluster de teste a cada execução (usuários
  com e-mail único) — não há limpeza automática entre execuções; aceitável para um banco que
  existe só para isso.
- Se alguém tiver um backend de dev rodando manualmente na porta 3333 ao rodar os testes E2E
  localmente, `reuseExistingServer` vai reaproveitar esse processo — e os testes rodam contra
  o banco de **dev**, não o de teste. Documentado como cuidado em `e2e/AGENTS.md`, não
  resolvido automaticamente (aceito como trade-off de simplicidade).
- Specs futuras (003 em diante) que ganharem tarefas de E2E devem seguir o mesmo padrão —
  nenhuma infraestrutura nova de E2E deve ser criada por spec.

---

## ADR-011 — `shared/` é um pacote compilado independente, não um workspace npm

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [005-produtos-cadastro-manual](../specs/005-produtos-cadastro-manual/spec.md)
(primeiro consumidor real), qualquer spec futura que use `shared/schemas/*`.

### Contexto

Até 005, `shared/` existia só como pasta vazia (`.gitkeep`). O plan.md de 005 previa
`shared/schemas/product.schema.ts` como "fonte única de verdade", importada por
`backend/src/schemas/product.schema.ts` e futuramente pelo frontend. Testado empiricamente
antes de escrever o schema: importar `../../shared/schemas/product.schema.ts` (fonte bruta)
por caminho relativo direto do backend quebra `tsc` com `TS6059 (File is not under
'rootDir')` — tanto em `--noEmit` quanto no build real — porque `backend/tsconfig.json` tem
`rootDir: "src"`. Além disso, `shared/` não tinha `node_modules` próprio, então nem `zod`
resolvia em runtime (`tsx`) nem em type-check.

Duas soluções possíveis: (a) migrar `backend/`, `frontend/`, `e2e/` para um workspace npm
(root `package.json` com `"workspaces"`), o que resolveria a resolução de módulo de forma
mais elegante (import por nome de pacote, sem build step); (b) manter `shared/` como um
pacote isolado igual aos outros (próprio `package.json`/`node_modules`), compilado para
`shared/dist/`, consumido via caminho relativo ao **build**, não ao `.ts` fonte.

### Decisão

Opção (b). `shared/` ganhou `package.json` (`@vovo-isabel/shared`), `tsconfig.json`
(`outDir: "dist"`, `declaration: true`), `eslint.config.js` e `AGENTS.md` próprios — mesmo
padrão de isolamento de `backend/`/`frontend/`/`e2e/` (cada um com instalação e
`package-lock.json` independentes). `npm run build` gera `shared/dist/schemas/*.js` +
`*.d.ts`; `backend`/`frontend` importam `../../../shared/dist/schemas/product.schema.js`,
nunca o `.ts` fonte. Validado empiricamente: `tsc --noEmit`, `tsc -p tsconfig.json` (build) e
execução via `tsx` funcionam limpos dos dois lados consumindo o `dist/` compilado.

### Consequências

- **Sem workspace npm neste projeto** — rejeitado por ser uma mudança de infraestrutura mais
  ampla (restruturaria a instalação de `backend/`, `frontend/`, `e2e/` já funcionando e
  testada) do que o necessário só para compartilhar um schema. Reavaliar se `shared/` crescer
  a ponto de o build manual virar fricção real no dia a dia (constituição, princípio V).
- **Trade-off aceito**: quem editar `shared/schemas/*.ts` precisa rodar `npm run build` lá
  antes de a mudança aparecer em `backend/`/`frontend/` — não há watch mode automático
  configurado. Documentado com destaque em `shared/AGENTS.md` justamente para não ser
  esquecido por um agente/dev futuro.
- Qualquer schema novo que precise ser compartilhado entre backend e frontend (ex.: quando
  006-produtos-cadastro-ia reaproveitar `ProductSchema`) segue o mesmo padrão — nenhuma
  reinvenção de mecanismo por spec.
- **Addendum (frontend, 005 Fase 5)**: o Vite dev server bloqueia por padrão servir arquivos
  fora da raiz do projeto (`frontend/`) — importar `shared/dist/...` (um nível acima) falhava
  em runtime no navegador com "The request url is outside of Vite serving allow list", mesmo
  com `tsc -b` limpo. Corrigido com `server.fs.allow: [<raiz do monorepo>]` em
  `frontend/vite.config.ts`. Qualquer app servido por Vite que importe de `shared/` precisa
  dessa mesma configuração.

---

## ADR-012 — Limite de fotos por peça vive no `ProductSchema`, não em `POST /api/images`

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [007-imagens](../specs/007-imagens/spec.md),
[005-produtos-cadastro-manual](../specs/005-produtos-cadastro-manual/spec.md)

### Contexto

007 previa validar "número máximo de imagens por peça" dentro de `image.service.ts`, no
momento do upload (`POST /api/images`). Na integração real com 005 (pedido do usuário: "cada
produto pode ter N fotos"), ficou claro que essa rota não é — e nunca foi — escopada por
produto: um upload pode acontecer **antes** do produto existir (durante o cadastro manual, o
operador sobe fotos enquanto ainda preenche o formulário). Validar a contagem na rota exigiria
ou (a) passar um `productId`/`draftId` opcional em todo upload, com um caminho especial para
"ainda não tem produto", ou (b) confiar inteiramente no cliente.

### Decisão

O limite (`MAX_PRODUCT_IMAGES = 10`, escolha arbitrária da implementação — a spec não fixa um
número) vive em `shared/schemas/product.schema.ts`, como `.max()` no array
`ImagensSchema.galeria`. `POST /api/images` faz upload de **um arquivo solto**, sem qualquer
noção de quantidade — a validação de quantidade acontece só quando o array completo de fotos é
enviado dentro de `POST`/`PATCH /api/products`, pelo mesmo Zod que já é a fonte única de
verdade do modelo. O frontend (`ImageUploader.tsx`) lê a mesma constante para desabilitar o
botão de adicionar fotos ao atingir o limite — nenhum número mágico duplicado.

### Consequências

- `POST /api/images` permanece uma rota genérica e reutilizável (006 vai usá-la do mesmo
  jeito, sem precisar inventar um fluxo de upload "pré-produto" separado).
- Trade-off aceito: um cliente que ignore o limite do frontend pode, em teoria, fazer upload
  de mais de `MAX_PRODUCT_IMAGES` blobs "soltos" (nunca embutidos em produto nenhum) — não é um
  problema de integridade de dados (o `ProductSchema` sempre barra o excesso no momento de
  salvar), só um desperdício de armazenamento no pior caso. Aceitável porque upload exige
  `authenticate` + `authorize(["admin","operator"])`, não é uma rota pública.
- Primeira foto da galeria = `imagens.principal` automaticamente, tanto na criação quanto na
  edição — sem seletor de "foto de capa" dedicado no MVP (não pedido explicitamente; reavaliar
  se o backoffice precisar de controle manual da ordem/capa no futuro).

---

## ADR-013 — Defesa em profundidade contra prompt injection em 006 (nenhuma defesa única é suficiente)

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [006-produtos-cadastro-ia](../specs/006-produtos-cadastro-ia/spec.md)

### Contexto

006 é a única spec do projeto que envia conteúdo fornecido por usuário (texto + imagens) a um
LLM. Isso introduz uma classe de risco nova (OWASP LLM01, *Prompt Injection*) que nenhuma
outra spec tem: uma instrução maliciosa pode chegar tanto pelo campo de descrição digitado
quanto — de forma mais perigosa, porque não aparece em nenhum campo revisável antes do envio —
embutida numa foto (uma etiqueta fotografada com texto adversarial, um cartaz, um QR code).

O risco só foi endereçado até então de forma implícita: a spec original já dizia "IA nunca
inventa categoria" e "human in the loop", mas não havia um modelo de ameaça explícito nem um
prompt de sistema com guardrails redigidos para resistir a injeção.

### Decisão

Nenhuma defesa isolada é tratada como suficiente — a spec (seção 8) define 9 defesas
independentes e cumulativas, a maioria estrutural (na aplicação, não no modelo):

1. Resposta bruta do modelo nunca é executada/interpretada — só entra como dado de
   `Zod.parse()`.
2. `AiSuggestedProductSchema` é **`.strict()`**: qualquer chave fora do schema rejeita a
   resposta inteira (falha visível), nunca é descartada em silêncio (`.strip()` implícito do
   Zod, que seria o padrão, foi explicitamente rejeitado aqui por esconder tentativas de
   injeção em vez de expor).
3. O schema estruturalmente **não contém** `sku`/`preco`/`status`/`estoque`/`ecommerce`/
   `venda` — não há campo para uma instrução maliciosa "vazar" para esses valores, mesmo que
   o modelo tente.
4. `categoria_codigo` é revalidado no backend (`assertCategoryActive`, 003) depois da resposta
   — o prompt informar a lista de categorias ativas é só uma redução de ruído, nunca a defesa
   real.
5. **Nenhuma capacidade de function/tool calling é concedida ao modelo** — decisão permanente,
   não uma limitação temporária (também alinhada ao princípio V, sem orquestração de agente
   nesta fase). Mesmo uma injeção bem-sucedida "dentro do modelo" não tem nenhuma ação a
   tomar além de tentar alterar o JSON de saída, que cai nas defesas 2–3.
6. Cada `/analyze` é stateless/turno único — sem contaminação entre requisições.
7. Human in the loop (princípio II) continua como última barreira — nada é persistido sem
   confirmação humana em `/confirm`.
8. Rate limiting (já especificado) limita a velocidade de tentativa e erro.
9. Um **prompt de sistema com guardrails explícitos** (spec, seção 8.3, 7 regras numeradas)
   instrui o modelo a tratar todo conteúdo analisado — texto da descrição e texto/símbolos
   dentro das imagens — como dado, nunca como instrução, e a nunca produzir nada fora do
   schema. É tratada como a defesa **mais fraca** da lista (a única que depende do modelo
   "obedecer"), nunca como a principal.

O mesmo texto do prompt de sistema (spec, seção 8.3) foi replicado como
`DEFAULT_SYSTEM_PROMPT` em `backend/src/plugins/ai/openai-compatible.adapter.ts` — esse
arquivo já existia (construído antecipadamente, ver ADR-002) com uma versão sem guardrails de
injeção; foi atualizado para não deixar um fallback inseguro em código enquanto a spec já
documenta a versão correta.

### Consequências

- `ai-intake.service.ts` (ainda não implementado) tem um contrato de teste mais rígido: mocks
  do adapter retornando campos fora do schema ou categoria inventada precisam ser
  explicitamente testados como rejeitados (tasks.md de 006, T003/T004).
- `.strict()` tem um custo real: qualquer verbosidade extra do modelo (comentário acidental,
  campo a mais por "criatividade" do provedor) vira falha de análise em vez de sucesso
  parcial. Aceito deliberadamente — falhar visivelmente e deixar o operador tentar de novo (ou
  cadastrar manualmente, 005) é preferível a aceitar uma resposta parcialmente fora de
  contrato.
- Qualquer spec futura que envie conteúdo de usuário a um LLM deve replicar esse mesmo
  raciocínio de defesa em profundidade — não é específico de 006, é o padrão do projeto para
  qualquer integração LLM+dado de usuário.
- **Addendum (2026-09-14, mesmo dia)**: revisão apontou que a regra 1 original ("trate texto
  de imagem como dado, nunca como comando") era ambígua o bastante para gerar **falso
  positivo** justamente no caso de uso mais importante de 006 — identificação de marca. Uma
  marca/slogan real que soa como frase imperativa (ex. "Obey", "Just Do It") ficaria em risco
  de ser tratada como tentativa de injeção e suprimida, zerando `marca.nome` sem necessidade.
  Corrigido dividindo a regra original em duas (prompt agora tem 8 regras, não 7): regra 1
  afirma explicitamente que ler etiqueta/marca é o objetivo central da tarefa, com exemplos
  positivos; regra 2 restringe o "não obedecer" só a texto que se dirige explicitamente ao
  sistema de IA (menciona prompt/instruções/JSON/schema/etc.), nunca a texto de produto comum.
  Registrado como critério de aceite específico (spec, seção 8.4, "leitura legítima de
  etiqueta") — não é testável automaticamente (é comportamento de modelo, não regra de
  código), então exige validação manual do prompt contra fotos reais antes de fechar T006.
  Lição geral: todo guardrail de anti-injeção precisa ser revisado contra o caso de uso
  legítimo mais próximo da linguagem que ele bloqueia, não só contra o ataque.

---

## ADR-014 — Dashboard reaproveita `AppLayout` em vez de criar um layout de sidebar paralelo

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [009-dashboard](../specs/009-dashboard/spec.md)

### Contexto

O `plan.md` original de 009 (escrito antes de qualquer frontend existir) previa
`layouts/BackofficeLayout.tsx` com `Sidebar.tsx`/`Header.tsx` dedicados, espelhando o layout
de referência da spec (menu lateral esquerdo). Isso foi escrito antes de
`components/AppLayout.tsx` existir — criado em 002-usuarios como o cabeçalho horizontal usado
por **toda** tela autenticada do app desde então (produtos, categorias, usuários, auditoria),
já com navegação filtrada por `role` e botão de logout.

Ao chegar em 009, implementar o `plan.md` ao pé da letra criaria dois sistemas de layout
paralelos e incompatíveis no mesmo app — um usado por todas as telas existentes (`AppLayout`,
topo) e um novo só para o dashboard (`BackofficeLayout`, lateral) — sem nenhuma necessidade
real, já que `AppLayout` já resolve navegação + permissões + identidade visual.

### Decisão

`DashboardPage` é renderizada dentro do `AppLayout` existente, como qualquer outra página do
app. `AppLayout` ganhou um link "Dashboard" (primeiro item do menu, antes de "Produtos"),
apontando para `/`. Nenhum componente novo de layout/sidebar/header foi criado;
`components/Loading.tsx` também não — o padrão inline já usado em toda página
(`{isLoading && <p>Carregando...</p>}`) foi mantido por consistência.

### Consequências

- O layout de referência da spec 009 (seção 3, menu lateral) fica só ilustrativo — o mesmo já
  acontecia com mockups ASCII de outras specs (ex. 005) que não foram seguidos pixel a pixel.
  Não é necessário atualizar a spec por isso.
- Qualquer spec futura que cogite um novo "layout" deve primeiro verificar se `AppLayout` já
  resolve — criar um layout paralelo só se houver um motivo concreto (ex. uma área
  publicamente acessível sem cabeçalho autenticado), nunca por seguir um `plan.md` escrito
  antes do layout real existir.
- `plan.md`/`tasks.md` de 009 foram atualizados para refletir a estrutura de arquivos real
  (sem `Sidebar.tsx`/`Header.tsx`/`Loading.tsx`/`BackofficeLayout.tsx`).

---

## ADR-015 — Deploy em container único, não Azure App Service + Static Web Apps

**Status:** Aceita
**Data:** 2026-09-14
**Specs afetadas:** [010-deploy](../specs/010-deploy/spec.md)

### Contexto

Uma primeira tentativa de estratégia de deploy (2 commits em cima do MVP completo, chegou a
ser mesclada em `main` e depois revertida) hospedava o backend no Azure App Service e o
frontend no Azure Static Web Apps — dois serviços gerenciados, duas origens diferentes.

Essa tentativa foi revertida a pedido explícito do usuário, que considerou o resultado uma
regressão. Ao investigar o motivo (não um bug pontual, mas uma rejeição da estratégia em si):
frontend e backend em origens diferentes exigem cookies de sessão `SameSite=None; Secure`
para funcionar cross-origin (mais frágeis e mais fáceis de quebrar silenciosamente do que
`SameSite=Lax` same-origin já usado em dev), e o frontend precisava saber a URL absoluta do
backend em tempo de build (`frontend/src/config.ts`), quebrando a simetria com o proxy
relativo (`/api/...`) que já funcionava em dev via Vite. Também prendia a estratégia de deploy
a duas APIs específicas da Azure (App Service + Static Web Apps), quando o pedido explícito do
usuário era por uma abordagem **independente de provedor**, que ainda pudesse rodar na Azure
como uma opção, não como a única.

### Decisão

Empacotar backend e frontend **num único container Docker**, backend servindo o build
estático do frontend (`@fastify/static` + fallback SPA) no mesmo processo/porta — elimina a
origem cruzada inteiramente (mesma origem ⇒ `SameSite=Lax` funciona sem configuração
condicional, `fetch("/api/...")` relativo funciona igual em dev e produção, sem
`config.ts`/URL absoluta). A imagem publicada em GitHub Container Registry (`ghcr.io`, não um
registro específico de nuvem) roda em qualquer host que execute containers — Azure Container
Apps incluído, mas não exclusivo. MongoDB Atlas e Azure Blob Storage continuam exatamente como
estão (ADR-009, ADR-003) — a mudança é só na camada de execução do código, não nos serviços
gerenciados externos, ambos já abstraídos por porta (princípio VI).

Detalhe completo em [spec.md](../specs/010-deploy/spec.md) e [plan.md](../specs/010-deploy/plan.md).

### Consequências

- `main` foi resetado para o commit do MVP completo (`be249a7`) e o branch `azureDeploy` (que
  tinha a tentativa anterior) foi apagado local e remotamente — a decisão de reverter veio
  antes da decisão de qual estratégia usar no lugar; esta ADR documenta a segunda parte.
- Nenhuma mudança nas specs de domínio (001–009) nem nos serviços externos já decididos
  (MongoDB Atlas, Azure Blob Storage, provedor de IA) — só a camada de empacotamento/execução.
- Decisão operacional em aberto, deliberadamente **não** resolvida por esta ADR: qual host
  efetivamente roda a imagem em produção. A imagem é portável por construção; a escolha do
  host é um passo separado, sem exigir mudança de código quando for tomada (spec 010, seção 7).
- Precedente para o projeto: qualquer decisão de infraestrutura que prenda a aplicação a uma
  API específica de um provedor de nuvem (além dos serviços gerenciados já explicitamente
  decididos — Mongo Atlas, Azure Blob) deve ser questionada antes de implementada, não depois.

**Addendum (2026-09-14, mesmo dia)**: o host foi decidido — **Azure Container Apps** (1
Container Apps Environment compartilhado, 3 Container Apps: dev/test/prod), aproveitando os
créditos Azure já usados por Mongo/Blob Storage. A imagem continua desacoplada (roda em
qualquer host Docker); só o *runtime* escolhido para produção deixou de estar em aberto.
Detalhe completo em [spec.md](../specs/010-deploy/spec.md), seção 5 (topologia), e
[plan.md](../specs/010-deploy/plan.md), seção 5.3 (provisionamento).

**Addendum 2 (2026-09-14, mesmo dia)**: refinado por custo — **só produção vai pro Azure
Container Apps**. Dev continua local (`npm run dev`, inalterado) e test passa a rodar local
via `docker compose up` (a mesma imagem que vai pra produção, validada na máquina antes de
qualquer deploy), sem nenhum Container App de dev/test na subscription. Motivo: cada Container
App paga por alocação mínima de recursos mesmo ocioso (0.25 vCPU / 0.5 GiB fixos), e dev/test
já rodavam localmente durante todo o desenvolvimento até aqui — mantê-los assim custa zero
adicional e não perde cobertura de teste, já que a mesma imagem Docker é o artefato validado
nos três lugares (local, test local, produção na nuvem). A topologia de 3 Container Apps
descrita acima fica só como referência histórica, caso um ambiente de teste remoto vire
necessidade real (spec 010, seção 8 "fora de escopo"). Detalhe completo em
[spec.md](../specs/010-deploy/spec.md) e [plan.md](../specs/010-deploy/plan.md) (ambos
reescritos nesta revisão).

**Addendum 3 (2026-09-15)**: primeiro deploy real em produção concluído (T009–T015 de
`tasks.md`) — `rg-vovoisabel`, `cae-vovoisabel`, `ca-vovoisabel-prod` provisionados na
subscription "Microsoft Azure Sponsorship"; pipeline de CI/CD (push em `main` → CI →
build+push pra `ghcr.io` → aprovação manual no Environment `production` → `az containerapp
update`) validado de ponta a ponta, incluindo login funcional contra a URL pública. Duas
descobertas operacionais registradas em `infra/aca/README.md` pra não se repetirem: (1) a
credencial federada OIDC do GitHub Actions precisa do subject exato
`repo:<owner>@<owner_id>/<repo>@<repo_id>:environment:<nome>` — não `ref:refs/heads/main` (isso
só vale pra jobs sem `environment:` no workflow) e, nesta conta, com os IDs numéricos imutáveis
do GitHub, não só os nomes; usar o subject errado falha com `AADSTS700213`. (2) O Atlas de
produção rejeitava a conexão do Container App na camada TLS até liberar, no Network Access do
projeto, o IP estático do Container Apps Environment (`az containerapp env show --query
properties.staticIp`) — mantido como IP único (não `0.0.0.0/0`) a pedido explícito do usuário,
por segurança, mesmo sem a Azure garantir formalmente esse IP como o de saída no plano
Consumption sem VNET dedicada.

---

<!--
Ao registrar uma nova ADR, copiar o bloco de convenção acima, numerar sequencialmente
(ADR-016, ADR-017, ...) e atualizar constitution.md se a decisão alterar a stack fixada na
seção 2.
-->

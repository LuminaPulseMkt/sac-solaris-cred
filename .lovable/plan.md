## Integração Evolution API → SAC (paralelo ao n8n)

Implementar recebimento direto da Evolution API no SAC via webhook próprio por operador, sem tocar no n8n. Substitui a tela mockada `/integracao` atual por uma gestão real de operadores monitorados, persistindo conversas/mensagens em Supabase com Realtime.

---

### 1. Banco (migração Supabase)

Criar tabelas no schema `public` (com GRANTs + RLS):
- **`operators`** — `id`, `name`, `instance_name`, `channel`, `description`, `token` (uuid sem hífens, único), `webhook_url`, `status` (pending/active/inactive/error), `last_received_at`, `messages_today`, timestamps.
- **`conversations`** — vinculada a `operators`, com `remote_jid`, `lead_phone`, `lead_name`, `instance_name`, `status`, `converted`, `score_sac`, `avg_response_time_s`, `total_messages`, unique(`operator_id`,`remote_jid`).
- **`messages`** — vinculada à conversa/operador, com `from_role`, `message_text`, `message_type`, `sent_at`, `response_time_s`, `lead_name`, `lead_phone`, `raw_payload jsonb`.
- **`webhook_logs`** — auditoria dos POSTs recebidos.

GRANTs: `service_role` total em todas (o endpoint público escreve via admin client). `authenticated` com SELECT/INSERT/UPDATE/DELETE em `operators`, e SELECT em `conversations`/`messages`/`webhook_logs` para o painel.

RLS habilitada em todas. Como ainda não há auth no app, políticas iniciais permissivas para `authenticated` (refinar depois). O endpoint público usa service role e bypassa RLS.

Função `public.has_role` não é necessária nesta fase. Realtime ligado em `messages` e `conversations`.

### 2. Endpoint público `POST /api/public/webhook/recv/$token`

Arquivo: `src/routes/api/public/webhook/recv/$token.ts` (server route).
- Carrega `supabaseAdmin` dentro do handler.
- Valida token + `instance` cruzados em `operators`.
- Ignora silenciosamente eventos ≠ `messages.upsert` e mensagens de grupo (`@g.us`).
- Extrai campos conforme tabela de mapeamento do spec, detecta `message_type`.
- Upsert em `conversations` (onConflict `operator_id,remote_jid`).
- Calcula `response_time_s` (delta da última msg do lado oposto).
- Insert em `messages`. Atualiza `last_received_at`/`messages_today` em `operators`. Grava em `webhook_logs`.
- Limites: payload ≤ 2MB, rate-limit fica fora do MVP (Workers não tem primitiva — adicionar nota).
- Retorna `{ received: true, conversation_id, response_time_s }`.

### 3. Server functions (`src/lib/operators.functions.ts`)

Sem auth nesta fase (operações públicas no MVP — alinhado ao app atual sem login):
- `listOperators`, `createOperator` (gera token, monta `webhook_url` com `VITE_PUBLIC_APP_URL` ou origem da request), `updateOperator`, `regenerateToken`, `deactivateOperator`.
- `listWebhookLogs(operatorId?)`.
- `testWebhook(operatorId)` — faz fetch interno ao próprio endpoint com payload simulado e retorna status/tempo.

### 4. Tela `/integracao` reformulada

Três abas (Tabs do shadcn):
- **Operadores monitorados** — tabela com avatar+nome, instância, badge de status colorido, última mensagem, mensagens hoje, ações (copiar URL, testar, ver logs, editar, ativar/desativar, regenerar token).
- **Cadastrar operador** — formulário (nome, instância, canal, descrição, status). Ao salvar, exibe card com URL gerada + botões Copiar/Testar + instruções inline (painel Evolution e curl).
- **Logs** — tabela de `webhook_logs` com modal de payload bruto.

Componente de estado visual do operador conforme tabela do spec (Aguardando/Ativo/Sem dados 48h/Erro/Inativo).

### 5. Tela `/conversas/:id` — visualização em chat

Atualizar (ou criar) rota dinâmica usando dados do Supabase:
- Cabeçalho com lead, telefone, instância, operador, score SAC, duração.
- Bolhas: operador à direita (âmbar claro), lead à esquerda (cinza). Hora em cada mensagem.
- Badge de tempo de resposta entre pares (verde ≤2min, âmbar 2–5min, vermelho >5min).
- Ícone por `message_type ≠ 'text'`.
- Realtime: assina `messages` filtrado por `conversation_id` dentro de `useEffect` com cleanup.

### 6. Score SAC

`src/lib/sac/score.ts` — adicionar/ajustar `calcularScoreSAC(conversation)` conforme fórmula 40/35/25 do spec. Recalcular ao inserir mensagem (server route) e gravar em `conversations.score_sac` + `avg_response_time_s`.

### 7. Dashboard

Substituir mocks por leitura real (server fn → Supabase) das tabelas novas, mantendo o layout atual. Realtime opcional no `/dashboard` para `last_received_at` dos operadores.

---

### Detalhes técnicos

- **Stack**: TanStack Start + Supabase já conectado. Endpoint público sob `/api/public/*` (bypassa auth do site publicado).
- **Service role**: `supabaseAdmin` importado dentro do handler do server route (regra do import graph).
- **Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE …` na migração.
- **URL do webhook**: derivada do header `Host` da request no momento do cadastro, ou env `VITE_PUBLIC_APP_URL`. URL estável do Lovable: `project--0e69e672-f73b-4ea1-9583-6e2b8f56fa37.lovable.app`.
- **Segurança**: token uuid v4 sem hífens; validação cruzada token+instance; log de tentativas inválidas; `@g.us` ignorado; eventos ≠ `messages.upsert` retornam 200 silencioso.
- **Sem auth ainda**: o app não tem login. As server fns de gestão ficam públicas no MVP. Recomendo habilitar Supabase Auth + gate `_authenticated/` numa etapa seguinte — fora do escopo deste plano.
- **Mocks descontinuados**: `src/mocks/webhook-config.ts` deixa de ser usado pela `/integracao` (mantido para não quebrar outros imports até remoção final).

### Fora de escopo deste plano

- Autenticação de usuários do painel.
- Rate-limit verdadeiro (Workers sem KV/Durable Objects configurados).
- Edição/envio de mensagens de volta para o WhatsApp.
- Migração das tabelas legadas (`n8n_chat_histories`, `n8n_historico_mensagens`, `secretaria`) — ficam intactas.

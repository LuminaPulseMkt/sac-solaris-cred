
# Plano — Solaris Analytics Chat (SAC)

Construir o painel SAC em TanStack Start + Tailwind v4 + shadcn/ui, com todas as 7 rotas, navegação, design system âmbar/dourado e dados mockados realistas. Tudo em português, sentence case, com suporte a tema claro/escuro.

## Escopo desta entrega (MVP frontend)

Rotas e telas completas com dados mock:
- `/` → redireciona para `/dashboard`
- `/dashboard` — KPIs, gráfico de tempo de resposta por hora (linha + meta), painel de alertas, tabela de conversas, gráfico combinado barras+linha por colaborador
- `/conversas` — tabela paginada, filtros (canal, score, período, colaborador), modal de detalhe com transcrição, timeline, breakdown de score e sugestões de IA (mock)
- `/colaboradores` — cards de desempenho, ranking semanal, histórico em linha
- `/alertas` — lista por severidade, configuração de regras (form mock)
- `/relatorios` — filtros de período/colaborador/canal, seções de resumo, botões de exportar PDF/CSV (CSV real via blob, PDF placeholder)
- `/integracao` — status conexão n8n (mock), form de webhook URL, mapeamento de campos, log de sincronizações, documentação do payload JSON
- `/configuracoes` — metas SLA por canal, score mínimo, gestão de colaboradores (CRUD local), notificações, toggle tema claro/escuro

## Design system

- Tokens em `src/styles.css` (oklch): brand âmbar `#BA7517` / `#EF9F27` / `#FAEEDA`, semânticos success/warning/danger/info, surfaces neutras
- Tipografia Inter via Google Fonts no `__root.tsx`
- Bordas 0.5px (`border-[0.5px]`), radius médio, sem sombras pesadas, sem gradientes
- Suporte dark mode via classe `.dark` no `<html>` (toggle persistido em localStorage via Zustand)
- Favicon SVG com sol + "SAC"

## Componentes reutilizáveis (`src/components/`)

- `AppSidebar` — logo sol + "Solaris Analytics Chat" + badge SAC, grupos de navegação, item ativo âmbar, badges de contagem
- `AppHeader` — título da rota, indicador "n8n ativo" pulsante, botões de ação contextuais, toggle de tema
- `MetricCard`, `StatusTag`, `ScoreBar`, `CollaboratorAvatar`, `AlertItem`, `ChannelBadge`
- `ConversationDetailDialog` (modal de transcrição/timeline/score)
- Charts em Recharts: `ResponseTimeChart`, `CollaboratorPerformanceChart`, `CollaboratorHistoryChart`

## Dados e estado

- Mocks em `src/mocks/`: `conversations.ts`, `collaborators.ts`, `alerts.ts`, `metrics.ts`, `webhookConfig.ts`, `syncLogs.ts`
- Tipos em `src/types/`: `Conversation`, `Collaborator`, `Alert`, `Metric`, `WebhookConfig`, `Channel`, `Status`
- Zustand stores: `useFiltersStore`, `useSettingsStore` (tema, metas SLA, score mínimo), `useCollaboratorsStore` (CRUD local)
- TanStack Query já incluso — usado para envolver "fetches" mock (Promise.resolve) preparando integração futura
- Utilitário `calculateSacScore(conversation)` implementando a fórmula (40% tempo, 35% resolução, 25% conversão) com a tabela de notas de tempo

## Roteamento (TanStack Start)

Arquivos em `src/routes/`:
- `__root.tsx` — atualizado para incluir Inter, favicon SAC, layout shell com `AppSidebar` + `AppHeader` + `<Outlet />`, providers (theme)
- `index.tsx` — redirect para `/dashboard`
- `dashboard.tsx`, `conversas.tsx`, `colaboradores.tsx`, `alertas.tsx`, `relatorios.tsx`, `integracao.tsx`, `configuracoes.tsx`
- Cada rota com `head()` próprio: title, description, og:title, og:description em PT-BR

## Fora de escopo nesta entrega

- **Endpoint real `POST /api/webhook/n8n`**: o Lovable Cloud está desativado e o webhook precisa de persistência (banco) para ser útil. A tela `/integracao` mostra a URL pública esperada, documentação do payload e logs mockados. Quando você habilitar o Lovable Cloud, posso adicionar a tabela `conversations`, um server route público em `src/routes/api/public/webhook/n8n.ts` com validação Zod, RLS, e cálculo automático do score.
- Envio real de e-mail / agendamento de relatórios — UI presente, ação mock
- Geração de PDF — botão presente, exporta CSV real; PDF fica como TODO

## Detalhes técnicos

- `src/styles.css`: adicionar tokens `--brand`, `--brand-foreground`, `--surface`, `--success`, `--warning`, `--danger`, `--info` (oklch) + mapeá-los em `@theme inline`
- `AppSidebar` colapsável em telas < lg; layout principal `grid grid-cols-[260px_1fr]` em desktop, drawer em mobile
- Modal de conversa usa `Dialog` do shadcn; timeline em lista vertical com bullets coloridos por origem
- Tabelas usam shadcn `Table` + paginação client-side; filtros derivam estado do Zustand
- Toggle de tema aplica/remove `.dark` no `documentElement` em efeito de hidratação

## Estrutura de arquivos nova

```text
src/
  components/
    app-sidebar.tsx, app-header.tsx, metric-card.tsx, score-bar.tsx,
    status-tag.tsx, channel-badge.tsx, collaborator-avatar.tsx,
    alert-item.tsx, conversation-detail-dialog.tsx,
    charts/{response-time,collaborator-performance,collaborator-history}.tsx
  mocks/{conversations,collaborators,alerts,metrics,webhook-config,sync-logs}.ts
  types/sac.ts
  stores/{filters,settings,collaborators}.ts
  lib/sac/{score.ts,format.ts}
  routes/{index,dashboard,conversas,colaboradores,alertas,relatorios,integracao,configuracoes}.tsx
  routes/__root.tsx (atualizado)
  styles.css (tokens novos)
```

Confirmando o plano, implemento tudo de uma vez e em seguida você pode habilitar o Lovable Cloud para conectarmos o webhook n8n de verdade.

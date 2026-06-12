## Problema

Hoje o botão "Testar webhook" chama o server function `testWebhook`, que monta a URL absoluta do webhook (`https://.../api/public/webhook/recv/:token`) e faz `fetch` a partir do runtime do servidor. No preview do Lovable, essa chamada sai como tráfego externo e bate em uma proteção da borda (Cloudflare), retornando "error code: 1003".

## Correção

Mover o disparo do teste para o **navegador**, usando uma URL **relativa** (`/api/public/webhook/recv/${token}`). Assim a requisição fica na mesma origem do preview/produção e não passa por roteamento externo.

### Mudanças

1. `src/routes/integracao.tsx`
   - No handler do botão "Testar webhook", em vez de chamar o server function `testWebhook`, fazer direto no cliente:
     - Montar `const url = \`/api/public/webhook/recv/${operator.token}\``
     - `fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(samplePayload) })`
     - Medir `elapsed_ms`, capturar `status` e `await res.text()`
     - Alimentar o mesmo dialog/toast de resultado que já existe (status, tempo, payload enviado, resposta recebida)
   - O `samplePayload` (mesmo formato atual: `event: "messages.upsert"`, `instance`, `data.key`, `pushName`, `message.conversation`, `messageTimestamp`) passa a ser montado no cliente a partir do operador selecionado.

2. `src/lib/operators.functions.ts`
   - Remover (ou deixar de exportar/usar) o server function `testWebhook`, já que o teste deixa de existir no servidor. As demais funções (`listOperators`, `createOperator`, `updateOperator`, `regenerateToken`, `deleteOperator`, `listWebhookLogs`) permanecem inalteradas, incluindo o `buildWebhookUrl` usado na criação e regeneração de token.

### Por que funciona

- URL relativa → o navegador resolve para o mesmo host do preview/produção → a requisição cai no próprio handler `src/routes/api/public/webhook/recv/$token.ts`, sem sair pela borda externa.
- Mesma rota é exercitada de verdade (insere `webhook_logs`, atualiza `conversations`/`messages`), então o teste continua sendo um teste ponta a ponta.
- Em produção o comportamento é idêntico, já que continua sendo same-origin.

### Fora do escopo

- Não alterar o handler do webhook (`$token.ts`), nem RLS, nem schema.
- Não mexer em outras telas/funcionalidades.

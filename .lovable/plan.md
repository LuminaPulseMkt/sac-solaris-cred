### Alterar gráfico "Conversão e score por colaborador" para cores distintas por colaborador

**Objetivo:**
No dashboard, o gráfico "Conversão e score por colaborador — semana" (componente `CollaboratorPerformanceChart`) atualmente exibe todas as barras de conversão na mesma cor âmbar (`--color-brand`). O usuário deseja que cada colaborador (nome) tenha uma cor diferente, facilitando a distinção visual.

**Mudança proposta:**
1. Importar `Cell` do `recharts`.
2. Definir uma paleta de 6 cores do design system (usando `var(--color-chart-1)` a `var(--color-chart-5)`, `var(--color-brand)`, `var(--color-success)`, etc.).
3. Dentro do `<Bar>`, mapear cada item de `collaboratorWeekly` para um `<Cell>` com cor correspondente ao índice do colaborador.
4. Manter a linha de "Score SAC" e o restante do layout intacto.

**Arquivo afetado:**
- `src/components/charts/collaborator-performance-chart.tsx`

**Resultado esperado:**
Cada barra vertical no gráfico terá uma cor distinta, cíclica entre a paleta definida.
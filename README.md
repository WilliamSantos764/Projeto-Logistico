# Sistema de Gestão & Fluxo de Veículos (Com Importação Excel)

Este arquivo ZIP contém o sistema completo com a funcionalidade de **Importação de Planilha Excel / CSV** integrada.

## 📥 Como Funciona a Importação de Planilha:

1. No topo da página (cabeçalho), clique no botão verde **"📥 Importar Planilha (Excel/CSV)"**.
2. Selecione qualquer arquivo `.xlsx`, `.xls` ou `.csv` do seu computador.
3. O sistema reconhece automaticamente colunas como:
   - **Descrição / Veículo**
   - **Categoria / Tipo** (ex: `SPOT - Usado`, `Frota Própria`)
   - **Valor Unitário / Valor**
   - **Parcelas / Qtd Parcelas**
   - **Data**
4. Os dados serão importados imediatamente para o seu fluxo e os **cards indicadores do Dashboard serão recalculados na hora**!

---

## 🚀 Todas as Funcionalidades Incluídas:

1. **📥 Importação de Planilhas Excel (.xlsx / .csv)** via biblioteca SheetJS.
2. **📊 Indicadores Clicáveis:** Clicar nos cards (SPOT Usados, Frota Própria, etc.) filtra a tabela instantaneamente.
3. **📋 Aba Fluxo:** Exibe valor unitário, parcelas e valor total acumulado.
4. **💡 Autocomplete de Categorias:** Sugestões ao cadastrar.
5. **💲 Formatação de Moeda em Tempo Real (R$).**
6. **⚠️ Modal de Confirmação de Exclusão.**
7. **💾 Persistência Offline:** Os dados ficam gravados no navegador (LocalStorage).

# Sistema de Gestão & Fluxo de Veículos

Este pacote ZIP contém a aplicação completa e atualizada do **Sistema de Gestão & Fluxo de Veículos**, pronta para uso em qualquer navegador web.

## 🚀 Funcionalidades Implementadas

1. **Indicadores Clicáveis (Interatividade com o Fluxo):**
   - Ao clicar em **qualquer card de indicador** (ex: *Veículos SPOT Usados*, *Frota Própria*, *Terceiros Fixos* ou *Total*), o sistema redireciona o usuário diretamente para a aba Fluxo.
   - A tabela é **filtrada instantaneamente** exibindo apenas os veículos daquele indicador.
   - A página faz um **scroll suave** para focar a tabela no indicador selecionado.
   - O indicador ativo recebe um destaque de borda e sombra azul.

2. **Detalhamento no Fluxo:**
   - Exibição de **Valor Unitário**, **Quantidade de Parcelas** e **Valor Total Cadastrado** para cada item.

3. **Autocomplete / Sugestões de Categoria:**
   - Campo de entrada com datalist inteligente para autopreenchimento rápido de categorias.

4. **Formatação de Moeda (R$) em Tempo Real:**
   - Input de valor com máscara dinâmica que formata o valor enquanto digita.

5. **Confirmação de Exclusão:**
   - Modal com alerta de confirmação para evitar perdas acidentais de dados.

6. **Persistência Offline (LocalStorage):**
   - Funciona completamente sem internet e memoriza seus cadastros no navegador.

---

## 💻 Como Executar

1. Extraia o conteúdo deste arquivo `.zip`.
2. Dê um duplo clique no arquivo `index.html` para abrir diretamente no Chrome, Edge ou Firefox.

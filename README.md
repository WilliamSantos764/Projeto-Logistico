# Frota Insight — Painel completo de operação

Projeto estático em HTML, CSS e JavaScript para analisar planilhas diárias de logística e consolidar a utilização de toda a frota.

## Como usar

1. Abra a pasta no VS Code.
2. Abra `index.html` no navegador ou use a extensão **Live Server**.
3. Clique em **Selecionar arquivos** ou **Selecionar uma pasta**.
4. Escolha arquivos Excel (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`) ou CSV.

Também é possível arrastar os arquivos diretamente para o painel. Todos os cálculos acontecem localmente no navegador; nenhum dado é enviado para um servidor.

Cada nova seleção de arquivos substitui integralmente a importação anterior. Os registros antigos são removidos, enquanto os valores por utilização cadastrados para cada tipo de frota permanecem salvos no navegador.

## O que o sistema identifica

O app procura, dentro de cada aba, as seções **COOPERRITA / carros da casa**, **TERCEIROS FIXOS** (inclusive planilhas antigas com o título “TERCEIROS”) e **SPOT**. Ele localiza o cabeçalho mesmo quando muda de linha ou tem colunas extras. São identificados os campos de Placa, Motorista, Telefone, Embarque, Cidades/Rota e Pernoite.

Uma utilização é contabilizada quando há uma placa de veículo e também uma rota/cidade real ou um embarque. Linhas vazias e `CONTINUAÇÃO DE ESCALA` não entram como utilização. As seções `FOLGA`, `FÉRIAS`, `ATESTADO` e `FALTA` são lidas separadamente como disponibilidade da equipe.

## Relatórios disponíveis

- Total de veículos-dia em rota e utilizações por tipo de frota
- Carros da casa, terceiros fixos e SPOTs em indicadores separados
- Folgas, férias, atestados e faltas por funcionário
- Pernoites, uso diário por categoria e ranking de veículos
- Tabelas detalhadas com filtros e exportação de relatório completo em CSV
- Auditoria das abas processadas e de suas seções operacionais
- Cadastro de valor por utilização para carros da casa, terceiros fixos e SPOT
- Cálculo automático: valor por uso × quantidade utilizada = gasto total
- Indicadores clicáveis com uma aba interna contendo somente os registros daquele indicador

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub e envie todos os arquivos desta pasta.
2. Em **Settings > Pages**, selecione a branch `main` e a pasta `/ (root)`.
3. Salve. O GitHub irá disponibilizar um endereço para o sistema.

> O projeto usa SheetJS por CDN para ler Excel no navegador. Por isso, a primeira leitura de uma planilha requer acesso à internet.

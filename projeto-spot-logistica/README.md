# SPOT Insight — Painel de utilização de SPOT

Projeto estático em HTML, CSS e JavaScript para analisar planilhas diárias de logística e consolidar a utilização de veículos SPOT.

## Como usar

1. Abra a pasta no VS Code.
2. Abra `index.html` no navegador ou use a extensão **Live Server**.
3. Clique em **Selecionar arquivos** ou **Selecionar uma pasta**.
4. Escolha arquivos Excel (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`) ou CSV.

Também é possível arrastar os arquivos diretamente para o painel. Todos os cálculos acontecem localmente no navegador; nenhum dado é enviado para um servidor.

## O que o sistema identifica

O app procura, dentro de cada aba, uma seção chamada **SPOT** e localiza automaticamente o cabeçalho da tabela, mesmo que ele mude de linha ou que existam colunas extras. São identificados os campos de Placa, Motorista, Telefone, Embarque e Cidades/Rota.

Uma utilização é contabilizada quando há uma placa de veículo SPOT e também uma rota/cidade real ou um embarque. Linhas vazias, `CONTINUAÇÃO DE ESCALA`, `FOLGA`, `FÉRIAS` e `ATESTADO` não entram como utilização.

## Relatórios disponíveis

- Total de utilizações SPOT (veículo-dia/registro)
- Veículos SPOT únicos
- Dias com uso de SPOT
- Quantidade de embarques informados
- Uso por dia e ranking de veículos
- Tabela detalhada com filtros e exportação em CSV
- Auditoria das abas processadas, incluindo avisos de abas sem a seção SPOT

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub e envie todos os arquivos desta pasta.
2. Em **Settings > Pages**, selecione a branch `main` e a pasta `/ (root)`.
3. Salve. O GitHub irá disponibilizar um endereço para o sistema.

> O projeto usa SheetJS por CDN para ler Excel no navegador. Por isso, a primeira leitura de uma planilha requer acesso à internet.

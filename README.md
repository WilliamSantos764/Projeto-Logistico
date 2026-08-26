# Frota Insight — Painel completo de operação

Projeto estático em HTML, CSS e JavaScript para analisar planilhas diárias de logística e consolidar a utilização de toda a frota.

## Como usar

1. Abra a pasta no VS Code.
2. Abra `index.html` no navegador ou use a extensão **Live Server**.
3. Clique em **Selecionar arquivos** ou **Selecionar uma pasta**.
4. Escolha arquivos Excel (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`) ou CSV.

Também é possível arrastar os arquivos diretamente para o painel. Todos os cálculos acontecem localmente no navegador; nenhum dado é enviado para um servidor.

Cada nova seleção de arquivos substitui integralmente a importação anterior. Os registros antigos são removidos, enquanto os valores padrão por categoria e os ajustes individuais por utilização permanecem salvos no navegador quando a mesma linha é importada novamente.

## Importar a base de valores dos embarques

1. Na seção **Base de valores dos embarques**, clique em **Selecionar base de valores**.
2. Escolha o arquivo Excel que contém as bases mensais.
3. O sistema identifica as abas mensais completas e pergunta **Quais abas você quer importar?**.
4. Marque uma ou várias abas e clique em **Importar abas selecionadas**.
5. Importe também a planilha operacional do mesmo mês na seção **Importar planilhas**.

As abas selecionadas são consolidadas em uma única base. Uma nova escolha substitui apenas a base de valores anterior e não modifica as planilhas de rotas, os indicadores ou os valores manuais já existentes no painel.

No arquivo de referência foram reconhecidas as bases de janeiro a julho. O detector procura os cabeçalhos `EMBARQUE`, `DATA SAIDA` e `TOTAL FATURAMENTO`, separando as bases mensais das abas auxiliares, painéis e bases de despesas. Depois, localiza dinamicamente `CUSTO ROTA`, `ROTA`, `RETORNO ROTA`, `LEAD TIME DA ROTA`, `KM ROTA` e os demais campos, mesmo quando mudam de coluna.

Nas abas mensais atuais da planilha **Custo - Copia**, a data exata de saída é lida da coluna B e a data de retorno da coluna R. O sistema continua conferindo os nomes dos cabeçalhos para aceitar abas antigas em que essas colunas estejam deslocadas. O mês e o ano exibidos vêm da data de saída da própria base financeira, e a duração é calculada prioritariamente pela diferença entre saída e retorno; `LEAD TIME DA ROTA` é usado somente quando uma dessas datas não está disponível.

O vínculo entre as planilhas é feito pelo número do embarque. Para evitar totais incorretos, um embarque repetido na mesma aba ou entre várias abas financeiras é considerado apenas uma vez e fica sinalizado. O sistema preserva o registro mais completo. A conferência também separa embarques **cruzados**, **sem custo** e **sem rota**. Se as planilhas forem de meses diferentes, o painel informa que nenhuma correspondência foi encontrada em vez de misturar os valores.

## O que o sistema identifica

O app procura, dentro de cada aba, as seções **COOPERRITA / carros da casa**, **TERCEIROS FIXOS** (inclusive planilhas antigas com o título “TERCEIROS”) e **SPOT**. Ele localiza o cabeçalho mesmo quando muda de linha ou tem colunas extras. São identificados os campos de Placa, Motorista, Telefone, Embarque, Cidades/Rota e Pernoite.

Na classificação dos veículos externos, somente **RS 1, RS 2, RS 3, Cart Smart 1, Cart Smart 2 e Cart Smart 3** são considerados terceiros fixos. RS 4 em diante, Cart Smart 4 em diante e os demais externos são classificados como SPOT, mesmo quando aparecem dentro de uma seção genérica de terceiros.

Uma utilização é contabilizada quando há uma placa de veículo e também uma rota/cidade real ou um embarque. Linhas vazias e `CONTINUAÇÃO DE ESCALA` não entram como utilização. As seções `FOLGA`, `FÉRIAS`, `ATESTADO` e `FALTA` são lidas separadamente como disponibilidade da equipe.

## Relatórios disponíveis

- Total de veículos-dia em rota e utilizações por tipo de frota
- Carros da casa, terceiros fixos e SPOTs em indicadores separados
- Folgas, férias, atestados e faltas por funcionário
- Pernoites, uso diário por categoria e ranking de veículos
- Tabelas detalhadas com filtros e exportação de relatório completo em CSV
- Auditoria das abas processadas e de suas seções operacionais
- Valores por utilização editáveis separadamente para carros da casa, terceiros fixos e SPOT
- Valor individual por utilização, selecionando categoria, placa, data e rota exatas
- Cálculo automático usando o valor individual somente na linha escolhida e o valor padrão em todas as demais utilizações, inclusive da mesma placa
- Indicadores clicáveis com uma tela interna fixa contendo somente os registros daquele indicador
- Cabeçalho do detalhamento sempre visível e rolagem restrita à tabela de dados
- Rankings de funcionários com mais atestados, folgas e férias
- Rankings dos veículos mais usados separados por carros da casa, terceiros fixos e SPOT
- Gráfico diário responsivo com rolagem interna, sem ultrapassar a largura da tela
- Importador separado para a base de valores dos embarques
- Detecção automática das abas mensais completas, com seleção de uma ou várias abas antes da importação
- Consolidação das abas financeiras sem duplicar o custo de um embarque repetido
- Cruzamento automático entre a planilha operacional e a base financeira pelo número do embarque
- Total de faturamento, custo da rota, lucro, margem e custo médio somente dos embarques encontrados nas duas bases
- Lucro calculado como `TOTAL FATURAMENTO - CUSTO ROTA`
- Resultado exclusivo dos SPOTs com faturamento, custo, lucro ou prejuízo, margem e quantidade de embarques negativos
- Detalhamento clicável dos SPOTs, ordenando primeiro os embarques que deram maior prejuízo
- Top 3 para bonificação separado entre carros da casa e terceiros fixos, usando como critério o menor custo médio por embarque
- Top 3 geral de motoristas da casa e terceiros fixos em rotas próximas (até 150 km), combinando menor custo por km com menor tempo entre a saída e o retorno
- Top 3 geral de motoristas da casa e terceiros fixos em rotas longas (acima de 150 km), usando a mesma comparação de custo e velocidade de retorno
- Selo de qualidade por motorista: `Padrão consistente`, `Em observação`, `Fora do padrão` ou `Amostra inicial`, calculado pela proporção de viagens dentro das referências de custo por km e duração do próprio período
- Rankings de qualidade clicáveis, com as datas exatas de saída e retorno e somente as viagens que formaram a avaliação
- Ranking clicável de motoristas com menor desempenho, somando faltas, atestados, rotas de até 150 km que passaram de um dia, custo por km acima de 25% da mediana da mesma frota e embarques com prejuízo
- Pontuação visível e auditável: falta `+5`, atestado `+3`, rota curta demorada `+3`, custo por km elevado `+2` e prejuízo `+2`
- Tela fixa com todas as ocorrências que formaram a pontuação; o indicador exige revisão humana antes de qualquer decisão
- Ranking das viagens mais demoradas usando prioritariamente a diferença entre a data de saída e a data de retorno e, quando necessário, `LEAD TIME DA ROTA`
- Tabela completa com busca e filtros para embarques cruzados, sem custo e sem rota
- Detalhamento financeiro em tela fixa, com cabeçalho visível e rolagem somente dentro dos dados
- Exportação dos dados financeiros cruzados junto do relatório CSV completo, com saída e retorno em colunas separadas

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub e envie todos os arquivos desta pasta.
2. Em **Settings > Pages**, selecione a branch `main` e a pasta `/ (root)`.
3. Salve. O GitHub irá disponibilizar um endereço para o sistema.

> O projeto usa SheetJS por CDN para ler Excel no navegador. Por isso, a primeira leitura de uma planilha requer acesso à internet.

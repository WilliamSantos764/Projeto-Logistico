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

No arquivo de referência foram reconhecidas as bases de janeiro a julho. O detector procura os cabeçalhos `EMBARQUE`, `DATA SAIDA` e `TOTAL FATURAMENTO`, separando as bases mensais das abas auxiliares, painéis e bases de despesas. Depois, localiza dinamicamente `R$/TON`, `CUSTO ROTA`, `ROTA`, `RETORNO ROTA`, `LEAD TIME DA ROTA`, `KM ROTA` e os demais campos, mesmo quando mudam de coluna. Se o texto do cabeçalho `R$/TON` não estiver legível, a coluna AF é usada como posição de segurança.

Nas abas mensais atuais da planilha **Custo - Copia**, a data exata de saída é lida da coluna B e a data de retorno da coluna R. O sistema continua conferindo os nomes dos cabeçalhos para aceitar abas antigas em que essas colunas estejam deslocadas. O mês e o ano exibidos vêm da data de saída da própria base financeira, e a duração é calculada prioritariamente pela diferença entre saída e retorno; `LEAD TIME DA ROTA` é usado somente quando uma dessas datas não está disponível.

Na validação da planilha **Custo - Copia(1)**, os embarques mensais com dados completos obedeceram à fórmula `R$/TON = CUSTO ROTA ÷ TOTAL TONS × 1.000`, sem divergência. A análise também confirmou que distância e peso transportado afetam fortemente o indicador. A origem oficial foi fixada no ponto da Cooperrita na BR, nas coordenadas **-22.261541, -45.764269**. As 104 cidades encontradas nas sete bases mensais receberam uma referência rodoviária desde esse ponto. A classificação usa a distância de ida e volta até o município, enquanto `KM ROTA` continua representando o percurso efetivamente lançado na planilha. Assim, Pouso Alegre fica em aproximadamente 22 km de ida e permanece muito próxima; Belo Horizonte fica em aproximadamente 400 km de ida e permanece longa mesmo quando o KM lançado estiver incorreto.

Os centros municipais usados nas referências vêm da base aberta [Municípios Brasileiros](https://github.com/kelvins/municipios-brasileiros), e as distâncias rodoviárias foram calculadas com o motor [OSRM](https://project-osrm.org/docs/v5.24.0/api/) sobre a malha do OpenStreetMap. Esses valores servem para proximidade e comparação; o percurso realmente feito continua sendo o `KM ROTA` da planilha.

O vínculo entre as planilhas é feito pelo número do embarque. Para evitar totais incorretos, um embarque repetido na mesma aba ou entre várias abas financeiras é considerado apenas uma vez e fica sinalizado. O sistema preserva o registro mais completo. A conferência também separa embarques **cruzados**, **sem custo** e **sem rota**. Se as planilhas forem de meses diferentes, o painel informa que nenhuma correspondência foi encontrada em vez de misturar os valores.

## O que o sistema identifica

O app procura, dentro de cada aba, as seções **COOPERRITA / carros da casa**, **TERCEIROS FIXOS** (inclusive planilhas antigas com o título “TERCEIROS”) e **SPOT**. Ele localiza o cabeçalho mesmo quando muda de linha ou tem colunas extras. São identificados os campos de Placa, Motorista, Telefone, Embarque, Cidades/Rota e Pernoite.

Na classificação dos veículos externos, somente **RS 1, RS 2, RS 3, Cart Smart 1, Cart Smart 2 e Cart Smart 3** são considerados terceiros fixos. RS 4 em diante, Cart Smart 4 em diante e os demais externos são classificados como SPOT, mesmo quando aparecem dentro de uma seção genérica de terceiros.

Uma utilização é contabilizada quando há uma placa de veículo e também uma rota/cidade real ou um embarque. Linhas vazias e `CONTINUAÇÃO DE ESCALA` não entram como utilização. As seções `FOLGA`, `FÉRIAS`, `ATESTADO` e `FALTA` são lidas separadamente como disponibilidade da equipe.

## Relatórios disponíveis

- Navegação organizada em seis abas: **Visão geral**, **Custos da frota**, **R$/ton e rotas**, **Motoristas**, **Melhorias** e **Relatórios**
- Barra de abas fixa durante a rolagem, com navegação horizontal em telas pequenas e suporte às setas do teclado
- Somente a área escolhida permanece visível; ao fechar um detalhamento, o app retorna à mesma aba e à posição exata anterior
- Total de veículos-dia em rota e utilizações por tipo de frota
- Carros da casa, terceiros fixos e SPOTs em indicadores separados
- Folgas, férias, atestados e faltas por funcionário
- Pernoites, uso diário por categoria e ranking de veículos
- Tabelas detalhadas com filtros e exportação de relatório completo em CSV
- Auditoria das abas processadas e de suas seções operacionais
- Valores por utilização editáveis separadamente para carros da casa, terceiros fixos e SPOT
- Valor individual por utilização, selecionando categoria, placa, data e rota exatas
- Cálculo automático usando o valor individual somente na linha escolhida e o valor padrão em todas as demais utilizações, inclusive da mesma placa
- Indicadores clicáveis com uma tela interna fixa contendo somente os registros daquele indicador; ao voltar, o painel retorna à posição exata em que estava
- Cabeçalho do detalhamento sempre visível e rolagem restrita à tabela de dados
- Rankings de funcionários com mais atestados, folgas e férias
- Rankings dos veículos mais usados separados por carros da casa, terceiros fixos e SPOT
- Gráfico diário responsivo e clicável: cada barra abre somente as utilizações daquele dia, sem ultrapassar a largura da tela
- Importador separado para a base de valores dos embarques
- Detecção automática das abas mensais completas, com seleção de uma ou várias abas antes da importação
- Consolidação das abas financeiras sem duplicar o custo de um embarque repetido
- Cruzamento automático entre a planilha operacional e a base financeira pelo número do embarque
- Total de faturamento e custo da rota para conferência, mais R$/ton médio, menor e maior valor somente dos embarques encontrados nas duas bases
- R$/ton lido diretamente pelo cabeçalho da base de valores (coluna AF nas abas atuais). Se a célula estiver vazia, o app aplica a mesma fórmula da planilha: `CUSTO ROTA ÷ TOTAL TONS × 1.000`
- Dashboard visual de menor e maior R$/ton separado entre carros da casa, terceiros fixos e SPOTs; cada barra abre exatamente os embarques que formam aquele valor
- Botão em cada bloco para conferir todos os embarques da frota ordenados do menor para o maior R$/ton
- Painel exclusivo dos SPOTs com custo total, R$/ton médio, menor, maior e quantidade de embarques sem esse valor
- Detalhamento clicável dos SPOTs, ordenado do menor para o maior R$/ton
- Classificação completa dos motoristas, separada entre carros da casa e terceiros fixos; os três melhores ficam destacados para bonificação e todos os demais continuam abaixo
- Índice de R$/ton ajustado: `100` representa a mediana da mesma frota e faixa de distância; quanto menor o índice, melhor o desempenho
- Faixas visíveis: `Excelente` até 85, `Bom` até 100, `Atenção` até 125 e `Ruim` acima de 125; uma única viagem fica como `Amostra inicial`
- Origem operacional fixa no ponto exato da Cooperrita na BR: `-22.261541, -45.764269`, visível no painel
- Rankings clicáveis das rotas mais próximas e mais longas da base, usando a referência rodoviária de ida e volta desde essa coordenada
- Referências rodoviárias para as 104 cidades encontradas nas sete abas financeiras; rotas futuras sem referência continuam usando a mediana de `KM ROTA`
- Proteção contra KM incompatível: a proximidade geográfica não muda por causa de um lançamento isolado incorreto, e o valor divergente fica sinalizado para revisão
- Rankings separados de carros da casa e terceiros fixos em rotas próximas, combinando menor R$/ton com retorno dentro do prazo esperado
- Rankings separados de carros da casa e terceiros fixos em rotas regionais e longas, usando a mesma comparação de R$/ton e velocidade de retorno
- Os três melhores de cada frota ficam destacados, todos os demais continuam listados abaixo em ordem de eficiência e motoristas sem todos os campos necessários aparecem no fim como `Dados insuficientes`
- As referências de R$/ton e duração são calculadas separadamente por frota e por distância (`muito próxima até 120`, `próxima de 121–250`, `regional de 251–500` e `longa acima de 500 km`), evitando comparar Pouso Alegre com destinos distantes
- Selo de qualidade por motorista: `Padrão consistente`, `Em observação`, `Fora do padrão` ou `Amostra inicial`, calculado pela proporção de viagens dentro das referências de R$/ton e duração do próprio período
- Rankings de qualidade clicáveis, com as datas exatas de saída e retorno e somente as viagens que formaram a avaliação
- Ranking clicável de motoristas com menor desempenho, mostrando também o R$/ton médio por motorista e somando faltas, atestados, rotas próximas que ultrapassaram o prazo esperado e R$/ton acima de 25% da mediana da mesma frota e faixa de distância
- Pontuação visível e auditável: falta `+5`, atestado `+3`, rota curta demorada `+3` e R$/ton elevado `+2`
- Tela fixa com todas as ocorrências que formaram a pontuação; o indicador exige revisão humana antes de qualquer decisão
- Plano de melhoria automático que cruza todos os dados importados e gera ideias priorizadas com evidência, ação sugerida e acesso aos registros usados
- Recomendações para cobertura financeira incompleta, dependência e recorrência de SPOT, picos diários, R$/ton acima da referência, baixa ocupação, prazo de retorno, variação de custo, apoio aos motoristas e cobertura de ausências
- Critérios transparentes e revisáveis: cada recomendação explica de onde veio e assuntos de saúde ou desempenho nunca são tratados como decisão automática
- Ranking das viagens mais demoradas usando prioritariamente a diferença entre a data de saída e a data de retorno e, quando necessário, `LEAD TIME DA ROTA`
- Tabela completa com busca e filtros para embarques cruzados, sem custo e sem rota
- Detalhamento financeiro em tela fixa, com cabeçalho visível e rolagem somente dentro dos dados
- Exportação dos dados financeiros cruzados junto do relatório CSV completo, com saída e retorno em colunas separadas

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub e envie todos os arquivos desta pasta.
2. Em **Settings > Pages**, selecione a branch `main` e a pasta `/ (root)`.
3. Salve. O GitHub irá disponibilizar um endereço para o sistema.

> O projeto usa SheetJS por CDN para ler Excel no navegador. Por isso, a primeira leitura de uma planilha requer acesso à internet.

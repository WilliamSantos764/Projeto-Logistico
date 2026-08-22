# 🚚 Sistema de Gestão e Análise Logística de Frota & SPOTS

Aplicações Web e Desktop desenvolvida em Python para leitura e análise automatizada de relatórios operacionais em Excel contendo dados de **Frota Própria**, **Terceiros Fixos** e acionamentos de **Veículos SPOT**.

---

## 🚀 Funcionalidades

- **Leitura Automática de Planilhas**: Processamento completo das abas de datas da planilha padrão de frota.
- **Identificação de Categorias**: Classificação automática de Frota Própria (Cooperrita), Terceiros Fixos e Frota SPOT.
- **Análise por Intervalo de Tempo**: Filtre qualquer intervalo de dias para verificar a quantidade exata de SPOTs acionados.
- **Gráficos Interativos**: Visualização por categoria, rankings de motoristas SPOT mais acionados e curva de uso temporal.
- **Exportação para Excel**: Exporte os relatórios filtrados em formato `.xlsx` limpo.

---

## 🛠️ Como Executar no VS Code

1. Abra a pasta do projeto no **VS Code**.
2. Abra o terminal integrado e instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
3. Execute o comando para iniciar a aplicação:
   ```bash
   streamlit run app.py
   ```
4. O navegador abrirá automaticamente em `http://localhost:8501`.

---

## 💻 Como Instalar/Usar como App de PC (Desktop)

1. Com o app rodando no Google Chrome ou Microsoft Edge, clique no menu de **3 pontos** no canto superior direito do navegador.
2. Navegue até **Mais ferramentas** / **Aplicativos**.
3. Clique em **Instalar este site como um aplicativo**.
4. Um atalho de programa desktop será criado na sua área de trabalho/menu iniciar.

---

## 📤 Como Subir para o GitHub

1. Inicialize o repositório Git na pasta:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Sistema Logistico de Frota e SPOTS"
   ```
2. Crie um repositório no seu GitHub e conecte o remote:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```

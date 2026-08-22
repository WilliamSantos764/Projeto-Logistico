import streamlit as st
import pandas as pd
import plotly.express as px
from io import BytesIO
import re

st.set_page_config(
    page_title="Gestão de Frota e SPOTS - Logística",
    page_icon="🚚",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.2rem;
        font-weight: 700;
        color: #1E3A8A;
        margin-bottom: 0.5rem;
    }
    .sub-header {
        font-size: 1.1rem;
        color: #4B5563;
        margin-bottom: 1.5rem;
    }
    .metric-card {
        background-color: #F3F4F6;
        padding: 1rem;
        border-radius: 10px;
        border-left: 5px solid #2563EB;
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<div class="main-header">🚚 Painel de Controle de Frota & SPOTS</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-header">Análise inteligente de veículos próprios (Cooperrita), terceiros fixos e contratações SPOT.</div>', unsafe_allow_html=True)

def parse_fleet_excel(uploaded_file):
    xls = pd.ExcelFile(uploaded_file)
    all_records = []
    
    for sheet in xls.sheet_names:
        df = pd.read_excel(uploaded_file, sheet_name=sheet, header=None)
        
        # Extração de data do cabeçalho da aba
        date_str = sheet
        for r in range(min(5, len(df))):
            row_vals = [str(x) for x in df.iloc[r].dropna().values]
            for val in row_vals:
                match = re.search(r'(\d{2}/\d{2}/\d{4})', val)
                if match:
                    date_str = match.group(1)
                    break
        
        current_section = "NÃO CLASSIFICADO"
        
        for idx, row in df.iterrows():
            row_vals_str = " ".join([str(v) for v in row.dropna().values]).strip()
            
            if not row_vals_str:
                continue
                
            # Identificação inteligente das seções da planilha
            if "COOPERRITA" in row_vals_str.upper():
                current_section = "Frota Própria (Cooperrita)"
                continue
            elif "TERCEIROS FIXOS" in row_vals_str.upper() or ("TERCEIROS" in row_vals_str.upper() and "FIXO" in row_vals_str.upper()):
                current_section = "Terceiros Fixos"
                continue
            elif "TERCEIROS" in row_vals_str.upper() and current_section != "Terceiros Fixos":
                current_section = "Terceiros Fixos"
                continue
            elif "SPOT" in row_vals_str.upper():
                current_section = "Frota SPOT"
                continue
            elif any(k in row_vals_str.upper() for k in ["FOLGA", "FÉRIAS", "FERIAS", "ATESTADO", "FALTA"]):
                current_section = "Ausentes / Folga / Férias"
                continue
                
            # Ignora linhas de cabeçalho interno
            if "PLACAS" in row_vals_str.upper() or "MOTORISTA" in row_vals_str.upper() or "ROTA -" in row_vals_str.upper():
                continue
                
            # Extração dos dados da linha
            if len(row) > 3:
                placa = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ""
                motorista = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else ""
                
                # Garante que é uma linha com dados válidos de veículo/motorista
                if (placa and placa.lower() != "nan") or (motorista and motorista.lower() != "nan"):
                    telefone_ajudante = str(row.iloc[4]).strip() if len(row) > 4 and pd.notna(row.iloc[4]) else ""
                    embarque = str(row.iloc[5]).strip() if len(row) > 5 and pd.notna(row.iloc[5]) else ""
                    cidades = str(row.iloc[6]).strip() if len(row) > 6 and pd.notna(row.iloc[6]) else ""
                    
                    all_records.append({
                        'Aba': sheet,
                        'Data': date_str,
                        'Categoria': current_section,
                        'Placa': placa if placa.lower() != 'nan' else '',
                        'Motorista': motorista if motorista.lower() != 'nan' else '',
                        'Telefone/Ajudante': telefone_ajudante if telefone_ajudante.lower() != 'nan' else '',
                        'Embarque': embarque if embarque.lower() != 'nan' else '',
                        'Cidades/Rota': cidades if cidades.lower() != 'nan' else ''
                    })
                    
    df_res = pd.DataFrame(all_records)
    if not df_res.empty and 'Data' in df_res.columns:
        df_res['Data_Parsed'] = pd.to_datetime(df_res['Data'], format='%d/%m/%Y', errors='coerce')
    return df_res

# Sidebar Upload
st.sidebar.header("📁 Importar Relatório")
uploaded_file = st.sidebar.file_uploader("Envie a planilha Excel (.xlsx)", type=["xlsx", "xls"])

if uploaded_file is not None:
    try:
        df_data = parse_fleet_excel(uploaded_file)
        
        if df_data.empty:
            st.warning("Nenhum dado pôde ser extraído da planilha. Verifique o formato do arquivo.")
        else:
            # Filtro por Período
            st.sidebar.markdown("---")
            st.sidebar.header("🗓️ Filtros de Período")
            
            valid_dates = df_data['Data_Parsed'].dropna()
            if not valid_dates.empty:
                min_date = valid_dates.min().date()
                max_date = valid_dates.max().date()
                
                date_range = st.sidebar.date_input(
                    "Selecione o Intervalo",
                    value=[min_date, max_date],
                    min_value=min_date,
                    max_value=max_date
                )
                
                if isinstance(date_range, (list, tuple)) and len(date_range) == 2:
                    start_d, end_d = date_range
                    df_filtered = df_data[
                        (df_data['Data_Parsed'].dt.date >= start_d) & 
                        (df_data['Data_Parsed'].dt.date <= end_d)
                    ]
                else:
                    df_filtered = df_data.copy()
            else:
                df_filtered = df_data.copy()
                
            # Filtro de Categoria
            categorias = list(df_filtered['Categoria'].unique())
            cat_selected = st.sidebar.multiselect("Filtrar Categorias", options=categorias, default=categorias)
            df_filtered = df_filtered[df_filtered['Categoria'].isin(cat_selected)]

            # KPIs Principais
            st.subheader("📊 Indicadores Resumidos")
            kpi1, kpi2, kpi3, kpi4 = st.columns(4)
            
            total_operacoes = len(df_filtered)
            total_spots = len(df_filtered[df_filtered['Categoria'] == 'Frota SPOT'])
            total_propr = len(df_filtered[df_filtered['Categoria'] == 'Frota Própria (Cooperrita)'])
            total_terc = len(df_filtered[df_filtered['Categoria'] == 'Terceiros Fixos'])
            
            kpi1.metric("Total de Alocações", total_operacoes)
            kpi2.metric("Veículos SPOT Usados", total_spots, delta=f"{(total_spots/total_operacoes*100):.1f}% do total" if total_operacoes else "0%")
            kpi3.metric("Frota Própria (Casa)", total_propr)
            kpi4.metric("Terceiros Fixos", total_terc)
            
            st.markdown("---")

            # Gráficos em abas
            tab1, tab2, tab3 = st.tabs(["📈 Distribuição & Utilização", "📅 Evolução Temporal", "📋 Tabela e Exportação"])
            
            with tab1:
                col_g1, col_g2 = st.columns(2)
                with col_g1:
                    fig_pie = px.pie(
                        df_filtered, 
                        names='Categoria', 
                        title="Divisão das Operações por Categoria de Frota",
                        color_discrete_sequence=px.colors.qualitative.Set2,
                        hole=0.4
                    )
                    st.plotly_chart(fig_pie, use_container_width=True)
                
                with col_g2:
                    df_spots_only = df_filtered[df_filtered['Categoria'] == 'Frota SPOT']
                    if not df_spots_only.empty:
                        top_spots = df_spots_only['Motorista'].value_counts().head(10).reset_index()
                        top_spots.columns = ['Motorista SPOT', 'Quantidade']
                        fig_bar = px.bar(
                            top_spots, 
                            x='Quantidade', 
                            y='Motorista SPOT', 
                            orientation='h',
                            title="Top Motoristas SPOT Mais Acionados",
                            color='Quantidade',
                            color_continuous_scale='Reds'
                        )
                        st.plotly_chart(fig_bar, use_container_width=True)
                    else:
                        st.info("Nenhum registro SPOT para exibir ranking de motoristas.")

            with tab2:
                if 'Data_Parsed' in df_filtered.columns and not df_filtered['Data_Parsed'].dropna().empty:
                    df_time = df_filtered.groupby(['Data', 'Categoria']).size().reset_index(name='Quantidade')
                    fig_line = px.line(
                        df_time, 
                        x='Data', 
                        y='Quantidade', 
                        color='Categoria',
                        markers=True,
                        title="Evolução Diária de Uso da Frota"
                    )
                    st.plotly_chart(fig_line, use_container_width=True)
                else:
                    st.info("Datas não padronizadas para gráfico temporal.")

            with tab3:
                st.markdown("### Base de Dados Completa e Filtrada")
                cols_to_display = ['Data', 'Categoria', 'Placa', 'Motorista', 'Telefone/Ajudante', 'Embarque', 'Cidades/Rota']
                st.dataframe(df_filtered[cols_to_display], use_container_width=True)

                # Exportação Excel
                buffer = BytesIO()
                with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                    df_filtered[cols_to_display].to_excel(writer, index=False, sheet_name='Analise_Frota_SPOT')
                
                st.download_button(
                    label="📥 Baixar Relatório Filtrado em Excel",
                    data=buffer.getvalue(),
                    file_name="Relatorio_Analise_Frota_SPOT.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )

    except Exception as e:
        st.error(f"Erro ao processar a planilha: {str(e)}")
else:
    st.info("👈 Por favor, faça o upload da planilha Excel no menu lateral para visualizar os indicadores.")
    
    st.markdown("""
    ---
    ### ℹ️ Recursos do Sistema:
    * **Leitura Automática de Abas**: Processa todas as datas/abas da sua planilha de relatórios automaticamente.
    * **Separação por Tipo**: Identifica se o veículo é Frota Própria (Cooperrita), Terceiros Fixos ou Contratação SPOT.
    * **Análise de Intervalo de Tempo**: Filtre por intervalo de datas para saber exatamente quantos SPOTs foram acionados num período.
    * **Exportação Personalizada**: Exporte relatórios limpos em formato `.xlsx` das análises desejadas.
    """)

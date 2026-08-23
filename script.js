// Sistema de Gestão e Fluxo de Veículos com Indicadores Clicáveis
document.addEventListener('DOMContentLoaded', () => {
    inicializarData();
    inicializarDados();
    configurarNavegacao();
    configurarMascaraMoeda();
    configurarCalculoTotal();
    configurarIndicadoresClicaveis();
    configurarFiltroBusca();
    configurarFormulario();
});

// Chave do LocalStorage para persistência offline
const STORAGE_KEY = 'SISTEMA_FLUXO_DADOS_V2';
let registros = [];
let registroParaExcluirId = null;

// Dados iniciais padrão se o LocalStorage estiver vazio
const dadosIniciaisPadrao = [
    { id: 1, data: '2026-02-10', descricao: 'Scania R450 6x2 - SPOT Usado', categoria: 'SPOT - Usado', valorUnitario: 350000.00, qtdParcelas: 24, valorTotal: 350000.00 },
    { id: 2, data: '2026-02-12', descricao: 'FH 540 6x4 Próprio', categoria: 'Frota Própria', valorUnitario: 520000.00, qtdParcelas: 36, valorTotal: 520000.00 },
    { id: 3, data: '2026-02-15', descricao: 'VW Constellation 24.280 - SPOT Usado', categoria: 'SPOT - Usado', valorUnitario: 210000.00, qtdParcelas: 12, valorTotal: 210000.00 },
    { id: 4, data: '2026-02-18', descricao: 'MB Actros 2651 - Terceiro Fixo', categoria: 'Terceiros Fixos', valorUnitario: 410000.00, qtdParcelas: 48, valorTotal: 410000.00 }
];

function inicializarData() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('data-registro').value = today;
}

function inicializarDados() {
    const dadosSalvos = localStorage.getItem(STORAGE_KEY);
    if (dadosSalvos) {
        try {
            registros = JSON.parse(dadosSalvos);
        } catch (e) {
            registros = dadosIniciaisPadrao;
        }
    } else {
        registros = dadosIniciaisPadrao;
        salvarStorage();
    }
    atualizarTudo('TODOS');
}

function salvarStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
}

/* 1. NAVEGAÇÃO ENTRE ABAS */
function configurarNavegacao() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabTarget = btn.getAttribute('data-tab');

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`tab-${tabTarget}`).classList.add('active');
        });
    });
}

/* 2. MÁSCARA EM TEMPO REAL PARA MOEDA (R$) */
function configurarMascaraMoeda() {
    const inputValor = document.getElementById('valor-unitario');

    inputValor.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (!value) {
            e.target.value = '';
            atualizarTotalCalculado();
            return;
        }
        let numberValue = parseFloat(value) / 100;
        e.target.value = formatarMoeda(numberValue);
        atualizarTotalCalculado();
    });
}

function formatarMoeda(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function parseMoeda(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
}

/* 3. CÁLCULO DO VALOR TOTAL E PARCELAS NO FORMULÁRIO */
function configurarCalculoTotal() {
    const qtdInput = document.getElementById('qtd-parcelas');
    qtdInput.addEventListener('input', atualizarTotalCalculado);
}

function atualizarTotalCalculado() {
    const valorUnitario = parseMoeda(document.getElementById('valor-unitario').value);
    const qtdParcelas = parseInt(document.getElementById('qtd-parcelas').value) || 1;
    // O valor total cadastrado é o valor unitario total do bem/contrato
    const total = valorUnitario;
    document.getElementById('valor-total-calculado').value = formatarMoeda(total);
}

/* 4. INDICADORES CLICÁVEIS (FILTRO DIRECT TO DATA) */
function configurarIndicadoresClicaveis() {
    const kpiCards = document.querySelectorAll('.kpi-card');
    const btnReset = document.getElementById('btn-reset-filtro');

    kpiCards.forEach(card => {
        card.addEventListener('click', () => {
            const filtro = card.getAttribute('data-filtro');

            // Destacar o card ativo
            kpiCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            // Ir para a aba Fluxo para mostrar os dados correspondentes
            mudarParaAba('fluxo');

            // Aplicar o filtro na tabela
            aplicarFiltroCategoria(filtro);

            // Scroll suave até a tabela
            const secaoTabela = document.getElementById('secao-tabela');
            if (secaoTabela) {
                secaoTabela.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    btnReset.addEventListener('click', () => {
        const cardTodos = document.querySelector('.kpi-card[data-filtro="TODOS"]');
        if (cardTodos) {
            cardTodos.click();
        } else {
            aplicarFiltroCategoria('TODOS');
        }
    });
}

function mudarParaAba(tabName) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.click();
}

function aplicarFiltroCategoria(filtro) {
    const tagFiltro = document.getElementById('tag-filtro-ativo');
    let filtroTexto = 'Todos os Registros';

    if (filtro === 'SPOT') filtroTexto = 'Veículos SPOT Usados';
    else if (filtro === 'PROPRIA') filtroTexto = 'Frota Própria';
    else if (filtro === 'TERCEIROS') filtroTexto = 'Terceiros Fixos';

    tagFiltro.innerText = filtroTexto;
    renderizarTabela(filtro);
}

/* 5. BUSCA RÁPIDA */
function configurarFiltroBusca() {
    const inputBusca = document.getElementById('input-busca');
    inputBusca.addEventListener('input', () => {
        const termo = inputBusca.value.toLowerCase();
        const cardAtivo = document.querySelector('.kpi-card.active');
        const filtroAtual = cardAtivo ? cardAtivo.getAttribute('data-filtro') : 'TODOS';
        renderizarTabela(filtroAtual, termo);
    });
}

/* 6. ATUALIZAÇÃO DOS CARD DE INDICADORES E TABELA */
function atualizarTudo(filtroAtual = 'TODOS') {
    atualizarKPIs();
    renderizarTabela(filtroAtual);
}

function atualizarKPIs() {
    const totalGeral = registros.length;
    const spotCount = registros.filter(r => (r.categoria || '').toUpperCase().includes('SPOT')).length;
    const propriaCount = registros.filter(r => (r.categoria || '').toUpperCase().includes('PRÓPRIA') || (r.categoria || '').toUpperCase().includes('PROPRIA')).length;
    const terceirosCount = registros.filter(r => (r.categoria || '').toUpperCase().includes('TERCEIRO')).length;

    document.getElementById('kpi-total').innerText = totalGeral;
    document.getElementById('kpi-spot').innerText = spotCount;
    document.getElementById('kpi-propria').innerText = propriaCount;
    document.getElementById('kpi-terceiros').innerText = terceirosCount;

    // Métricas financeiras
    const somaTotal = registros.reduce((acc, r) => acc + (r.valorTotal || 0), 0);
    const mediaParc = totalGeral > 0 ? Math.round(registros.reduce((acc, r) => acc + (r.qtdParcelas || 1), 0) / totalGeral) : 0;

    document.getElementById('total-valor-geral').innerText = formatarMoeda(somaTotal);
    document.getElementById('media-parcelas').innerText = `${mediaParc}x`;
}

function renderizarTabela(filtro = 'TODOS', buscaTermo = '') {
    const tbody = document.getElementById('tbody-fluxo');
    const emptyState = document.getElementById('empty-state');
    tbody.innerHTML = '';

    let filtrados = registros.filter(item => {
        // Filtro da Categoria
        let atendeCategoria = true;
        const cat = (item.categoria || '').toUpperCase();

        if (filtro === 'SPOT') {
            atendeCategoria = cat.includes('SPOT');
        } else if (filtro === 'PROPRIA') {
            atendeCategoria = cat.includes('PRÓPRIA') || cat.includes('PROPRIA');
        } else if (filtro === 'TERCEIROS') {
            atendeCategoria = cat.includes('TERCEIRO');
        }

        // Filtro de Texto de Busca
        let atendeBusca = true;
        if (buscaTermo) {
            const desc = (item.descricao || '').toLowerCase();
            atendeBusca = desc.includes(buscaTermo) || cat.toLowerCase().includes(buscaTermo);
        }

        return atendeCategoria && atendeBusca;
    });

    if (filtrados.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        filtrados.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatarDataExibicao(item.data)}</td>
                <td><strong>${item.descricao}</strong></td>
                <td><span class="badge-filter">${item.categoria}</span></td>
                <td>${formatarMoeda(item.valorUnitario)}</td>
                <td>${item.qtdParcelas}x</td>
                <td><strong>${formatarMoeda(item.valorTotal)}</strong></td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="solicitarExclusao(${item.id})">🗑️ Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function formatarDataExibicao(dataIso) {
    if (!dataIso) return '-';
    const partes = dataIso.split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return dataIso;
}

/* 7. CONFIRMAÇÃO DE EXCLUSÃO DE REGISTRO */
function solicitarExclusao(id) {
    registroParaExcluirId = id;
    document.getElementById('modal-confirmacao').classList.remove('hidden');
}

document.getElementById('btn-cancelar-exclusao').addEventListener('click', () => {
    registroParaExcluirId = null;
    document.getElementById('modal-confirmacao').classList.add('hidden');
});

document.getElementById('btn-confirmar-exclusao').addEventListener('click', () => {
    if (registroParaExcluirId !== null) {
        registros = registros.filter(r => r.id !== registroParaExcluirId);
        salvarStorage();
        
        const cardAtivo = document.querySelector('.kpi-card.active');
        const filtroAtual = cardAtivo ? cardAtivo.getAttribute('data-filtro') : 'TODOS';
        atualizarTudo(filtroAtual);
        
        registroParaExcluirId = null;
        document.getElementById('modal-confirmacao').classList.add('hidden');
    }
});

/* 8. FORMULÁRIO DE CADASTRO DE NOVO REGISTRO */
function configurarFormulario() {
    const form = document.getElementById('form-cadastro');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const desc = document.getElementById('descricao').value;
        const cat = document.getElementById('categoria').value;
        const valorUnitario = parseMoeda(document.getElementById('valor-unitario').value);
        const qtdParcelas = parseInt(document.getElementById('qtd-parcelas').value) || 1;
        const dataReg = document.getElementById('data-registro').value;

        const novoItem = {
            id: Date.now(),
            data: dataReg,
            descricao: desc,
            categoria: cat,
            valorUnitario: valorUnitario,
            qtdParcelas: qtdParcelas,
            valorTotal: valorUnitario
        };

        registros.unshift(novoItem);
        salvarStorage();

        // Limpar formulário
        form.reset();
        inicializarData();
        atualizarTotalCalculado();

        // Ir para o fluxo e atualizar
        atualizarTudo('TODOS');
        const cardTodos = document.querySelector('.kpi-card[data-filtro="TODOS"]');
        if (cardTodos) cardTodos.click();
    });
}

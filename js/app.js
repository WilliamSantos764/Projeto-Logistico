/**
 * GESTÃO DE FLUXO DE CAIXA - APP CORE
 */

// Storage Key
const STORAGE_KEY = 'fluxo_caixa_produtos_v1';

// Default categories for suggestions
const DEFAULT_CATEGORIES = [
    'Alimentação', 'Moradia', 'Transporte', 'Eletrônicos',
    'Lazer & Entretenimento', 'Saúde & Beleza', 'Educação',
    'Vestuário', 'Serviços', 'Outros'
];

// App State
let products = [];
let deleteCandidateId = null;

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Form inputs
const productForm = document.getElementById('productForm');
const productNameInput = document.getElementById('productName');
const productCategoryInput = document.getElementById('productCategory');
const categoriesDatalist = document.getElementById('categoriesDatalist');
const productValueInput = document.getElementById('productValue');
const productInstallmentsSelect = document.getElementById('productInstallments');
const productDateInput = document.getElementById('productDate');
const calculatedInstallmentInput = document.getElementById('calculatedInstallment');
const btnResetForm = document.getElementById('btnResetForm');

// Flow Tab
const flowTableBody = document.getElementById('flowTableBody');
const searchFilter = document.getElementById('searchFilter');
const categoryFilter = document.getElementById('categoryFilter');
const parcelaFilter = document.getElementById('parcelaFilter');
const btnClearFilters = document.getElementById('btnClearFilters');
const filteredCount = document.getElementById('filteredCount');
const filteredTotalValue = document.getElementById('filteredTotalValue');
const emptyState = document.getElementById('emptyState');

// Dashboard Tab
const dashTotalValue = document.getElementById('dashTotalValue');
const dashTotalCount = document.getElementById('dashTotalCount');
const dashParceladoCount = document.getElementById('dashParceladoCount');
const categoryBreakdown = document.getElementById('categoryBreakdown');

// Modal
const deleteModal = document.getElementById('deleteModal');
const deleteModalDetails = document.getElementById('deleteModalDetails');
const btnCancelDelete = document.getElementById('btnCancelDelete');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');

// Network Status
const networkStatus = document.getElementById('networkStatus');
const statusText = document.getElementById('statusText');
const toast = document.getElementById('toast');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    setDefaultDate();
    initTabNavigation();
    initFormHandlers();
    initFilterHandlers();
    initModalHandlers();
    initNetworkMonitor();
    updateUI();
});

// --- DATA PERSISTENCE (localStorage & Offline) ---
function loadProducts() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try {
            products = JSON.parse(data);
        } catch (e) {
            products = [];
        }
    } else {
        // Mock sample data if empty
        products = [
            { id: 1, name: 'Notebook Dell Inspiron', category: 'Eletrônicos', totalValue: 3600.00, installments: 12, date: '2026-02-10' },
            { id: 2, name: 'Compras de Supermercado', category: 'Alimentação', totalValue: 450.50, installments: 1, date: '2026-02-15' },
            { id: 3, name: 'Smartphone Galaxy S24', category: 'Eletrônicos', totalValue: 2800.00, installments: 10, date: '2026-02-18' }
        ];
        saveProducts();
    }
}

function saveProducts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

// --- CURRENCY FORMATTING (Real-time) ---
function parseCurrencyToNumber(currencyStr) {
    if (!currencyStr) return 0;
    const cleanStr = currencyStr.replace(/[^0-9]/g, '');
    return cleanStr ? parseFloat(cleanStr) / 100 : 0;
}

function formatNumberToCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

function handleCurrencyInput(e) {
    let numeric = parseCurrencyToNumber(e.target.value);
    e.target.value = formatNumberToCurrency(numeric);
    updateCalculatedInstallment();
}

// --- FORM HANDLING & CALCULATION ---
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    productDateInput.value = today;
}

function updateCalculatedInstallment() {
    const total = parseCurrencyToNumber(productValueInput.value);
    const inst = parseInt(productInstallmentsSelect.value, 10) || 1;
    if (total > 0 && inst > 0) {
        const perInst = total / inst;
        calculatedInstallmentInput.value = formatNumberToCurrency(perInst);
    } else {
        calculatedInstallmentInput.value = 'R$ 0,00';
    }
}

function initFormHandlers() {
    productValueInput.addEventListener('input', handleCurrencyInput);
    productInstallmentsSelect.addEventListener('change', updateCalculatedInstallment);

    productForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = productNameInput.value.trim();
        const category = productCategoryInput.value.trim();
        const totalValue = parseCurrencyToNumber(productValueInput.value);
        const installments = parseInt(productInstallmentsSelect.value, 10);
        const date = productDateInput.value;

        if (!name || !category || totalValue <= 0 || !date) {
            showToast('Por favor, preencha todos os campos corretamente!');
            return;
        }

        const newProduct = {
            id: Date.now(),
            name,
            category,
            totalValue,
            installments,
            date
        };

        products.unshift(newProduct);
        saveProducts();
        updateUI();
        resetForm();
        showToast('Produto cadastrado com sucesso!');

        // Switch to Flow tab
        switchTab('fluxo');
    });

    btnResetForm.addEventListener('click', resetForm);
}

function resetForm() {
    productForm.reset();
    setDefaultDate();
    calculatedInstallmentInput.value = 'R$ 0,00';
}

// --- TAB NAVIGATION ---
function initTabNavigation() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabName) {
    tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

// --- CATEGORY AUTOCOMPLETE ---
function updateCategoriesDatalist() {
    const categoriesSet = new Set([...DEFAULT_CATEGORIES]);
    products.forEach(p => {
        if (p.category) categoriesSet.add(p.category);
    });

    categoriesDatalist.innerHTML = '';
    categoryFilter.innerHTML = '<option value="">Todas as Categorias</option>';

    categoriesSet.forEach(cat => {
        // Datalist
        const option = document.createElement('option');
        option.value = cat;
        categoriesDatalist.appendChild(option);

        // Filter dropdown
        const filterOpt = document.createElement('option');
        filterOpt.value = cat;
        filterOpt.textContent = cat;
        categoryFilter.appendChild(filterOpt);
    });
}

// --- FLOW FILTERS & RENDER ---
function initFilterHandlers() {
    searchFilter.addEventListener('input', renderFlowTable);
    categoryFilter.addEventListener('change', renderFlowTable);
    parcelaFilter.addEventListener('change', renderFlowTable);

    btnClearFilters.addEventListener('click', () => {
        searchFilter.value = '';
        categoryFilter.value = '';
        parcelaFilter.value = '';
        renderFlowTable();
    });
}

function getFilteredProducts() {
    const search = searchFilter.value.toLowerCase().trim();
    const cat = categoryFilter.value;
    const par = parcelaFilter.value;

    return products.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(search) || item.category.toLowerCase().includes(search);
        const matchesCat = !cat || item.category === cat;
        let matchesPar = true;

        if (par === 'vista') {
            matchesPar = item.installments === 1;
        } else if (par === 'parcelado') {
            matchesPar = item.installments > 1;
        }

        return matchesSearch && matchesCat && matchesPar;
    });
}

function renderFlowTable() {
    const filtered = getFilteredProducts();
    flowTableBody.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }

    let sumValue = 0;

    filtered.forEach(item => {
        sumValue += item.totalValue;
        const valPar = item.totalValue / item.installments;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDateBR(item.date)}</td>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td>${escapeHtml(item.category)}</td>
            <td><strong>${formatNumberToCurrency(item.totalValue)}</strong></td>
            <td>
                <span class="${item.installments > 1 ? 'badge-parcela' : 'badge-vista'}">
                    ${item.installments}x ${item.installments > 1 ? 'Parcelado' : 'À vista'}
                </span>
            </td>
            <td>${formatNumberToCurrency(valPar)} /mês</td>
            <td>
                <button class="btn btn-danger btn-sm btn-delete" data-id="${item.id}">
                    Excluir
                </button>
            </td>
        `;
        flowTableBody.appendChild(tr);
    });

    // Update summary metrics
    filteredCount.textContent = filtered.length;
    filteredTotalValue.textContent = formatNumberToCurrency(sumValue);

    // Attach delete listeners
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
            openDeleteModal(id);
        });
    });
}

// --- DELETION CONFIRMATION MODAL ---
function initModalHandlers() {
    btnCancelDelete.addEventListener('click', closeDeleteModal);
    btnConfirmDelete.addEventListener('click', () => {
        if (deleteCandidateId !== null) {
            products = products.filter(p => p.id !== deleteCandidateId);
            saveProducts();
            updateUI();
            closeDeleteModal();
            showToast('Item removido com sucesso!');
        }
    });
}

function openDeleteModal(id) {
    const item = products.find(p => p.id === id);
    if (!item) return;

    deleteCandidateId = id;
    deleteModalDetails.innerHTML = `
        <div><strong>Produto:</strong> ${escapeHtml(item.name)}</div>
        <div><strong>Valor Total:</strong> ${formatNumberToCurrency(item.totalValue)} (${item.installments}x)</div>
    `;
    deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    deleteCandidateId = null;
    deleteModal.classList.add('hidden');
}

// --- DASHBOARD RENDER ---
function renderDashboard() {
    let totalVal = 0;
    let parceladoCnt = 0;
    const catTotals = {};

    products.forEach(p => {
        totalVal += p.totalValue;
        if (p.installments > 1) parceladoCnt++;

        catTotals[p.category] = (catTotals[p.category] || 0) + p.totalValue;
    });

    dashTotalValue.textContent = formatNumberToCurrency(totalVal);
    dashTotalCount.textContent = products.length;
    dashParceladoCount.textContent = parceladoCnt;

    categoryBreakdown.innerHTML = '';
    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    if (sortedCats.length === 0) {
        categoryBreakdown.innerHTML = '<p class="text-muted">Nenhuma categoria registrada.</p>';
        return;
    }

    sortedCats.forEach(([cat, val]) => {
        const percent = totalVal > 0 ? ((val / totalVal) * 100).toFixed(1) : 0;
        const div = document.createElement('div');
        div.className = 'breakdown-item';
        div.innerHTML = `
            <span><strong>${escapeHtml(cat)}</strong></span>
            <span>${formatNumberToCurrency(val)} (${percent}%)</span>
        `;
        categoryBreakdown.appendChild(div);
    });
}

// --- GENERAL UI UPDATER ---
function updateUI() {
    updateCategoriesDatalist();
    renderFlowTable();
    renderDashboard();
}

// --- OFFLINE MONITOR ---
function initNetworkMonitor() {
    function updateStatus() {
        if (navigator.onLine) {
            networkStatus.querySelector('.status-dot').className = 'status-dot online';
            statusText.textContent = 'Online';
        } else {
            networkStatus.querySelector('.status-dot').className = 'status-dot';
            statusText.textContent = 'Modo Offline (Dados salvos localmente)';
        }
    }

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
}

// --- HELPER UTILS ---
function formatDateBR(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

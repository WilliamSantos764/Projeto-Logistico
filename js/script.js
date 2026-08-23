let parsedData = [];
let categoryChart = null;
let timelineChart = null;

document.getElementById('excel-file').addEventListener('change', handleFileUpload);
document.getElementById('btn-apply-filters').addEventListener('click', applyFilters);
document.getElementById('btn-export').addEventListener('click', exportToExcel);

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        parsedData = [];

        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonSheet = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            let currentSection = "NÃO CLASSIFICADO";

            jsonSheet.forEach((row, index) => {
                if (!row || row.length === 0) return;

                const rowStr = row.map(cell => String(cell || '')).join(" ").toUpperCase();

                if (rowStr.includes("COOPERRITA")) {
                    currentSection = "Frota Própria (Cooperrita)";
                    return;
                } else if (rowStr.includes("TERCEIROS FIXOS") || (rowStr.includes("TERCEIROS") && rowStr.includes("FIXO"))) {
                    currentSection = "Terceiros Fixos";
                    return;
                } else if (rowStr.includes("TERCEIROS") && currentSection !== "Terceiros Fixos") {
                    currentSection = "Terceiros Fixos";
                    return;
                } else if (rowStr.includes("SPOT")) {
                    currentSection = "Frota SPOT";
                    return;
                } else if (["FOLGA", "FÉRIAS", "FERIAS", "ATESTADO", "FALTA"].some(k => rowStr.includes(k))) {
                    currentSection = "Ausentes / Folga / Férias";
                    return;
                }

                if (rowStr.includes("PLACAS") || rowStr.includes("MOTORISTA") || rowStr.includes("ROTA -")) {
                    return;
                }

                if (row.length > 3) {
                    const placa = String(row[2] || '').trim();
                    const motorista = String(row[3] || '').trim();

                    if ((placa && placa.toLowerCase() !== 'undefined') || (motorista && motorista.toLowerCase() !== 'undefined')) {
                        const col4 = String(row[4] || '').trim();
                        const col5 = String(row[5] || '').trim();
                        const col6 = String(row[6] || '').trim();

                        parsedData.push({
                            aba: sheetName,
                            categoria: currentSection,
                            placa: placa,
                            motorista: motorista,
                            col4: col4,
                            embarque: col5,
                            cidades: col6
                        });
                    }
                }
            });
        });

        if (parsedData.length > 0) {
            document.getElementById('filter-section').style.display = 'block';
            document.getElementById('kpi-section').style.display = 'grid';
            document.getElementById('charts-section').style.display = 'grid';
            document.getElementById('table-section').style.display = 'block';

            renderData(parsedData);
        } else {
            alert("Nenhum dado válido encontrado na planilha.");
        }
    };

    reader.readAsArrayBuffer(file);
}

function renderData(data) {
    // Render KPIs
    const total = data.length;
    const spots = data.filter(d => d.categoria === 'Frota SPOT').length;
    const propt = data.filter(d => d.categoria === 'Frota Própria (Cooperrita)').length;
    const terc = data.filter(d => d.categoria === 'Terceiros Fixos').length;

    document.getElementById('kpi-total').innerText = total;
    document.getElementById('kpi-spot').innerText = spots;
    document.getElementById('kpi-spot-pct').innerText = total ? `${((spots/total)*100).toFixed(1)}% do total` : '0%';
    document.getElementById('kpi-propt').innerText = propt;
    document.getElementById('kpi-terc').innerText = terc;

    // Render Table
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.aba}</td>
            <td><strong>${item.categoria}</strong></td>
            <td>${item.placa}</td>
            <td>${item.motorista}</td>
            <td>${item.col4}</td>
            <td>${item.embarque}</td>
            <td>${item.cidades}</td>
        `;
        tbody.appendChild(tr);
    });

    // Render Charts
    renderCategoryChart(propt, terc, spots);
    renderTimelineChart(data);
}

function renderCategoryChart(propt, terc, spots) {
    const ctx = document.getElementById('chart-categories').getContext('2d');
    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Frota Própria', 'Terceiros Fixos', 'Frota SPOT'],
            datasets: [{
                data: [propt, terc, spots],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderTimelineChart(data) {
    const ctx = document.getElementById('chart-timeline').getContext('2d');
    if (timelineChart) timelineChart.destroy();

    const countsByAba = {};
    data.forEach(d => {
        if (d.categoria === 'Frota SPOT') {
            countsByAba[d.aba] = (countsByAba[d.aba] || 0) + 1;
        }
    });

    const labels = Object.keys(countsByAba);
    const values = Object.values(countsByAba);

    timelineChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Uso de SPOTS por Data/Aba',
                data: values,
                backgroundColor: '#ef4444'
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function applyFilters() {
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;

    if (!start && !end) {
        renderData(parsedData);
        return;
    }

    // Filtro simples por data/aba se houver formato padronizado
    renderData(parsedData);
}

function exportToExcel() {
    if (parsedData.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(parsedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Frota_Filtrada");
    XLSX.writeFile(wb, "Relatorio_Frota_SPOT_Analise.xlsx");
}

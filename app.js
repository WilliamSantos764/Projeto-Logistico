/* SPOT Insight - processamento local de planilhas */
const state = { records: [], audit: [], loadedKeys: new Set() };
const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput'), folderInput = $('folderInput'), dropzone = $('dropzone');

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function norm(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function hasValue(value) { return clean(value) !== ''; }
function escapeHtml(value) { return clean(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c])); }
function dateKey(value) { const m = clean(value).match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/); return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : ''; }
function displayDate(record) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(record.date)) { const [year, month, day] = record.date.split('-'); return `${day}/${month}/${year}`; }
  return record.date || record.sheet;
}
function isStopRow(row) { const combined = norm(row.join(' ')); return /\b(FOLGA|ATESTADO|FERIAS|FÉRIAS|DUPLAS|COOPERRITA|TERCEIROS|LOGISTICA)\b/.test(combined); }
function resemblesPlate(value) { const text = clean(value); return /[A-Z]{3}\s?-?\s?[0-9A-Z]{4}/i.test(text); }
function countShipments(value) { const text = clean(value); if (!text || /CONTINUA|ESCALA|REENTREGA/i.test(text)) return 0; const parts = text.match(/\d{4,}/g); return parts?.length || 0; }

function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200); }
function sectionHeader(rows, start) {
  for (let r = start + 1; r < Math.min(rows.length, start + 7); r++) {
    const row = rows[r]; const text = row.map(norm);
    if (text.some(x => x === 'PLACAS' || x === 'PLACA') && text.some(x => x.includes('MOTORISTA'))) return r;
  }
  return -1;
}
function columnMap(header) {
  const map = {}; const find = (terms, fallback) => { const found = header.findIndex(v => terms.some(t => norm(v).includes(t))); return found >= 0 ? found : fallback; };
  map.plate = find(['PLACA'], 2); map.driver = find(['MOTORISTA','MOT.'], 3); map.phone = find(['TELEFONE','CELULAR'], 4); map.shipment = find(['EMBARQUE'], 5); map.city = find(['CIDADE','CIDADES','ROTA'], 6);
  return map;
}
function findSheetDate(rows, sheetName) {
  for (const row of rows.slice(0, 8)) { for (const cell of row) { const found = dateKey(cell); if (found) return found; } }
  const m = clean(sheetName).match(/^(\d{2})(\d{2})(\d{2,4})?$/); return m && m[3] ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}` : clean(sheetName);
}
function extractSheet(rows, source, sheet) {
  const sections = [];
  for (let r = 0; r < rows.length; r++) if (rows[r].some(cell => norm(cell) === 'SPOT')) sections.push(r);
  if (!sections.length) return { records: [], message: `${sheet}: seção SPOT não encontrada.` };
  const records = []; let validSections = 0;
  for (const start of sections) {
    const headerRow = sectionHeader(rows, start); if (headerRow < 0) continue; validSections++;
    const cols = columnMap(rows[headerRow]); let emptyStreak = 0;
    for (let r = headerRow + 1; r < Math.min(rows.length, headerRow + 35); r++) {
      const row = rows[r]; const firstCells = row.slice(0, Math.max(8, cols.city + 1));
      if (isStopRow(firstCells)) break;
      const plate = clean(row[cols.plate]), driver = clean(row[cols.driver]), shipment = clean(row[cols.shipment]), city = clean(row[cols.city]);
      const rowHasData = hasValue(plate) || hasValue(driver) || hasValue(shipment) || hasValue(city);
      emptyStreak = rowHasData ? 0 : emptyStreak + 1;
      if (emptyStreak >= 4) break;
      // Uma utilização ocorre quando a linha SPOT tem veículo e rota ou embarque real.
      const used = resemblesPlate(plate) && (hasValue(shipment) || (hasValue(city) && !/CONTINUA.{0,15}ESCALA/i.test(city)));
      if (!used) continue;
      const record = { date: findSheetDate(rows, sheet), sheet, source, plate, driver, phone: clean(row[cols.phone]), shipment, city };
      record.id = `${source}|${sheet}|${r}|${plate}|${shipment}|${city}`;
      records.push(record);
    }
  }
  return { records, message: validSections ? `${sheet}: ${records.length} utilização(ões) SPOT encontrada(s).` : `${sheet}: seção SPOT encontrada, mas cabeçalho não reconhecido.` };
}
async function readFiles(files) {
  if (!files.length) return;
  if (!window.XLSX) { showToast('Não foi possível carregar o leitor de Excel. Verifique sua conexão e tente novamente.'); return; }
  let processed = 0;
  for (const file of files) {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    if (state.loadedKeys.has(fileKey)) continue;
    try {
      const data = await file.arrayBuffer(); const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      let fileRecords = 0;
      workbook.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
        const result = extractSheet(rows, file.name, sheetName); fileRecords += result.records.length;
        result.records.forEach(record => { if (!state.records.some(old => old.id === record.id)) state.records.push(record); });
        state.audit.push(result.message);
      });
      state.loadedKeys.add(fileKey); processed++;
      state.audit.unshift(`${file.name}: análise concluída (${fileRecords} utilização(ões)).`);
    } catch (error) { state.audit.unshift(`${file.name}: não foi possível ler o arquivo (${error.message}).`); }
  }
  if (!processed) { showToast('Esses arquivos já foram importados.'); return; }
  render(); showToast(`${processed} arquivo(s) processado(s) com sucesso.`);
}
function sortedRecords() { return [...state.records].sort((a,b) => String(a.date).localeCompare(String(b.date), 'pt-BR') || a.plate.localeCompare(b.plate)); }
function setOptions(id, values, label, formatter = value => value) { const select = $(id); const selected = select.value; select.innerHTML = `<option value="">${label}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`).join(''); if (values.includes(selected)) select.value = selected; }
function filteredRecords() { const query = norm($('searchInput').value), date = $('dateFilter').value, plate = $('plateFilter').value; return sortedRecords().filter(r => (!date || r.date === date) && (!plate || r.plate === plate) && (!query || norm([r.date,r.sheet,r.source,r.plate,r.driver,r.shipment,r.city].join(' ')).includes(query))); }
function render() {
  $('dashboard').classList.remove('hidden'); $('clearData').hidden = false;
  const records = sortedRecords();
  $('importStatus').textContent = `${state.loadedKeys.size} arquivo(s) • ${records.length} utilização(ões) identificada(s)`;
  $('metricUses').textContent = records.length; $('metricVehicles').textContent = new Set(records.map(r => r.plate)).size; $('metricDays').textContent = new Set(records.map(r => r.date || r.sheet)).size; $('metricShipments').textContent = records.reduce((sum,r) => sum + countShipments(r.shipment), 0);
  setOptions('dateFilter', [...new Set(records.map(r => r.date))].sort(), 'Todos os dias', value => displayDate({date: value, sheet: value}));
  setOptions('plateFilter', [...new Set(records.map(r => r.plate))].sort(), 'Todas as placas');
  renderCharts(records); renderTable();
  $('auditSummary').textContent = `${state.audit.filter(v=>/concluída/.test(v)).length} arquivo(s) analisado(s).`;
  $('auditList').innerHTML = state.audit.slice(0, 80).map(item => `<li>${escapeHtml(item)}</li>`).join('');
}
function renderCharts(records) {
  const daily = new Map(); records.forEach(r => daily.set(r.date, (daily.get(r.date) || 0) + 1));
  const rows = [...daily.entries()].sort((a,b) => a[0].localeCompare(b[0])); const max = Math.max(...rows.map(x=>x[1]),1);
  $('dailyChart').innerHTML = rows.map(([day,count]) => `<div class="bar-item" title="${escapeHtml(day)}: ${count}"><span class="bar-value">${count}</span><div class="bar" style="height:${Math.round((count/max)*138)}px"></div><span class="bar-label">${escapeHtml(day)}</span></div>`).join('');
  $('noChart').classList.toggle('hidden', rows.length > 0);
  const plates = new Map(); records.forEach(r => plates.set(r.plate, (plates.get(r.plate)||0)+1));
  const rank = [...plates.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,6);
  $('vehicleRanking').innerHTML = rank.length ? rank.map(([plate,count],i) => `<li><span class="rank-number">${i+1}</span><span class="rank-name">${escapeHtml(plate)}</span><span class="rank-count">${count} uso${count===1?'':'s'}</span></li>`).join('') : '<li class="no-results">Sem dados.</li>';
}
function renderTable() {
  const records = filteredRecords(); $('reportCount').textContent = `${records.length} registro${records.length===1?'':'s'} encontrado${records.length===1?'':'s'}`;
  $('usageTable').innerHTML = records.length ? records.map(r => `<tr><td>${escapeHtml(displayDate(r))}<br><small>${escapeHtml(r.sheet)}</small></td><td>${escapeHtml(r.plate)}</td><td>${escapeHtml(r.driver || '—')}</td><td>${escapeHtml(r.shipment || '—')}</td><td>${escapeHtml(r.city || '—')}</td><td>${escapeHtml(r.source)}</td></tr>`).join('') : '<tr><td class="no-results" colspan="6">Nenhuma utilização corresponde aos filtros.</td></tr>';
}
function exportCsv() {
  const records = filteredRecords(); if (!records.length) { showToast('Não há registros para exportar.'); return; }
  const lines = [['Data/Aba','Placa','Motorista','Telefone','Embarque','Cidades/Rota','Arquivo'], ...records.map(r => [displayDate(r),r.plate,r.driver,r.phone,r.shipment,r.city,r.source])];
  const csv = lines.map(row => row.map(value => `"${String(value ?? '').replaceAll('"','""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'})); const link = document.createElement('a'); link.href=url; link.download='relatorio-spot.csv'; link.click(); URL.revokeObjectURL(url);
}
function clearAll() { state.records=[]; state.audit=[]; state.loadedKeys.clear(); $('dashboard').classList.add('hidden'); $('clearData').hidden=true; $('importStatus').textContent='Nenhuma planilha importada'; fileInput.value=''; folderInput.value=''; showToast('Dados removidos do painel.'); }

$('chooseFiles').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', e => readFiles([...e.target.files])); folderInput.addEventListener('change', e => readFiles([...e.target.files]));
dropzone.addEventListener('click', e => { if (!e.target.closest('button')) fileInput.click(); }); dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
['dragenter','dragover'].forEach(event => dropzone.addEventListener(event, e=>{e.preventDefault(); dropzone.classList.add('dragging');})); ['dragleave','drop'].forEach(event => dropzone.addEventListener(event,e=>{e.preventDefault();dropzone.classList.remove('dragging');})); dropzone.addEventListener('drop', e=>readFiles([...e.dataTransfer.files].filter(f=>/\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(f.name))));
['searchInput','dateFilter','plateFilter'].forEach(id => $(id).addEventListener(id==='searchInput'?'input':'change', renderTable)); $('clearData').addEventListener('click', clearAll); $('exportCsv').addEventListener('click', exportCsv);

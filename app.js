/* Frota Insight — processamento local de planilhas de rota */
function loadSavedRates() { try { return JSON.parse(localStorage.getItem('frotaInsightRates') || '{}'); } catch { localStorage.removeItem?.('frotaInsightRates'); return {}; } }
const state = { records: [], absences: [], audit: [], loadedKeys: new Set(), rates: loadSavedRates() };
const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput'), folderInput = $('folderInput'), dropzone = $('dropzone');
const FLEETS = { COOPERRITA: 'Carros da casa', 'TERCEIROS FIXOS': 'Terceiros fixos', SPOT: 'SPOT' };
const FLEET_ORDER = ['COOPERRITA', 'TERCEIROS FIXOS', 'SPOT'];
const ABSENCE_LABELS = { FOLGA: 'Folga', 'FÉRIAS': 'Férias', ATESTADO: 'Atestado', FALTA: 'Falta' };
FLEET_ORDER.forEach(fleet => { if (state.rates[fleet] == null && state.rates[`${fleet}|`] != null) state.rates[fleet] = state.rates[`${fleet}|`]; });

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function norm(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function hasValue(value) { return clean(value) !== ''; }
function escapeHtml(value) { return clean(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c])); }
function dateKey(value) { const m = clean(value).match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/); return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : ''; }
function displayDate(record) { if (/^\d{4}-\d{2}-\d{2}$/.test(record.date)) { const [year, month, day] = record.date.split('-'); return `${day}/${month}/${year}`; } return record.date || record.sheet; }
function resemblesPlate(value) { return /\b[A-Z]{3}\s?-?\s?(?=[0-9A-Z]{4}\b)(?=[0-9A-Z]*\d)[0-9A-Z]{4}\b/i.test(clean(value)); }
function countShipments(value) { const text = clean(value); if (!text || /CONTINUA.{0,15}ESCALA/i.test(text)) return 0; return text.match(/\d{4,}/g)?.length || 0; }
function isContinuation(record) { return /CONTINUA.{0,20}ESCALA/i.test(`${record.shipment} ${record.city}`); }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200); }
function findSheetDate(rows, sheetName) { for (const row of rows.slice(0, 9)) for (const cell of row) { const found = dateKey(cell); if (found) return found; } const m = clean(sheetName).match(/^(\d{2})(\d{2})(\d{2,4})?$/); return m && m[3] ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}` : clean(sheetName); }

function sectionFromRow(row) {
  const values = row.map(norm), combined = values.join(' ');
  if (values.some(v => /COOPERRITA|COOPER RITA|FROTA PROPRIA|CARROS? DA CASA/.test(v)) || /\bCOOPERRITA\b/.test(combined)) return 'COOPERRITA';
  if (values.some(v => /TERCEIROS? FIXOS?|FROTA TERCEIRA/.test(v)) || values.some(v => v === 'TERCEIROS')) return 'TERCEIROS FIXOS';
  if (values.some(v => v === 'SPOT')) return 'SPOT';
  return '';
}
function headerRow(rows, start) { for (let r = start + 1; r < Math.min(rows.length, start + 8); r++) { const values = rows[r].map(norm); if (values.some(v => v === 'PLACA' || v === 'PLACAS') && values.some(v => v.includes('MOTORISTA'))) return r; } return -1; }
function isFleetHeader(row) { const values = row.map(norm); return values.some(v => /\bPLACAS?\b/.test(v)) && values.some(v => /MOTORISTA|\bMOT\.?\b/.test(v)); }
function fleetBeforeHeader(rows, header) { for (let r = header - 1; r >= Math.max(0, header - 22); r--) { const fleet = sectionFromRow(rows[r]); if (fleet) return fleet; } return ''; }
function columnMap(header) { const find = (terms, fallback) => { const index = header.findIndex(v => terms.some(t => norm(v).includes(t))); return index >= 0 ? index : fallback; }; return { plate: find(['PLACA'], 0), driver: find(['MOTORISTA', 'MOT.'], 1), phone: find(['TELEFONE', 'CELULAR'], 2), shipment: find(['EMBARQUE'], 3), city: find(['CIDADE', 'CIDADES', 'ROTA'], 4), overnight: find(['PERNOITA', 'PERNOITE'], -1) }; }
function absenceHeaders(row) { const results = []; row.forEach((value, col) => { const text = norm(value); if (text === 'FOLGA') results.push({ col, type: 'FOLGA' }); else if (text === 'FERIAS' || text === 'FÉRIAS') results.push({ col, type: 'FÉRIAS' }); else if (text === 'ATESTADO') results.push({ col, type: 'ATESTADO' }); else if (text === 'FALTA' || text === 'FALTAS') results.push({ col, type: 'FALTA' }); }); return results; }
function rowSignalsNewBlock(row) { const values = row.map(norm), combined = values.join(' '); return Boolean(sectionFromRow(row)) || values.some(v => /^(FOLGA|FERIAS|ATESTADO|FALTA|FALTAS)$/.test(v)) || /\b(FOLGA|FERIAS|ATESTADO|FALTA|FALTAS)\b/.test(combined); }
function isPerson(value) { const text = clean(value), normalized = norm(value); return text.length >= 3 && !resemblesPlate(text) && !/^(PLACAS?|MOTORISTA|AJUDANTE|TELEFONE|EMBARQUE|CIDADES?|ROTA|PESO|PERNOITA|CELULAR|DUPLAS?)$/.test(normalized) && !/^(SIM|NAO|S|N|\d+)$/.test(normalized); }

function extractFleetSection(rows, source, sheet, fleet, start) {
  const header = headerRow(rows, start); if (header < 0) return { records: [], foundHeader: false };
  const cols = columnMap(rows[header]), records = []; let emptyStreak = 0;
  for (let r = header + 1; r < Math.min(rows.length, header + 42); r++) {
    const row = rows[r]; if (rowSignalsNewBlock(row)) break;
    const plate = clean(row[cols.plate]), driver = clean(row[cols.driver]), shipment = clean(row[cols.shipment]), city = clean(row[cols.city]);
    const rowHasData = [plate, driver, shipment, city].some(hasValue); emptyStreak = rowHasData ? 0 : emptyStreak + 1; if (emptyStreak >= 4) break;
    const record = { date: findSheetDate(rows, sheet), sheet, source, fleet, plate, driver, phone: clean(row[cols.phone]), shipment, city, overnight: cols.overnight >= 0 ? clean(row[cols.overnight]) : '' };
    if (!resemblesPlate(plate) || isContinuation(record) || (!hasValue(shipment) && !hasValue(city))) continue;
    record.id = `${source}|${sheet}|${fleet}|${r}|${plate}|${shipment}|${city}`; records.push(record);
  }
  return { records, foundHeader: true };
}
function extractHeaderTable(rows, source, sheet, fleet, header) {
  const cols = columnMap(rows[header]), records = []; let emptyStreak = 0;
  for (let r = header + 1; r < Math.min(rows.length, header + 45); r++) {
    const row = rows[r]; if (rowSignalsNewBlock(row) || isFleetHeader(row)) break;
    const plate = clean(row[cols.plate]), driver = clean(row[cols.driver]), shipment = clean(row[cols.shipment]), city = clean(row[cols.city]);
    const rowHasData = [plate, driver, shipment, city].some(hasValue); emptyStreak = rowHasData ? 0 : emptyStreak + 1; if (emptyStreak >= 5) break;
    const record = { date: findSheetDate(rows, sheet), sheet, source, fleet, plate, driver, phone: clean(row[cols.phone]), shipment, city, overnight: cols.overnight >= 0 ? clean(row[cols.overnight]) : '' };
    if (!resemblesPlate(plate) || isContinuation(record) || (!hasValue(shipment) && !hasValue(city))) continue;
    record.id = `${source}|${sheet}|${fleet}|${r}|${plate}|${shipment}|${city}`; records.push(record);
  }
  return records;
}
function extractAbsences(rows, source, sheet) {
  const records = [], date = findSheetDate(rows, sheet);
  for (let r = 0; r < rows.length; r++) absenceHeaders(rows[r]).forEach(({ col, type }) => {
    for (let rr = r + 1; rr < Math.min(rows.length, r + 8); rr++) {
      if (rr > r + 1 && (sectionFromRow(rows[rr]) || absenceHeaders(rows[rr]).length)) break;
      const employee = clean(rows[rr][col]); if (!isPerson(employee)) continue;
      records.push({ id: `${source}|${sheet}|${type}|${rr}|${col}|${employee}`, date, sheet, source, type, employee });
    }
  });
  return records;
}
function extractSheet(rows, source, sheet) {
  const records = []; let sections = 0, headers = 0, unknownHeaders = 0;
  for (let r = 0; r < rows.length; r++) {
    if (sectionFromRow(rows[r])) sections++;
    if (!isFleetHeader(rows[r])) continue;
    headers++;
    const fleet = fleetBeforeHeader(rows, r);
    if (!fleet) { unknownHeaders++; continue; }
    extractHeaderTable(rows, source, sheet, fleet, r).forEach(record => { if (!records.some(old => old.id === record.id)) records.push(record); });
  }
  const absences = extractAbsences(rows, source, sheet);
  const detail = unknownHeaders ? ` ${unknownHeaders} cabeçalho(s) sem categoria foram ignorados.` : '';
  return { records, absences, message: headers ? `${sheet}: ${records.length} rota(s), ${absences.length} afastamento(s), ${headers} cabeçalho(s) lido(s).${detail}` : `${sheet}: nenhum cabeçalho de Placa/Motorista reconhecido.` };
}
function resetImportedData() {
  state.records = []; state.absences = []; state.audit = []; state.loadedKeys.clear();
  $('dashboard').classList.add('hidden'); $('indicatorView').classList.add('hidden');
  $('searchInput').value = ''; $('dateFilter').value = ''; $('fleetFilter').value = ''; $('plateFilter').value = ''; $('employeeFilter').value = ''; $('absenceFilter').value = '';
}
async function readFiles(files) {
  if (!files.length) return;
  if (!window.XLSX) { showToast('Não foi possível carregar o leitor de Excel. Verifique sua conexão e tente novamente.'); return; }
  resetImportedData(); $('importStatus').textContent = 'Substituindo dados e processando o novo Excel...';
  let processed = 0;
  for (const file of files) {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`; if (state.loadedKeys.has(fileKey)) continue;
    try {
      const data = await file.arrayBuffer(), workbook = XLSX.read(data, { type: 'array', cellDates: true }); let fileRecords = 0, fileAbsences = 0;
      workbook.SheetNames.forEach(sheetName => { const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false }); const result = extractSheet(rows, file.name, sheetName); fileRecords += result.records.length; fileAbsences += result.absences.length; result.records.forEach(record => { if (!state.records.some(old => old.id === record.id)) state.records.push(record); }); result.absences.forEach(record => { if (!state.absences.some(old => old.id === record.id)) state.absences.push(record); }); state.audit.push(result.message); });
      state.loadedKeys.add(fileKey); processed++; state.audit.unshift(`${file.name}: análise concluída (${fileRecords} rotas; ${fileAbsences} afastamentos).`);
    } catch (error) { state.audit.unshift(`${file.name}: não foi possível ler o arquivo (${error.message}).`); }
  }
  if (!processed) { $('importStatus').textContent = 'Nenhum arquivo pôde ser processado'; showToast('Não foi possível carregar os novos dados.'); return; } render(); showToast(`Dados anteriores removidos. ${processed} arquivo(s) carregado(s).`);
}
function sortedRecords() { return [...state.records].sort((a, b) => String(a.date).localeCompare(String(b.date), 'pt-BR') || a.fleet.localeCompare(b.fleet) || a.plate.localeCompare(b.plate)); }
function sortedAbsences() { return [...state.absences].sort((a, b) => String(a.date).localeCompare(String(b.date), 'pt-BR') || a.employee.localeCompare(b.employee)); }
function setOptions(id, values, label, formatter = value => value) { const select = $(id), selected = select.value; select.innerHTML = `<option value="">${label}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`).join(''); if (values.includes(selected)) select.value = selected; }
function filteredRecords() { const query = norm($('searchInput').value), date = $('dateFilter').value, plate = $('plateFilter').value, fleet = $('fleetFilter').value; return sortedRecords().filter(r => (!date || r.date === date) && (!plate || r.plate === plate) && (!fleet || r.fleet === fleet) && (!query || norm([r.date, r.sheet, r.source, r.fleet, r.plate, r.driver, r.shipment, r.city].join(' ')).includes(query))); }
function filteredAbsences() { const employee = $('employeeFilter').value, type = $('absenceFilter').value; return sortedAbsences().filter(r => (!employee || r.employee === employee) && (!type || r.type === type)); }
function countFleet(records, fleet) { return records.filter(r => r.fleet === fleet).length; }
function countAbsence(type) { return state.absences.filter(r => r.type === type).length; }
function isOvernight(record) { return /PERNOITE|\bSIM\b|\bS\b/i.test(`${record.city} ${record.overnight}`); }
function rateKey(fleet) { return fleet; }
function recordRate(record) { return Number(state.rates[rateKey(record.fleet)] ?? 0); }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function renderCosts() { const inputs = { COOPERRITA: $('rateHouse'), 'TERCEIROS FIXOS': $('rateFixed'), SPOT: $('rateSpot') }; FLEET_ORDER.forEach(f => { if (document.activeElement !== inputs[f]) inputs[f].value = Number(state.rates[rateKey(f)] || 0); }); $('costSummary').innerHTML = FLEET_ORDER.map(f => { const uses = state.records.filter(r => r.fleet === f).length, value = Number(state.rates[rateKey(f)] || 0), total = uses * value; return `<button class="cost-result" data-detail="${f}"><strong>${FLEETS[f]}</strong><span>${uses} usos × ${money(value)}</span><b>${money(total)}</b></button>`; }).join(''); }
function countRanking(items, field) { const counts = new Map(); items.forEach(item => { const key = clean(item[field]); if (key) counts.set(key, (counts.get(key) || 0) + 1); }); return [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')); }
function rankingRows(entries, kind, empty = 'Sem registros no período') { return entries.length ? entries.slice(0,5).map(([name,count],i) => `<li><button class="ranking-action" data-ranking-kind="${escapeHtml(kind)}" data-ranking-filter="${escapeHtml(name)}"><span class="ranking-position">${i+1}</span><strong>${escapeHtml(name)}</strong><b>${count}</b></button></li>`).join('') : `<li class="no-results">${empty}</li>`; }
function renderInsights() {
  $('medicalRanking').innerHTML = rankingRows(countRanking(state.absences.filter(r => r.type === 'ATESTADO'), 'employee'), 'ATESTADO');
  $('leaveRanking').innerHTML = rankingRows(countRanking(state.absences.filter(r => r.type === 'FOLGA'), 'employee'), 'FOLGA');
  $('vacationRanking').innerHTML = rankingRows(countRanking(state.absences.filter(r => r.type === 'FÉRIAS'), 'employee'), 'FÉRIAS');
  $('fleetVehicleRankings').innerHTML = FLEET_ORDER.map(fleet => { const rank = countRanking(state.records.filter(r => r.fleet === fleet), 'plate'); return `<section class="fleet-ranking"><h4>${escapeHtml(FLEETS[fleet])}</h4><ol class="mini-ranking">${rankingRows(rank, fleet, 'Nenhum veículo utilizado')}</ol></section>`; }).join('');
}
function saveRate() { const values = { COOPERRITA: Number($('rateHouse').value || 0), 'TERCEIROS FIXOS': Number($('rateFixed').value || 0), SPOT: Number($('rateSpot').value || 0) }; if (Object.values(values).some(value => !Number.isFinite(value) || value < 0)) return showToast('Informe somente valores válidos e positivos.'); Object.assign(state.rates, values); localStorage.setItem('frotaInsightRates', JSON.stringify(state.rates)); render(); showToast('Valores pagos por uso atualizados com sucesso.'); }
function openDetail(kind, filter = '') {
  const absenceType = ['FOLGA','FÉRIAS','ATESTADO','FALTA'].includes(kind);
  $('dashboard').classList.add('hidden'); $('indicatorView').classList.remove('hidden');
  if (absenceType) {
    const items = sortedAbsences().filter(r => r.type === kind && (!filter || r.employee === filter));
    $('indicatorTitle').textContent = `${ABSENCE_LABELS[kind]}${filter ? ` — ${filter}` : ''}`; $('indicatorSubtitle').textContent = 'Funcionários e datas encontrados nas planilhas'; $('indicatorTotal').textContent = `${items.length} registro${items.length === 1 ? '' : 's'}`;
    $('indicatorTable').innerHTML = items.map(r => `<tr><td>${escapeHtml(displayDate(r))}</td><td>${escapeHtml(ABSENCE_LABELS[kind])}</td><td>${escapeHtml(r.employee)}</td><td>—</td><td>—</td><td>${escapeHtml(r.sheet)}</td><td>—</td></tr>`).join('') || '<tr><td colspan="7" class="no-results">Sem dados.</td></tr>';
  } else {
    let records = kind === 'all' ? sortedRecords() : sortedRecords().filter(r => r.fleet === kind);
    if (kind === 'OVERNIGHT') records = sortedRecords().filter(isOvernight);
    if (filter) records = records.filter(r => r.plate === filter);
    const title = kind === 'all' ? 'Veículos-dia em rota' : kind === 'OVERNIGHT' ? 'Rotas com pernoite' : FLEETS[kind];
    const total = records.reduce((sum, r) => sum + recordRate(r), 0);
    $('indicatorTitle').textContent = `${title}${filter ? ` — ${filter}` : ''}`; $('indicatorSubtitle').textContent = `${records.length} utilização${records.length === 1 ? '' : 'ões'} que compõem este indicador`; $('indicatorTotal').textContent = money(total);
    $('indicatorTable').innerHTML = records.map(r => `<tr><td>${escapeHtml(displayDate(r))}</td><td>${escapeHtml(FLEETS[r.fleet])}</td><td>${escapeHtml(r.plate)}</td><td>${escapeHtml(r.driver || '—')}</td><td>${escapeHtml(r.shipment || '—')}</td><td>${escapeHtml(r.city || '—')}</td><td>${money(recordRate(r))}</td></tr>`).join('') || '<tr><td colspan="7" class="no-results">Sem dados.</td></tr>';
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

function render() {
  $('indicatorView').classList.add('hidden'); $('dashboard').classList.remove('hidden'); $('clearData').hidden = false; const records = sortedRecords();
  $('importStatus').textContent = `${state.loadedKeys.size} arquivo(s) • ${records.length} rotas • ${state.absences.length} afastamentos`;
  $('metricUses').textContent = records.length; $('metricHouse').textContent = countFleet(records, 'COOPERRITA'); $('metricFixed').textContent = countFleet(records, 'TERCEIROS FIXOS'); $('metricSpot').textContent = countFleet(records, 'SPOT'); $('metricLeaves').textContent = countAbsence('FOLGA'); $('metricVacation').textContent = countAbsence('FÉRIAS'); $('metricMedical').textContent = countAbsence('ATESTADO'); $('metricOvernight').textContent = records.filter(isOvernight).length;
  setOptions('dateFilter', [...new Set(records.map(r => r.date))].filter(Boolean).sort(), 'Todos os dias', value => displayDate({ date: value, sheet: value })); setOptions('fleetFilter', FLEET_ORDER.filter(fleet => records.some(r => r.fleet === fleet)), 'Todas as frotas', fleet => FLEETS[fleet]); setOptions('plateFilter', [...new Set(records.map(r => r.plate))].sort(), 'Todas as placas'); setOptions('employeeFilter', [...new Set(state.absences.map(r => r.employee))].sort(), 'Todos'); setOptions('absenceFilter', [...new Set(state.absences.map(r => r.type))].sort(), 'Todos os tipos', type => ABSENCE_LABELS[type]);
  renderCharts(records); renderTable(); renderAbsenceTable(); renderCosts(); renderInsights(); $('auditSummary').textContent = `${state.audit.filter(v => /concluída/.test(v)).length} arquivo(s) analisado(s).`; $('auditList').innerHTML = state.audit.slice(0, 100).map(item => `<li>${escapeHtml(item)}</li>`).join('');
}
function renderCharts(records) {
  const daily = new Map(); records.forEach(r => { const day = r.date || r.sheet; if (!daily.has(day)) daily.set(day, { COOPERRITA: 0, 'TERCEIROS FIXOS': 0, SPOT: 0 }); daily.get(day)[r.fleet]++; });
  const rows = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])); const max = Math.max(...rows.map(([, counts]) => Object.values(counts).reduce((sum, n) => sum + n, 0)), 1);
  $('dailyChart').innerHTML = rows.map(([day, counts]) => { const total = Object.values(counts).reduce((sum, n) => sum + n, 0); const segments = FLEET_ORDER.filter(f => counts[f]).map(f => `<span class="bar-segment ${f === 'COOPERRITA' ? 'house-bar' : f === 'TERCEIROS FIXOS' ? 'fixed-bar' : 'spot-bar'}" style="height:${(counts[f] / total) * 100}%"></span>`).join(''); return `<div class="bar-item" title="${escapeHtml(day)}: ${total} veículo(s)-dia"><span class="bar-value">${total}</span><div class="bar stacked-bar" style="height:${Math.max(3, Math.round((total / max) * 138))}px">${segments}</div><span class="bar-label">${escapeHtml(day.slice(5).split('-').reverse().join('/') || day)}</span></div>`; }).join('');
  $('noChart').classList.toggle('hidden', rows.length > 0);
  const plates = new Map(); records.forEach(r => { const current = plates.get(r.plate) || { count: 0, fleets: new Set() }; current.count++; current.fleets.add(r.fleet); plates.set(r.plate, current); }); const rank = [...plates.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0, 6);
  $('vehicleRanking').innerHTML = rank.length ? rank.map(([plate, info], i) => `<li><span class="rank-number">${i + 1}</span><span class="rank-name">${escapeHtml(plate)}<small>${escapeHtml([...info.fleets].map(f => FLEETS[f]).join(' • '))}</small></span><span class="rank-count">${info.count} uso${info.count === 1 ? '' : 's'}</span></li>`).join('') : '<li class="no-results">Sem dados.</li>';
}
function renderTable() { const records = filteredRecords(); $('reportCount').textContent = `${records.length} rota${records.length === 1 ? '' : 's'} encontrada${records.length === 1 ? '' : 's'}`; $('usageTable').innerHTML = records.length ? records.map(r => `<tr><td>${escapeHtml(displayDate(r))}<br><small>${escapeHtml(r.sheet)}</small></td><td><span class="fleet-tag ${r.fleet === 'COOPERRITA' ? 'tag-house' : r.fleet === 'TERCEIROS FIXOS' ? 'tag-fixed' : 'tag-spot'}">${escapeHtml(FLEETS[r.fleet])}</span></td><td>${escapeHtml(r.plate)}</td><td>${escapeHtml(r.driver || '—')}</td><td>${escapeHtml(r.shipment || '—')}</td><td>${escapeHtml(r.city || '—')}${isOvernight(r) ? '<span class="overnight">Pernoite</span>' : ''}</td><td>${escapeHtml(r.source)}</td></tr>`).join('') : '<tr><td class="no-results" colspan="7">Nenhuma utilização corresponde aos filtros.</td></tr>'; }
function renderAbsenceTable() { const records = filteredAbsences(); $('absenceCount').textContent = `${records.length} ocorrência${records.length === 1 ? '' : 's'} no período`; $('absenceTable').innerHTML = records.length ? records.map(r => `<tr><td>${escapeHtml(displayDate(r))}<br><small>${escapeHtml(r.sheet)}</small></td><td>${escapeHtml(r.employee)}</td><td><span class="absence-tag ${r.type === 'FOLGA' ? 'absence-folga' : r.type === 'FÉRIAS' ? 'absence-ferias' : r.type === 'ATESTADO' ? 'absence-atestado' : 'absence-falta'}">${escapeHtml(ABSENCE_LABELS[r.type])}</span></td><td>${escapeHtml(r.source)}</td></tr>`).join('') : '<tr><td class="no-results" colspan="4">Nenhum afastamento corresponde aos filtros.</td></tr>'; }
function exportCsv() { const records = filteredRecords(), absences = filteredAbsences(); if (!records.length && !absences.length) { showToast('Não há dados para exportar.'); return; } const lines = [['Tipo','Data/Aba','Frota / Ocorrência','Placa / Funcionário','Motorista','Telefone','Embarque','Cidades / Rota','Arquivo'], ...records.map(r => ['Rota', displayDate(r), FLEETS[r.fleet], r.plate, r.driver, r.phone, r.shipment, r.city, r.source]), ...absences.map(r => ['Afastamento', displayDate(r), ABSENCE_LABELS[r.type], r.employee, '', '', '', '', r.source])]; const csv = lines.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n'); const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'relatorio-frota-completo.csv'; link.click(); URL.revokeObjectURL(url); }
function clearAll() { state.records = []; state.absences = []; state.audit = []; state.loadedKeys.clear(); $('dashboard').classList.add('hidden'); $('indicatorView').classList.add('hidden'); $('clearData').hidden = true; $('importStatus').textContent = 'Nenhuma planilha importada'; fileInput.value = ''; folderInput.value = ''; showToast('Dados removidos do painel.'); }

$('chooseFiles').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', e => readFiles([...e.target.files])); folderInput.addEventListener('change', e => readFiles([...e.target.files]));
dropzone.addEventListener('click', e => { if (!e.target.closest('button')) fileInput.click(); }); dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
['dragenter', 'dragover'].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('dragging'); })); ['dragleave', 'drop'].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('dragging'); })); dropzone.addEventListener('drop', e => readFiles([...e.dataTransfer.files].filter(f => /\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(f.name))));
['searchInput', 'dateFilter', 'fleetFilter', 'plateFilter'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderTable)); ['employeeFilter', 'absenceFilter'].forEach(id => $(id).addEventListener('change', renderAbsenceTable)); $('clearData').addEventListener('click', clearAll); $('exportCsv').addEventListener('click', exportCsv);
$('saveRate').addEventListener('click', saveRate); document.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.detail))); $('backDashboard').addEventListener('click', () => { $('indicatorView').classList.add('hidden'); $('dashboard').classList.remove('hidden'); });
document.addEventListener('click', e => { const item = e.target.closest('.cost-result'); if (item) openDetail(item.dataset.detail); });
document.addEventListener('click', e => { const item = e.target.closest('.ranking-action'); if (item) openDetail(item.dataset.rankingKind, item.dataset.rankingFilter); });

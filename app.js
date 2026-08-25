/* Frota Insight — processamento local de planilhas de rota */
function loadSavedRates() { try { return JSON.parse(localStorage.getItem('frotaInsightRates') || '{}'); } catch { localStorage.removeItem?.('frotaInsightRates'); return {}; } }
const state = { records: [], absences: [], audit: [], loadedKeys: new Set(), rates: loadSavedRates(), costBase: null, costWorkbook: null, costFileName: '', pendingCost: null, crossAnalysis: null };
const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput'), folderInput = $('folderInput'), dropzone = $('dropzone'), costFileInput = $('costFileInput');
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
function shipmentKeys(value) { const text = clean(value); if (!text || /CONTINUA.{0,15}ESCALA/i.test(text)) return []; return [...new Set(text.match(/\d{4,}/g) || [])]; }
function compactPlate(value) { return norm(value).replace(/[^A-Z0-9]/g, ''); }
function parseLocaleNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date || value == null) return null;
  let text = clean(value); if (!text || /^[-–—]$/.test(text)) return null;
  const negative = /^\(.*\)$/.test(text); text = text.replace(/[()R$€£%\s\u00a0]/g, '').replace(/[^\d,.-]/g, '');
  if (!text || text === '-' || text === '.' || text === ',') return null;
  const lastComma = text.lastIndexOf(','), lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (lastComma >= 0) text = text.replace(/\./g, '').replace(',', '.');
  else if ((text.match(/\./g) || []).length > 1 || /^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const number = Number(text); return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : null;
}
function roundedMoney(value) { return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null; }
function isoDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) { const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000); return date.toISOString().slice(0, 10); }
  const fromBrazilian = dateKey(value); if (fromBrazilian) return fromBrazilian;
  const iso = clean(value).match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)/); return iso ? `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}` : '';
}
function displayIsoDate(value) { const iso = isoDateValue(value); return iso ? iso.split('-').reverse().join('/') : '—'; }
function dateDistance(first, second) { if (!first || !second) return Number.MAX_SAFE_INTEGER; return Math.abs(new Date(`${first}T12:00:00Z`) - new Date(`${second}T12:00:00Z`)) / 86400000; }
function daysBetween(first, second) { if (!first || !second) return null; const days = (new Date(`${second}T12:00:00Z`) - new Date(`${first}T12:00:00Z`)) / 86400000; return Number.isFinite(days) && days >= 0 ? Math.round(days * 10) / 10 : null; }
function isContinuation(record) { return /CONTINUA.{0,20}ESCALA/i.test(`${record.shipment} ${record.city}`); }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200); }
function setDetailMode(active) { document.documentElement.classList.toggle('detail-mode', active); document.body.classList.toggle('detail-mode', active); }
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
  state.records = []; state.absences = []; state.audit = []; state.loadedKeys.clear(); state.crossAnalysis = null;
  $('dashboard').classList.add('hidden'); $('indicatorView').classList.add('hidden'); $('financialDetailView')?.classList.add('hidden'); setDetailMode(false);
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
function costHeaderIndex(rows, requireValueColumn = true) {
  return rows.findIndex(row => {
    const values = row.map(norm), hasShipment = values.some(value => value === 'EMBARQUE'), hasDate = values.some(value => /DATA.*SAIDA/.test(value));
    const hasTotalValue = values.some(value => /TOTAL.*FATURAMENTO/.test(value));
    return hasShipment && hasDate && (!requireValueColumn || hasTotalValue);
  });
}
function costSheetPreview(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false, range: { s: { r: 0, c: 0 }, e: { r: 14, c: 40 } } });
}
function detectedCostSheets(workbook) {
  const complete = workbook.SheetNames.filter(name => costHeaderIndex(costSheetPreview(workbook.Sheets[name])) >= 0);
  if (complete.length) return { names: complete, automatic: true };
  const namedBases = workbook.SheetNames.filter(name => /\bBASE\b/.test(norm(name)) && !/\bCUSTO\b/.test(norm(name)));
  return { names: namedBases.length ? namedBases : [...workbook.SheetNames], automatic: false };
}
function costMonthLabel(sheetName) {
  const name = norm(sheetName), months = [['JAN', 'Janeiro'], ['FEV', 'Fevereiro'], ['MAR', 'Março'], ['ABR', 'Abril'], ['MAI', 'Maio'], ['JUN', 'Junho'], ['JUL', 'Julho'], ['AGO', 'Agosto'], ['SET', 'Setembro'], ['OUT', 'Outubro'], ['NOV', 'Novembro'], ['DEZ', 'Dezembro']];
  return months.find(([token]) => new RegExp(`\\b${token}`).test(name))?.[1] || '';
}
function costSheetOptionLabel(sheetName) { const month = costMonthLabel(sheetName); return month ? `${month} — ${clean(sheetName)}` : clean(sheetName); }
function costColumnMap(headers) {
  const values = headers.map(norm);
  const find = (exact, includes = []) => { for (const term of exact) { const index = values.findIndex(value => value === term); if (index >= 0) return index; } return values.findIndex(value => includes.some(term => value.includes(term))); };
  return {
    shipment: find(['EMBARQUE'], ['EMBARQUE']), departure: find(['DATA SAIDA', 'DATA DE SAIDA'], ['DATA', 'SAIDA']), plate: find(['PLACA'], ['PLACA']), carrier: find(['TRANSPORTADORA'], ['TRANSPORTADORA']),
    profile: find(['PERFIL'], ['PERFIL']), capacity: find(['CAPACIDADE'], ['CAPACIDADE']), route: find(['ROTA'], ['ROTA']), seller: find(['VENDEDOR'], ['VENDEDOR']), totalTons: find(['TOTAL TONS', 'TOTAL TON'], ['TOTAL', 'TON']),
    occupation: find(['OCUPACAO'], ['OCUPACAO']), revenue: find(['TOTAL FATURAMENTO'], ['TOTAL', 'FATURAMENTO']), returnDate: find(['RETORNO ROTA', 'RETORNO DA ROTA'], ['RETORNO', 'ROTA']),
    leadTime: find(['LEAD TIME DA ROTA', 'LEAD TIME ROTA'], ['LEAD TIME', 'ROTA']), km: find(['KM ROTA', 'KM DA ROTA'], ['KM', 'ROTA']), cost: find(['CUSTO ROTA', 'CUSTO DA ROTA'], ['CUSTO', 'ROTA']),
    costPerTon: find(['R$/TON', 'R$ / TON'], ['R$/TON']), costPerKg: find(['R$/KG', 'R$ / KG'], ['R$/KG'])
  };
}
function rowValue(row, column) { return column >= 0 && column < row.length ? row[column] : ''; }
function costCandidateScore(record) { return ['cost','revenue','route','plate','departureDate','returnDate','km'].reduce((score, field) => score + (record[field] !== null && hasValue(record[field]) ? 1 : 0), 0); }
function extractCostRecords(rows, headerIndex, headers) {
  const columns = costColumnMap(headers), candidates = new Map();
  if (headerIndex < 0 || columns.shipment < 0) return { records: [], columns, duplicates: [], sourceRows: 0 };
  let sourceRows = 0;
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const shipments = shipmentKeys(rowValue(row, columns.shipment)); if (!shipments.length) return; sourceRows++;
    const allocation = shipments.length;
    const rawRevenue = parseLocaleNumber(rowValue(row, columns.revenue)), rawCost = parseLocaleNumber(rowValue(row, columns.cost));
    const departureDate = isoDateValue(rowValue(row, columns.departure)), returnDate = isoDateValue(rowValue(row, columns.returnDate));
    const leadTime = parseLocaleNumber(rowValue(row, columns.leadTime));
    const base = {
      sourceRow: headerIndex + offset + 2, sourceShipment: clean(rowValue(row, columns.shipment)), departureDate, returnDate,
      plate: clean(rowValue(row, columns.plate)), carrier: clean(rowValue(row, columns.carrier)), profile: clean(rowValue(row, columns.profile)), capacity: clean(rowValue(row, columns.capacity)),
      route: clean(rowValue(row, columns.route)), seller: clean(rowValue(row, columns.seller)), totalTons: parseLocaleNumber(rowValue(row, columns.totalTons)), occupation: parseLocaleNumber(rowValue(row, columns.occupation)),
      revenue: rawRevenue === null ? null : roundedMoney(rawRevenue / allocation), cost: rawCost === null ? null : roundedMoney(rawCost / allocation), km: parseLocaleNumber(rowValue(row, columns.km)),
      costPerTon: parseLocaleNumber(rowValue(row, columns.costPerTon)), costPerKg: parseLocaleNumber(rowValue(row, columns.costPerKg)), sharedShipments: allocation,
      durationDays: leadTime !== null && leadTime >= 0 ? Math.round(leadTime * 10) / 10 : daysBetween(departureDate, returnDate)
    };
    shipments.forEach(shipment => { const record = { ...base, shipment }; if (!candidates.has(shipment)) candidates.set(shipment, []); candidates.get(shipment).push(record); });
  });
  const duplicates = [], records = [];
  candidates.forEach((items, shipment) => {
    if (items.length > 1) duplicates.push({ shipment, rows: items.map(item => item.sourceRow) });
    const selected = [...items].sort((a, b) => costCandidateScore(b) - costCandidateScore(a) || a.sourceRow - b.sourceRow)[0]; records.push({ ...selected, duplicateRows: items.length });
  });
  records.sort((a, b) => Number(a.shipment) - Number(b.shipment) || a.shipment.localeCompare(b.shipment));
  return { records, columns, duplicates, sourceRows };
}
function routeSimilarity(first, second) {
  const words = value => new Set(norm(value).split(/[^A-Z0-9]+/).filter(word => word.length > 3)); const a = words(first), b = words(second); if (!a.size || !b.size) return 0;
  let common = 0; a.forEach(word => { if (b.has(word)) common++; }); return common / Math.max(a.size, b.size);
}
function bestRouteMatch(costRecord, candidates) {
  const costPlate = compactPlate(costRecord.plate), costDate = costRecord.departureDate;
  return [...candidates].sort((a, b) => {
    const score = record => (costPlate && compactPlate(record.plate) === costPlate ? 120 : 0) + (costDate && isoDateValue(record.date) === costDate ? 90 : 0) + routeSimilarity(costRecord.route, record.city) * 25 - Math.min(dateDistance(costDate, isoDateValue(record.date)), 31);
    return score(b) - score(a) || String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id);
  })[0] || null;
}
function financialProfit(revenue, cost) { return Number.isFinite(revenue) && Number.isFinite(cost) ? roundedMoney(revenue - cost) : null; }
function financialMargin(profit, revenue) { return Number.isFinite(profit) && Number.isFinite(revenue) && revenue !== 0 ? profit / revenue : null; }
function buildCrossAnalysis() {
  if (!state.costBase) { state.crossAnalysis = null; return null; }
  const routeIndex = new Map();
  state.records.forEach(record => shipmentKeys(record.shipment).forEach(shipment => { if (!routeIndex.has(shipment)) routeIndex.set(shipment, []); routeIndex.get(shipment).push(record); }));
  const costRecords = state.costBase.costRecords || [], costMap = new Map(costRecords.map(record => [record.shipment, record])), matchedRows = [], costOnlyRows = [];
  costRecords.forEach(costRecord => {
    const candidates = routeIndex.get(costRecord.shipment) || [], routeRecord = bestRouteMatch(costRecord, candidates), profit = financialProfit(costRecord.revenue, costRecord.cost);
    const common = { shipment: costRecord.shipment, costDate: costRecord.departureDate, routeDate: routeRecord?.date || '', date: routeRecord?.date || costRecord.departureDate, fleet: routeRecord?.fleet || '', plate: routeRecord?.plate || costRecord.plate, driver: routeRecord?.driver || '', route: costRecord.route || routeRecord?.city || '', dailyRoute: routeRecord?.city || '', carrier: costRecord.carrier, profile: costRecord.profile, capacity: costRecord.capacity, seller: costRecord.seller, totalTons: costRecord.totalTons, occupation: costRecord.occupation, revenue: costRecord.revenue, cost: costRecord.cost, profit, margin: financialMargin(profit, costRecord.revenue), km: costRecord.km, costPerTon: costRecord.costPerTon, costPerKg: costRecord.costPerKg, departureDate: costRecord.departureDate, returnDate: costRecord.returnDate, durationDays: costRecord.durationDays, costSourceRow: costRecord.sourceRow, duplicateRows: costRecord.duplicateRows, sharedShipments: costRecord.sharedShipments, routeMatches: candidates.length, routeSource: routeRecord?.source || '', routeSheet: routeRecord?.sheet || '' };
    if (routeRecord) matchedRows.push({ ...common, status: 'matched' }); else costOnlyRows.push({ ...common, status: 'cost-only' });
  });
  const routeOnlyRows = [];
  routeIndex.forEach((candidates, shipment) => {
    if (costMap.has(shipment)) return; const routeRecord = [...candidates].sort((a,b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id))[0];
    routeOnlyRows.push({ shipment, date: routeRecord.date, routeDate: routeRecord.date, costDate: '', fleet: routeRecord.fleet, plate: routeRecord.plate, driver: routeRecord.driver, route: routeRecord.city, dailyRoute: routeRecord.city, carrier: '', profile: '', capacity: '', seller: '', totalTons: null, occupation: null, revenue: null, cost: null, profit: null, margin: null, km: null, costPerTon: null, costPerKg: null, departureDate: '', returnDate: '', durationDays: null, routeMatches: candidates.length, routeSource: routeRecord.source, routeSheet: routeRecord.sheet, status: 'route-only' });
  });
  const allRows = [...matchedRows, ...routeOnlyRows, ...costOnlyRows].sort((a,b) => String(a.date).localeCompare(String(b.date)) || Number(a.shipment) - Number(b.shipment));
  state.crossAnalysis = { matchedRows, routeOnlyRows, costOnlyRows, allRows, routeUniqueCount: routeIndex.size, costUniqueCount: costRecords.length, duplicateCosts: state.costBase.duplicates || [], columns: state.costBase.columns || {} };
  return state.crossAnalysis;
}
function finiteSum(rows, field) { return roundedMoney(rows.reduce((sum, row) => sum + (Number.isFinite(row[field]) ? row[field] : 0), 0)) || 0; }
function financialGroups(rows, field) {
  const groups = new Map();
  rows.forEach(row => { const label = clean(row[field]); if (!label) return; const key = norm(label); if (!groups.has(key)) groups.set(key, { key, label, shipments: 0, costCount: 0, revenueCount: 0, profitCount: 0, durationCount: 0, cost: 0, revenue: 0, profit: 0, durationTotal: 0, durationMax: null }); const group = groups.get(key); group.shipments++;
    if (Number.isFinite(row.cost)) { group.cost += row.cost; group.costCount++; } if (Number.isFinite(row.revenue)) { group.revenue += row.revenue; group.revenueCount++; } if (Number.isFinite(row.profit)) { group.profit += row.profit; group.profitCount++; }
    if (Number.isFinite(row.durationDays)) { group.durationTotal += row.durationDays; group.durationCount++; group.durationMax = Math.max(group.durationMax ?? row.durationDays, row.durationDays); }
  });
  return [...groups.values()].map(group => ({ ...group, cost: roundedMoney(group.cost) || 0, revenue: roundedMoney(group.revenue) || 0, profit: roundedMoney(group.profit) || 0, averageCost: group.costCount ? roundedMoney(group.cost / group.costCount) : null, averageDuration: group.durationCount ? Math.round(group.durationTotal / group.durationCount * 10) / 10 : null, margin: group.revenue ? group.profit / group.revenue : null }));
}
function percent(value) { return Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'; }
function numberPt(value, digits = 1) { return Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—'; }
function moneyOrDash(value) { return Number.isFinite(value) ? money(value) : '—'; }
function durationLabel(value) { return Number.isFinite(value) ? `${numberPt(value, 1)} dia${value === 1 ? '' : 's'}` : '—'; }
function financialStatusLabel(status) { return status === 'matched' ? 'Cruzado' : status === 'route-only' ? 'Sem custo' : 'Sem rota'; }
function financialStatusClass(status) { return status === 'matched' ? 'financial-ok' : status === 'route-only' ? 'financial-warning' : 'financial-missing'; }
function setCostSheetModal(open) { $('costSheetModal').classList.toggle('hidden', !open); document.documentElement.classList.toggle('cost-sheet-open', open); document.body.classList.toggle('cost-sheet-open', open); }
function openCostSheetPicker(workbook, fileName) {
  const detected = detectedCostSheets(workbook); if (!detected.names.length) throw new Error('O arquivo não possui abas para selecionar.');
  state.pendingCost = { workbook, fileName, names: detected.names, automatic: detected.automatic };
  $('costSheetSelect').innerHTML = detected.names.map((name, index) => `<option value="${index}">${escapeHtml(costSheetOptionLabel(name))}</option>`).join(''); $('costSheetSelect').value = '0';
  $('costSheetFileName').textContent = fileName; $('costSheetHelp').textContent = detected.automatic ? `${detected.names.length} ${detected.names.length === 1 ? 'base mensal reconhecida' : 'bases mensais reconhecidas'}. Escolha qual mês deseja carregar.` : 'Não foi possível reconhecer automaticamente uma base mensal. Escolha uma das abas disponíveis.';
  setCostSheetModal(true); $('costSheetSelect').focus?.({ preventScroll: true });
}
async function prepareCostFile(file) {
  if (!file) return;
  if (!window.XLSX) { showToast('Não foi possível carregar o leitor de Excel. Verifique sua conexão e tente novamente.'); return; }
  const previousStatus = state.costBase ? `${state.costBase.fileName} • ${clean(state.costBase.sheetName)} • ${state.costBase.recordCount} embarque${state.costBase.recordCount === 1 ? '' : 's'}` : 'Nenhuma base de valores importada';
  $('costImportStatus').textContent = `Analisando as abas de ${file.name}...`;
  try { const data = await file.arrayBuffer(), workbook = XLSX.read(data, { type: 'array', cellDates: true }); openCostSheetPicker(workbook, file.name); $('costImportStatus').textContent = `${file.name} • escolha uma aba para concluir`; }
  catch (error) { $('costImportStatus').textContent = previousStatus; showToast(`Não foi possível ler a base de valores: ${error.message}`); }
}
function closeCostSheetPicker() { setCostSheetModal(false); state.pendingCost = null; renderCostBaseStatus(); }
function renderCostBaseStatus() {
  const base = state.costBase;
  if (!base) { $('costImportStatus').textContent = 'Nenhuma base de valores importada'; $('costImportSummary').classList.add('hidden'); $('changeCostSheet').hidden = true; return; }
  $('costImportStatus').textContent = `${base.fileName} • ${clean(base.sheetName)} • ${base.recordCount} embarque${base.recordCount === 1 ? '' : 's'}`;
  const headerCount = base.headers.filter(Boolean).length, costReady = base.columns?.cost >= 0 ? 'Custo da rota detectado' : 'Custo da rota não encontrado'; $('costBaseSheet').textContent = clean(base.sheetName); $('costBaseDetails').textContent = `${base.recordCount} embarque${base.recordCount === 1 ? '' : 's'} • ${headerCount} coluna${headerCount === 1 ? '' : 's'} detectada${headerCount === 1 ? '' : 's'} • ${costReady}`;
  $('costImportSummary').classList.remove('hidden'); $('changeCostSheet').hidden = false;
}
function confirmCostSheetImport() {
  const pending = state.pendingCost, selectedIndex = Number($('costSheetSelect').value), sheetName = pending?.names[selectedIndex]; if (!pending || !Number.isInteger(selectedIndex) || !sheetName) return showToast('Escolha uma aba válida para importar.');
  try {
    const rows = XLSX.utils.sheet_to_json(pending.workbook.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: false, dateNF: 'dd/mm/yyyy' });
    let headerIndex = costHeaderIndex(rows); if (headerIndex < 0) headerIndex = costHeaderIndex(rows, false);
    const headers = headerIndex >= 0 ? rows[headerIndex].map(clean) : []; if (headerIndex < 0 || !headers.some(header => norm(header) === 'EMBARQUE')) throw new Error('o cabeçalho EMBARQUE não foi localizado na aba');
    const parsed = extractCostRecords(rows, headerIndex, headers), recordCount = parsed.records.length;
    state.costBase = { fileName: pending.fileName, sheetName, rows, headerIndex, headers, recordCount, costRecords: parsed.records, columns: parsed.columns, duplicates: parsed.duplicates, sourceRows: parsed.sourceRows }; state.costWorkbook = pending.workbook; state.costFileName = pending.fileName; state.crossAnalysis = null;
    setCostSheetModal(false); state.pendingCost = null; renderCostBaseStatus(); if (state.records.length) render(); showToast(`Aba ${clean(sheetName)} importada e pronta para cruzar os embarques.`);
  } catch (error) { showToast(`Não foi possível importar a aba escolhida: ${error.message}`); }
}
function reopenCostSheetPicker() { if (state.costWorkbook) openCostSheetPicker(state.costWorkbook, state.costFileName); else costFileInput.click(); }
function sortedRecords() { return [...state.records].sort((a, b) => String(a.date).localeCompare(String(b.date), 'pt-BR') || a.fleet.localeCompare(b.fleet) || a.plate.localeCompare(b.plate)); }
function sortedAbsences() { return [...state.absences].sort((a, b) => String(a.date).localeCompare(String(b.date), 'pt-BR') || a.employee.localeCompare(b.employee)); }
function setOptions(id, values, label, formatter = value => value) { const select = $(id), selected = select.value; select.innerHTML = `<option value="">${label}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`).join(''); if (values.includes(selected)) select.value = selected; }
function filteredRecords() { const query = norm($('searchInput').value), date = $('dateFilter').value, plate = $('plateFilter').value, fleet = $('fleetFilter').value; return sortedRecords().filter(r => (!date || r.date === date) && (!plate || r.plate === plate) && (!fleet || r.fleet === fleet) && (!query || norm([r.date, r.sheet, r.source, r.fleet, r.plate, r.driver, r.shipment, r.city].join(' ')).includes(query))); }
function filteredAbsences() { const employee = $('employeeFilter').value, type = $('absenceFilter').value; return sortedAbsences().filter(r => (!employee || r.employee === employee) && (!type || r.type === type)); }
function countFleet(records, fleet) { return records.filter(r => r.fleet === fleet).length; }
function countAbsence(type) { return state.absences.filter(r => r.type === type).length; }
function isOvernight(record) { return /PERNOITE|\bSIM\b|\bS\b/i.test(`${record.city} ${record.overnight}`); }
function rateKey(fleet) { return fleet; }
function usageRateKey(record) {
  const identity = clean(record.id) || [record.source, record.sheet, record.date, record.fleet, record.plate, record.shipment, record.city, record.driver].map(norm).join('|');
  return `USAGE|${identity}`;
}
function hasUsageRate(record) { return Boolean(record) && Object.prototype.hasOwnProperty.call(state.rates, usageRateKey(record)); }
function normalizedRate(value, fallback = 0) { const number = Number(clean(value).replace(',', '.')); return Number.isFinite(number) && number >= 0 ? Math.round((number + Number.EPSILON) * 100) / 100 : fallback; }
function recordRate(record) { const defaultValue = normalizedRate(state.rates[rateKey(record.fleet)], 0); return hasUsageRate(record) ? normalizedRate(state.rates[usageRateKey(record)], defaultValue) : defaultValue; }
function sumRecordCosts(records) { return records.reduce((cents, record) => cents + Math.round(recordRate(record) * 100), 0) / 100; }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function persistRates() { localStorage.setItem('frotaInsightRates', JSON.stringify(state.rates)); }
function renderCosts() {
  const inputs = { COOPERRITA: $('rateHouse'), 'TERCEIROS FIXOS': $('rateFixed'), SPOT: $('rateSpot') };
  FLEET_ORDER.forEach(fleet => { if (document.activeElement !== inputs[fleet]) inputs[fleet].value = normalizedRate(state.rates[rateKey(fleet)], 0); });
  $('costSummary').innerHTML = FLEET_ORDER.map(fleet => {
    const records = state.records.filter(record => record.fleet === fleet), defaultValue = normalizedRate(state.rates[rateKey(fleet)], 0), defaultCents = Math.round(defaultValue * 100);
    const customUses = records.filter(hasUsageRate).length;
    const groups = new Map(); records.forEach(record => { const cents = Math.round(recordRate(record) * 100); groups.set(cents, (groups.get(cents) || 0) + 1); });
    const formula = [...groups.entries()].sort(([a], [b]) => a === defaultCents ? -1 : b === defaultCents ? 1 : a - b).map(([cents, uses]) => `${uses} × ${money(cents / 100)}`).join(' + ') || `padrão ${money(defaultValue)}`;
    const total = sumRecordCosts(records);
    const customLabel = customUses ? ` • ${customUses} utilização${customUses === 1 ? '' : 'ões'} com valor individual` : '';
    return `<button class="cost-result" data-detail="${fleet}"><strong>${FLEETS[fleet]}</strong><span>${records.length} usos • ${formula}${customLabel}</span><b>${money(total)}</b></button>`;
  }).join('');
}
function selectedUsage() {
  const key = $('vehicleRateUsage').value;
  return key ? state.records.find(record => usageRateKey(record) === key) || null : null;
}
function usageOptionLabel(record) {
  const route = clean(record.city) || 'Rota não informada', shipment = clean(record.shipment);
  return `${displayDate(record)} • ${route}${shipment ? ` • Emb. ${shipment}` : ''}`;
}
function loadVehicleRateValue() {
  const fleet = $('vehicleRateFleet').value, record = selectedUsage(), input = $('vehicleRateValue'), status = $('vehicleRateStatus'), removeButton = $('removeVehicleRate');
  const hasOverride = hasUsageRate(record);
  input.disabled = !record; removeButton.disabled = !hasOverride;
  input.value = hasOverride ? normalizedRate(state.rates[usageRateKey(record)], 0) : '';
  input.placeholder = record ? `Padrão: ${money(normalizedRate(state.rates[rateKey(fleet)], 0))}` : 'Selecione uma utilização';
  if (!record) status.textContent = 'Escolha a categoria, a placa e a utilização que deseja alterar.';
  else if (hasOverride) status.textContent = `${displayDate(record)} • ${record.plate}: ${money(normalizedRate(state.rates[usageRateKey(record)], 0))} aplicado somente nesta utilização.`;
  else status.textContent = `${displayDate(record)} • ${record.plate}: usando o padrão de ${money(normalizedRate(state.rates[rateKey(fleet)], 0))} somente nesta utilização.`;
}
function renderVehicleRateUsages() {
  const fleet = $('vehicleRateFleet').value, plate = $('vehicleRatePlate').value, usageSelect = $('vehicleRateUsage'), selectedKey = usageSelect.value;
  const records = sortedRecords().filter(record => record.fleet === fleet && norm(record.plate) === norm(plate));
  usageSelect.innerHTML = records.length ? records.map(record => `<option value="${escapeHtml(usageRateKey(record))}">${escapeHtml(usageOptionLabel(record))}</option>`).join('') : '<option value="">Nenhuma utilização encontrada</option>';
  const keys = records.map(usageRateKey); usageSelect.value = keys.includes(selectedKey) ? selectedKey : (keys[0] || '');
  loadVehicleRateValue();
}
function renderVehicleRateEditor() {
  const fleetSelect = $('vehicleRateFleet'), plateSelect = $('vehicleRatePlate');
  if (!FLEET_ORDER.includes(fleetSelect.value)) fleetSelect.value = 'SPOT';
  const selectedPlate = plateSelect.value;
  const plates = [...new Set(state.records.filter(record => record.fleet === fleetSelect.value).map(record => clean(record.plate)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  plateSelect.innerHTML = plates.length ? plates.map(plate => `<option value="${escapeHtml(plate)}">${escapeHtml(plate)}</option>`).join('') : '<option value="">Nenhuma placa importada</option>';
  plateSelect.value = plates.includes(selectedPlate) ? selectedPlate : (plates[0] || '');
  renderVehicleRateUsages();
}
function countRanking(items, field) { const counts = new Map(); items.forEach(item => { const key = clean(item[field]); if (key) counts.set(key, (counts.get(key) || 0) + 1); }); return [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')); }
function rankingRows(entries, kind, empty = 'Sem registros no período') { return entries.length ? entries.slice(0,5).map(([name,count],i) => `<li><button class="ranking-action" data-ranking-kind="${escapeHtml(kind)}" data-ranking-filter="${escapeHtml(name)}"><span class="ranking-position">${i+1}</span><strong>${escapeHtml(name)}</strong><b>${count}</b></button></li>`).join('') : `<li class="no-results">${empty}</li>`; }
function renderInsights() {
  $('medicalRanking').innerHTML = rankingRows(countRanking(state.absences.filter(r => r.type === 'ATESTADO'), 'employee'), 'ATESTADO');
  $('leaveRanking').innerHTML = rankingRows(countRanking(state.absences.filter(r => r.type === 'FOLGA'), 'employee'), 'FOLGA');
  $('vacationRanking').innerHTML = rankingRows(countRanking(state.absences.filter(r => r.type === 'FÉRIAS'), 'employee'), 'FÉRIAS');
  $('fleetVehicleRankings').innerHTML = FLEET_ORDER.map(fleet => { const rank = countRanking(state.records.filter(r => r.fleet === fleet), 'plate'); return `<section class="fleet-ranking"><h4>${escapeHtml(FLEETS[fleet])}</h4><ol class="mini-ranking">${rankingRows(rank, fleet, 'Nenhum veículo utilizado')}</ol></section>`; }).join('');
}
function emptyFinancialRanking(message) { return `<li class="no-results">${escapeHtml(message)}</li>`; }
function renderFinancialRankings(analysis) {
  const matched = analysis.matchedRows, routes = financialGroups(matched, 'route'), drivers = financialGroups(matched, 'driver');
  const profitable = routes.filter(group => group.profitCount).sort((a,b) => b.profit - a.profit || b.margin - a.margin).slice(0, 5);
  $('routeProfitRanking').innerHTML = profitable.length ? profitable.map((group, index) => `<li><button class="financial-ranking-action" data-financial-kind="route" data-financial-filter="${escapeHtml(group.label)}"><span class="ranking-position">${index + 1}</span><strong title="${escapeHtml(group.label)}">${escapeHtml(group.label)}<small>${group.shipments} embarque${group.shipments === 1 ? '' : 's'} • margem ${percent(group.margin)}</small></strong><b class="${group.profit < 0 ? 'negative-money' : 'positive-money'}">${money(group.profit)}</b></button></li>`).join('') : emptyFinancialRanking('Sem lucro calculável nas rotas cruzadas.');
  const costly = routes.filter(group => group.costCount).sort((a,b) => b.cost - a.cost).slice(0, 5);
  $('routeCostRanking').innerHTML = costly.length ? costly.map((group, index) => `<li><button class="financial-ranking-action" data-financial-kind="route" data-financial-filter="${escapeHtml(group.label)}"><span class="ranking-position">${index + 1}</span><strong title="${escapeHtml(group.label)}">${escapeHtml(group.label)}<small>${group.shipments} embarque${group.shipments === 1 ? '' : 's'} • média ${money(group.averageCost)}</small></strong><b>${money(group.cost)}</b></button></li>`).join('') : emptyFinancialRanking('Sem custos de rota cruzados.');
  const efficientDrivers = drivers.filter(group => group.costCount).sort((a,b) => a.averageCost - b.averageCost || b.shipments - a.shipments).slice(0, 5);
  $('driverCostRanking').innerHTML = efficientDrivers.length ? efficientDrivers.map((group, index) => `<li><button class="financial-ranking-action" data-financial-kind="driver" data-financial-filter="${escapeHtml(group.label)}"><span class="ranking-position">${index + 1}</span><strong>${escapeHtml(group.label)}<small>${group.costCount} embarque${group.costCount === 1 ? '' : 's'} • total ${money(group.cost)}</small></strong><b>${money(group.averageCost)}<small>/ embarque</small></b></button></li>`).join('') : emptyFinancialRanking('Nenhum motorista pôde ser ligado aos custos.');
  const longest = matched.filter(row => Number.isFinite(row.durationDays)).sort((a,b) => b.durationDays - a.durationDays || (b.cost ?? 0) - (a.cost ?? 0)).slice(0, 5);
  $('durationRanking').innerHTML = longest.length ? longest.map((row, index) => `<li><button class="financial-ranking-action" data-financial-kind="shipment" data-financial-filter="${escapeHtml(row.shipment)}"><span class="ranking-position">${index + 1}</span><strong>${escapeHtml(row.driver || 'Motorista não informado')}<small title="${escapeHtml(row.route)}">Emb. ${escapeHtml(row.shipment)} • ${escapeHtml(row.route || 'Rota não informada')}</small></strong><b>${durationLabel(row.durationDays)}</b></button></li>`).join('') : emptyFinancialRanking('A base escolhida não possui lead time ou retorno calculável.');
}
function financialTableRow(row, detailed = false) {
  const fleet = row.fleet ? FLEETS[row.fleet] || row.fleet : row.carrier || '—', profitClass = Number.isFinite(row.profit) ? (row.profit < 0 ? 'negative-money' : 'positive-money') : '';
  const common = `<td><button class="shipment-link" data-financial-kind="shipment" data-financial-filter="${escapeHtml(row.shipment)}">${escapeHtml(row.shipment)}</button>${row.duplicateRows > 1 ? '<small class="duplicate-note">Duplicado na base</small>' : ''}</td><td>${escapeHtml(row.driver || '—')}</td><td class="route-cell" title="${escapeHtml(row.route || '')}">${escapeHtml(row.route || '—')}</td>`;
  if (detailed) return `<tr><td>${escapeHtml(displayIsoDate(row.date || row.costDate))}</td>${common}<td>${escapeHtml(fleet)}</td><td>${escapeHtml(row.plate || '—')}</td><td>${moneyOrDash(row.revenue)}</td><td>${moneyOrDash(row.cost)}</td><td class="${profitClass}">${moneyOrDash(row.profit)}</td><td>${numberPt(row.km, 1)}</td><td>${durationLabel(row.durationDays)}</td><td><span class="financial-status ${financialStatusClass(row.status)}">${financialStatusLabel(row.status)}</span></td></tr>`;
  return `<tr><td>${escapeHtml(displayIsoDate(row.date || row.costDate))}</td>${common}<td>${escapeHtml(fleet)}</td><td>${moneyOrDash(row.revenue)}</td><td>${moneyOrDash(row.cost)}</td><td class="${profitClass}">${moneyOrDash(row.profit)}</td><td>${durationLabel(row.durationDays)}</td><td><span class="financial-status ${financialStatusClass(row.status)}">${financialStatusLabel(row.status)}</span></td></tr>`;
}
function renderFinancialTable() {
  const analysis = state.crossAnalysis; if (!analysis) return;
  const query = norm($('financialSearch').value), status = $('financialStatus').value;
  const rows = analysis.allRows.filter(row => (!status || row.status === status) && (!query || norm([row.shipment, row.driver, row.route, row.plate, row.fleet, row.carrier].join(' ')).includes(query)));
  $('financialTableCount').textContent = `${rows.length} embarque${rows.length === 1 ? '' : 's'} exibido${rows.length === 1 ? '' : 's'}`;
  $('financialTable').innerHTML = rows.length ? rows.map(row => financialTableRow(row)).join('') : '<tr><td colspan="10" class="no-results">Nenhum embarque corresponde aos filtros.</td></tr>';
}
function renderCrossAnalysis() {
  const empty = $('financialEmpty'), content = $('financialContent'); if (!empty || !content) return;
  if (!state.costBase) { state.crossAnalysis = null; empty.classList.remove('hidden'); content.classList.add('hidden'); $('financialEmptyTitle').textContent = 'Importe a base de valores para cruzar os embarques'; $('financialEmptyText').textContent = 'Depois de escolher a aba do mês, o sistema ligará custo, faturamento, rota, motorista e duração automaticamente.'; return; }
  const analysis = buildCrossAnalysis(); empty.classList.add('hidden'); content.classList.remove('hidden');
  const matched = analysis.matchedRows, revenue = finiteSum(matched, 'revenue'), cost = finiteSum(matched, 'cost'), profit = finiteSum(matched, 'profit'), margin = revenue ? profit / revenue : null, costRows = matched.filter(row => Number.isFinite(row.cost)), averageCost = costRows.length ? cost / costRows.length : null;
  $('financialPeriod').textContent = `${clean(state.costBase.sheetName)} • ${state.costBase.fileName}`; $('financialMatched').textContent = matched.length; $('financialMatchedSmall').textContent = `de ${analysis.routeUniqueCount} embarque${analysis.routeUniqueCount === 1 ? '' : 's'} da operação`;
  $('financialRevenue').textContent = money(revenue); $('financialCost').textContent = money(cost); $('financialProfit').textContent = money(profit); $('financialProfit').classList.toggle('negative-money', profit < 0); $('financialProfit').classList.toggle('positive-money', profit >= 0); $('financialMargin').textContent = percent(margin); $('financialAverageCost').textContent = moneyOrDash(averageCost);
  const duplicateText = analysis.duplicateCosts.length ? ` ${analysis.duplicateCosts.length} embarque${analysis.duplicateCosts.length === 1 ? '' : 's'} duplicado${analysis.duplicateCosts.length === 1 ? '' : 's'} na base financeira foi considerado apenas uma vez.` : '';
  const notice = $('financialNotice'); notice.classList.remove('financial-notice-ok','financial-notice-warning','financial-notice-error');
  if (state.costBase.columns.cost < 0) { notice.classList.add('financial-notice-error'); notice.textContent = 'O cabeçalho CUSTO ROTA não foi encontrado na aba escolhida. O cruzamento aparece abaixo, mas os indicadores de gasto e lucro ficam indisponíveis.'; }
  else if (!analysis.routeUniqueCount) { notice.classList.add('financial-notice-warning'); notice.textContent = 'A planilha de rotas não contém números de embarque reconhecíveis para realizar o cruzamento.'; }
  else if (!matched.length) { notice.classList.add('financial-notice-error'); notice.textContent = `Nenhum dos ${analysis.routeUniqueCount} embarques da operação foi encontrado em ${clean(state.costBase.sheetName)}. Confira se as duas planilhas são do mesmo mês.${duplicateText}`; }
  else { const coverage = matched.length / analysis.routeUniqueCount; notice.classList.add(coverage >= .8 ? 'financial-notice-ok' : 'financial-notice-warning'); notice.textContent = `${matched.length} de ${analysis.routeUniqueCount} embarques da operação foram cruzados (${percent(coverage)}). ${analysis.routeOnlyRows.length} estão sem custo e ${analysis.costOnlyRows.length} registros da base financeira não aparecem nas rotas.${duplicateText}`; }
  renderFinancialRankings(analysis); renderFinancialTable();
}
function openFinancialDetail(kind = 'all', filter = '') {
  const analysis = state.crossAnalysis || buildCrossAnalysis(); if (!analysis) return showToast('Importe as duas planilhas antes de abrir a análise financeira.');
  let rows = [...analysis.allRows], title = 'Todos os embarques', subtitle = 'Conferência entre a operação e a base de valores';
  if (['matched','revenue','cost','profit','margin','duration'].includes(kind)) rows = [...analysis.matchedRows];
  if (kind === 'route-only') rows = [...analysis.routeOnlyRows]; if (kind === 'cost-only') rows = [...analysis.costOnlyRows];
  if (kind === 'route') { rows = analysis.matchedRows.filter(row => norm(row.route) === norm(filter)); title = `Rota — ${filter}`; subtitle = 'Embarques, custos, faturamento e duração desta rota'; }
  if (kind === 'driver') { rows = analysis.matchedRows.filter(row => norm(row.driver) === norm(filter)); title = `Motorista — ${filter}`; subtitle = 'Embarques e resultados ligados a este motorista'; }
  if (kind === 'shipment') { rows = analysis.allRows.filter(row => row.shipment === clean(filter)); title = `Embarque ${filter}`; subtitle = 'Linha financeira e operação encontradas para este embarque'; }
  if (kind === 'revenue') { title = 'Faturamento dos embarques cruzados'; rows.sort((a,b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity)); }
  if (kind === 'cost') { title = 'Custo das rotas cruzadas'; rows.sort((a,b) => (b.cost ?? -Infinity) - (a.cost ?? -Infinity)); }
  if (kind === 'profit') { title = 'Lucro por embarque'; rows.sort((a,b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity)); }
  if (kind === 'margin') { title = 'Margem dos embarques cruzados'; rows.sort((a,b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity)); }
  if (kind === 'duration') { title = 'Viagens mais demoradas'; rows = rows.filter(row => Number.isFinite(row.durationDays)).sort((a,b) => b.durationDays - a.durationDays); }
  if (kind === 'matched') title = 'Embarques localizados nas duas planilhas'; if (kind === 'route-only') { title = 'Embarques sem custo localizado'; subtitle = 'Presentes na operação, mas ausentes na aba financeira escolhida'; } if (kind === 'cost-only') { title = 'Custos sem rota localizada'; subtitle = 'Presentes na base financeira, mas ausentes na operação importada'; }
  $('dashboard').classList.add('hidden'); $('indicatorView').classList.add('hidden'); $('financialDetailView').classList.remove('hidden'); setDetailMode(true); $('financialDetailTitle').textContent = title; $('financialDetailSubtitle').textContent = subtitle;
  const total = kind === 'cost' ? money(finiteSum(rows, 'cost')) : kind === 'revenue' ? money(finiteSum(rows, 'revenue')) : kind === 'profit' ? money(finiteSum(rows, 'profit')) : `${rows.length} embarque${rows.length === 1 ? '' : 's'}`;
  $('financialDetailTotal').textContent = total; $('financialDetailTable').innerHTML = rows.length ? rows.map(row => financialTableRow(row, true)).join('') : '<tr><td colspan="12" class="no-results">Nenhum dado encontrado.</td></tr>'; $('financialDetailTableWrap').scrollTop = 0; $('financialDetailTableWrap').scrollLeft = 0; $('backFinancialDetail').focus?.({ preventScroll: true });
}
function closeFinancialDetail() { $('financialDetailView').classList.add('hidden'); if (state.records.length) $('dashboard').classList.remove('hidden'); setDetailMode(false); }
function saveRate() { const values = { COOPERRITA: normalizedRate($('rateHouse').value, NaN), 'TERCEIROS FIXOS': normalizedRate($('rateFixed').value, NaN), SPOT: normalizedRate($('rateSpot').value, NaN) }; if (Object.values(values).some(value => !Number.isFinite(value) || value < 0)) return showToast('Informe somente valores válidos e positivos.'); Object.assign(state.rates, values); persistRates(); render(); showToast('Valores padrão por uso atualizados com sucesso.'); }
function saveVehicleRate() {
  const record = selectedUsage(), rawValue = clean($('vehicleRateValue').value), value = normalizedRate(rawValue, NaN);
  if (!record) return showToast('Escolha a utilização específica que deseja alterar.');
  if (!rawValue || !Number.isFinite(value) || value < 0) return showToast('Informe um valor individual válido.');
  state.rates[usageRateKey(record)] = value; persistRates(); renderCosts(); loadVehicleRateValue();
  showToast(`Valor de ${record.plate} alterado somente para ${displayDate(record)}.`);
}
function removeVehicleRate() {
  const record = selectedUsage();
  if (!record || !hasUsageRate(record)) return showToast('Esta utilização já está usando o valor padrão.');
  delete state.rates[usageRateKey(record)]; persistRates(); renderCosts(); loadVehicleRateValue();
  showToast(`${record.plate} voltou ao valor padrão somente em ${displayDate(record)}.`);
}
function openDetail(kind, filter = '') {
  const absenceType = ['FOLGA','FÉRIAS','ATESTADO','FALTA'].includes(kind);
  $('dashboard').classList.add('hidden'); $('financialDetailView').classList.add('hidden'); $('indicatorView').classList.remove('hidden'); setDetailMode(true);
  if (absenceType) {
    const items = sortedAbsences().filter(r => r.type === kind && (!filter || r.employee === filter));
    $('indicatorTitle').textContent = `${ABSENCE_LABELS[kind]}${filter ? ` — ${filter}` : ''}`; $('indicatorSubtitle').textContent = 'Funcionários e datas encontrados nas planilhas'; $('indicatorTotal').textContent = `${items.length} registro${items.length === 1 ? '' : 's'}`;
    $('indicatorTable').innerHTML = items.map(r => `<tr><td>${escapeHtml(displayDate(r))}</td><td>${escapeHtml(ABSENCE_LABELS[kind])}</td><td>${escapeHtml(r.employee)}</td><td>—</td><td>—</td><td>${escapeHtml(r.sheet)}</td><td>—</td></tr>`).join('') || '<tr><td colspan="7" class="no-results">Sem dados.</td></tr>';
  } else {
    let records = kind === 'all' ? sortedRecords() : sortedRecords().filter(r => r.fleet === kind);
    if (kind === 'OVERNIGHT') records = sortedRecords().filter(isOvernight);
    if (filter) records = records.filter(r => r.plate === filter);
    const title = kind === 'all' ? 'Veículos-dia em rota' : kind === 'OVERNIGHT' ? 'Rotas com pernoite' : FLEETS[kind];
    const total = sumRecordCosts(records);
    $('indicatorTitle').textContent = `${title}${filter ? ` — ${filter}` : ''}`; $('indicatorSubtitle').textContent = `${records.length} utilização${records.length === 1 ? '' : 'ões'} que compõem este indicador`; $('indicatorTotal').textContent = money(total);
    $('indicatorTable').innerHTML = records.map(r => `<tr><td>${escapeHtml(displayDate(r))}</td><td>${escapeHtml(FLEETS[r.fleet])}</td><td>${escapeHtml(r.plate)}</td><td>${escapeHtml(r.driver || '—')}</td><td>${escapeHtml(r.shipment || '—')}</td><td>${escapeHtml(r.city || '—')}</td><td>${money(recordRate(r))}${hasUsageRate(r) ? '<small class="individual-rate-note">Individual</small>' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="no-results">Sem dados.</td></tr>';
  }
  $('indicatorTableWrap').scrollTop = 0; $('indicatorTableWrap').scrollLeft = 0; $('backDashboard').focus?.({ preventScroll: true });
}

function closeDetail() { $('indicatorView').classList.add('hidden'); if (state.records.length) $('dashboard').classList.remove('hidden'); setDetailMode(false); }

function render() {
  $('indicatorView').classList.add('hidden'); $('financialDetailView').classList.add('hidden'); $('dashboard').classList.remove('hidden'); setDetailMode(false); $('clearData').hidden = false; const records = sortedRecords();
  $('importStatus').textContent = `${state.loadedKeys.size} arquivo(s) • ${records.length} rotas • ${state.absences.length} afastamentos`;
  $('metricUses').textContent = records.length; $('metricHouse').textContent = countFleet(records, 'COOPERRITA'); $('metricFixed').textContent = countFleet(records, 'TERCEIROS FIXOS'); $('metricSpot').textContent = countFleet(records, 'SPOT'); $('metricLeaves').textContent = countAbsence('FOLGA'); $('metricVacation').textContent = countAbsence('FÉRIAS'); $('metricMedical').textContent = countAbsence('ATESTADO'); $('metricOvernight').textContent = records.filter(isOvernight).length;
  setOptions('dateFilter', [...new Set(records.map(r => r.date))].filter(Boolean).sort(), 'Todos os dias', value => displayDate({ date: value, sheet: value })); setOptions('fleetFilter', FLEET_ORDER.filter(fleet => records.some(r => r.fleet === fleet)), 'Todas as frotas', fleet => FLEETS[fleet]); setOptions('plateFilter', [...new Set(records.map(r => r.plate))].sort(), 'Todas as placas'); setOptions('employeeFilter', [...new Set(state.absences.map(r => r.employee))].sort(), 'Todos'); setOptions('absenceFilter', [...new Set(state.absences.map(r => r.type))].sort(), 'Todos os tipos', type => ABSENCE_LABELS[type]);
  renderCharts(records); renderTable(); renderAbsenceTable(); renderCosts(); renderVehicleRateEditor(); renderInsights(); renderCrossAnalysis(); $('auditSummary').textContent = `${state.audit.filter(v => /concluída/.test(v)).length} arquivo(s) analisado(s).`; $('auditList').innerHTML = state.audit.slice(0, 100).map(item => `<li>${escapeHtml(item)}</li>`).join('');
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
function exportCsv() { const records = filteredRecords(), absences = filteredAbsences(), financial = state.crossAnalysis?.allRows || []; if (!records.length && !absences.length && !financial.length) { showToast('Não há dados para exportar.'); return; } const lines = [['Tipo','Data/Aba','Frota / Ocorrência','Placa / Funcionário','Motorista','Telefone','Embarque','Cidades / Rota','Arquivo','Faturamento','Custo rota','Lucro','Margem','KM','Duração (dias)','Situação'], ...records.map(r => ['Rota', displayDate(r), FLEETS[r.fleet], r.plate, r.driver, r.phone, r.shipment, r.city, r.source,'','','','','','','']), ...absences.map(r => ['Afastamento', displayDate(r), ABSENCE_LABELS[r.type], r.employee, '', '', '', '', r.source,'','','','','','','']), ...financial.map(r => ['Financeiro', displayIsoDate(r.date || r.costDate), r.fleet ? FLEETS[r.fleet] : r.carrier, r.plate, r.driver, '', r.shipment, r.route, state.costBase?.fileName || '', r.revenue ?? '', r.cost ?? '', r.profit ?? '', Number.isFinite(r.margin) ? r.margin : '', r.km ?? '', r.durationDays ?? '', financialStatusLabel(r.status)])]; const csv = lines.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n'); const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'relatorio-frota-completo.csv'; link.click(); URL.revokeObjectURL(url); }
function clearAll() { state.records = []; state.absences = []; state.audit = []; state.loadedKeys.clear(); state.crossAnalysis = null; $('dashboard').classList.add('hidden'); $('indicatorView').classList.add('hidden'); $('financialDetailView').classList.add('hidden'); setDetailMode(false); $('clearData').hidden = true; $('importStatus').textContent = 'Nenhuma planilha importada'; fileInput.value = ''; folderInput.value = ''; showToast('Dados removidos do painel.'); }

$('chooseFiles').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', e => readFiles([...e.target.files])); folderInput.addEventListener('change', e => readFiles([...e.target.files]));
$('chooseCostFile').addEventListener('click', () => { costFileInput.value = ''; costFileInput.click(); }); costFileInput.addEventListener('change', e => prepareCostFile(e.target.files?.[0])); $('confirmCostSheet').addEventListener('click', confirmCostSheetImport); $('cancelCostSheet').addEventListener('click', closeCostSheetPicker); $('changeCostSheet').addEventListener('click', reopenCostSheetPicker); $('costSheetModal').addEventListener('click', e => { if (e.target === $('costSheetModal')) closeCostSheetPicker(); });
dropzone.addEventListener('click', e => { if (!e.target.closest('button')) fileInput.click(); }); dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
['dragenter', 'dragover'].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('dragging'); })); ['dragleave', 'drop'].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('dragging'); })); dropzone.addEventListener('drop', e => readFiles([...e.dataTransfer.files].filter(f => /\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(f.name))));
['searchInput', 'dateFilter', 'fleetFilter', 'plateFilter'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderTable)); ['employeeFilter', 'absenceFilter'].forEach(id => $(id).addEventListener('change', renderAbsenceTable)); $('clearData').addEventListener('click', clearAll); $('exportCsv').addEventListener('click', exportCsv);
$('financialSearch').addEventListener('input', renderFinancialTable); $('financialStatus').addEventListener('change', renderFinancialTable); $('backFinancialDetail').addEventListener('click', closeFinancialDetail);
$('saveRate').addEventListener('click', saveRate); $('vehicleRateFleet').addEventListener('change', renderVehicleRateEditor); $('vehicleRatePlate').addEventListener('change', renderVehicleRateUsages); $('vehicleRateUsage').addEventListener('change', loadVehicleRateValue); $('saveVehicleRate').addEventListener('click', saveVehicleRate); $('removeVehicleRate').addEventListener('click', removeVehicleRate); document.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.detail))); $('backDashboard').addEventListener('click', closeDetail);
document.addEventListener('click', e => { const item = e.target.closest('.cost-result'); if (item) openDetail(item.dataset.detail); });
document.addEventListener('click', e => { const item = e.target.closest('.ranking-action'); if (item) openDetail(item.dataset.rankingKind, item.dataset.rankingFilter); });
document.addEventListener('click', e => { const item = e.target.closest('[data-financial-kind]'); if (item) openFinancialDetail(item.dataset.financialKind, item.dataset.financialFilter || ''); });
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('costSheetModal').classList.contains('hidden')) closeCostSheetPicker(); else if (!$('financialDetailView').classList.contains('hidden')) closeFinancialDetail(); else if (!$('indicatorView').classList.contains('hidden')) closeDetail(); });

/* Frota Insight — processamento local de planilhas de rota */
function loadSavedRates() { try { return JSON.parse(localStorage.getItem('frotaInsightRates') || '{}'); } catch { localStorage.removeItem?.('frotaInsightRates'); return {}; } }
const APP_TAB_CONFIG = Object.freeze([
  { key: 'overview', buttonId: 'appTabOverview', panelId: 'appTabPanelOverview' },
  { key: 'costs', buttonId: 'appTabCosts', panelId: 'appTabPanelCosts' },
  { key: 'financial', buttonId: 'appTabFinancial', panelId: 'appTabPanelFinancial' },
  { key: 'drivers', buttonId: 'appTabDrivers', panelId: 'appTabPanelDrivers' },
  { key: 'improvements', buttonId: 'appTabImprovements', panelId: 'appTabPanelImprovements' },
  { key: 'reports', buttonId: 'appTabReports', panelId: 'appTabPanelReports' }
]);
function loadSavedTab() { try { const saved = localStorage.getItem('frotaInsightActiveTab'); return APP_TAB_CONFIG.some(tab => tab.key === saved) ? saved : 'overview'; } catch { return 'overview'; } }
const state = { records: [], absences: [], audit: [], loadedKeys: new Set(), rates: loadSavedRates(), costBase: null, costWorkbook: null, costFileName: '', pendingCost: null, crossAnalysis: null, driverPerformance: null, improvementAnalysis: null, activeTab: loadSavedTab(), detailOrigin: { x: 0, y: 0, tab: 'overview', active: false } };
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
function dailyRecordKey(record) { return clean(record.date || record.sheet); }
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
  const iso = clean(value).match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)/); if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  return dateKey(value);
}
function displayIsoDate(value) { const iso = isoDateValue(value); return iso ? iso.split('-').reverse().join('/') : '—'; }
function dateDistance(first, second) { if (!first || !second) return Number.MAX_SAFE_INTEGER; return Math.abs(new Date(`${first}T12:00:00Z`) - new Date(`${second}T12:00:00Z`)) / 86400000; }
function daysBetween(first, second) { if (!first || !second) return null; const days = (new Date(`${second}T12:00:00Z`) - new Date(`${first}T12:00:00Z`)) / 86400000; return Number.isFinite(days) && days >= 0 ? Math.round(days * 10) / 10 : null; }
function isContinuation(record) { return /CONTINUA.{0,20}ESCALA/i.test(`${record.shipment} ${record.city}`); }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200); }
function setDetailMode(active) { document.documentElement.classList.toggle('detail-mode', active); document.body.classList.toggle('detail-mode', active); }
function setActiveTab(tabKey, options = {}) {
  const selected = APP_TAB_CONFIG.find(tab => tab.key === tabKey) || APP_TAB_CONFIG[0], { focus = false, scroll = false } = options;
  state.activeTab = selected.key;
  APP_TAB_CONFIG.forEach(tab => {
    const active = tab.key === selected.key, button = $(tab.buttonId), panel = $(tab.panelId);
    button?.classList.toggle('is-active', active); button?.setAttribute?.('aria-selected', String(active)); if (button) button.tabIndex = active ? 0 : -1;
    panel?.classList.toggle('hidden', !active); panel?.setAttribute?.('aria-hidden', String(!active));
  });
  try { localStorage.setItem('frotaInsightActiveTab', selected.key); } catch {}
  const button = $(selected.buttonId), panel = $(selected.panelId);
  if (focus) button?.focus?.({ preventScroll: true });
  if (scroll) setTimeout(() => panel?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0);
  return selected.key;
}
function navigateTabByKeyboard(event, currentKey) {
  const currentIndex = APP_TAB_CONFIG.findIndex(tab => tab.key === currentKey); if (currentIndex < 0) return;
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % APP_TAB_CONFIG.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + APP_TAB_CONFIG.length) % APP_TAB_CONFIG.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = APP_TAB_CONFIG.length - 1;
  else return;
  event.preventDefault?.(); setActiveTab(APP_TAB_CONFIG[nextIndex].key, { focus: true, scroll: true });
}
function rememberDetailOrigin() {
  if (document.body.classList.contains('detail-mode')) return;
  const root = document.documentElement || {}, body = document.body || {};
  state.detailOrigin = {
    x: Number(window.scrollX ?? window.pageXOffset ?? root.scrollLeft ?? body.scrollLeft) || 0,
    y: Number(window.scrollY ?? window.pageYOffset ?? root.scrollTop ?? body.scrollTop) || 0,
    tab: state.activeTab,
    active: true
  };
}
function restoreDetailOrigin() {
  const origin = state.detailOrigin; if (!origin?.active) return;
  state.detailOrigin = { ...origin, active: false };
  setActiveTab(origin.tab || 'overview', { focus: false, scroll: false });
  setTimeout(() => window.scrollTo(origin.x, origin.y), 0);
}
function findSheetDate(rows, sheetName) { for (const row of rows.slice(0, 9)) for (const cell of row) { const found = dateKey(cell); if (found) return found; } const m = clean(sheetName).match(/^(\d{2})(\d{2})(\d{2,4})?$/); return m && m[3] ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}` : clean(sheetName); }

function sectionFromRow(row) {
  const values = row.map(norm), combined = values.join(' ');
  if (values.some(v => /COOPERRITA|COOPER RITA|FROTA PROPRIA|CARROS? DA CASA/.test(v)) || /\bCOOPERRITA\b/.test(combined)) return 'COOPERRITA';
  if (values.some(v => /TERCEIROS? FIXOS?|FROTA TERCEIRA/.test(v)) || values.some(v => v === 'TERCEIROS')) return 'TERCEIROS FIXOS';
  if (values.some(v => v === 'SPOT')) return 'SPOT';
  return '';
}
function externalFleetNumber(driver) {
  const text = norm(driver).replace(/[^A-Z0-9]+/g, ' '), cartSmart = text.match(/\bCART\s*SMART\s*0*(\d+)\b/), rs = text.match(/\bRS\s*0*(\d+)\b/);
  const match = cartSmart || rs; return match ? Number(match[1]) : null;
}
function resolveFleetCategory(fleet, driver) {
  if (fleet === 'COOPERRITA') return fleet;
  if (fleet !== 'TERCEIROS FIXOS' && fleet !== 'SPOT') return fleet;
  const number = externalFleetNumber(driver); return Number.isInteger(number) && number >= 1 && number <= 3 ? 'TERCEIROS FIXOS' : 'SPOT';
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
    const record = { date: findSheetDate(rows, sheet), sheet, source, fleet: resolveFleetCategory(fleet, driver), plate, driver, phone: clean(row[cols.phone]), shipment, city, overnight: cols.overnight >= 0 ? clean(row[cols.overnight]) : '' };
    if (!resemblesPlate(plate) || isContinuation(record) || (!hasValue(shipment) && !hasValue(city))) continue;
    record.id = `${source}|${sheet}|${record.fleet}|${r}|${plate}|${shipment}|${city}`; records.push(record);
  }
  return { records, foundHeader: true };
}
function extractHeaderTable(rows, source, sheet, fleet, header) {
  const cols = columnMap(rows[header]), records = []; let emptyStreak = 0;
  for (let r = header + 1; r < Math.min(rows.length, header + 45); r++) {
    const row = rows[r]; if (rowSignalsNewBlock(row) || isFleetHeader(row)) break;
    const plate = clean(row[cols.plate]), driver = clean(row[cols.driver]), shipment = clean(row[cols.shipment]), city = clean(row[cols.city]);
    const rowHasData = [plate, driver, shipment, city].some(hasValue); emptyStreak = rowHasData ? 0 : emptyStreak + 1; if (emptyStreak >= 5) break;
    const record = { date: findSheetDate(rows, sheet), sheet, source, fleet: resolveFleetCategory(fleet, driver), plate, driver, phone: clean(row[cols.phone]), shipment, city, overnight: cols.overnight >= 0 ? clean(row[cols.overnight]) : '' };
    if (!resemblesPlate(plate) || isContinuation(record) || (!hasValue(shipment) && !hasValue(city))) continue;
    record.id = `${source}|${sheet}|${record.fleet}|${r}|${plate}|${shipment}|${city}`; records.push(record);
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
  state.records = []; state.absences = []; state.audit = []; state.loadedKeys.clear(); state.crossAnalysis = null; state.driverPerformance = null; state.improvementAnalysis = null; state.activeTab = 'overview';
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
  const find = (exact, includes = []) => { for (const term of exact) { const index = values.findIndex(value => value === term); if (index >= 0) return index; } return includes.length ? values.findIndex(value => includes.every(term => value.includes(term))) : -1; };
  const detectedDeparture = find(['DATA SAIDA', 'DATA DE SAIDA'], ['DATA', 'SAIDA']), detectedReturn = find(['RETORNO ROTA', 'RETORNO DA ROTA'], ['RETORNO', 'ROTA']), detectedCostPerTon = find(['R$/TON', 'R$ / TON', 'R$ TON'], ['R$', 'TON']);
  return {
    shipment: find(['EMBARQUE'], ['EMBARQUE']), departure: detectedDeparture >= 0 ? detectedDeparture : 1, plate: find(['PLACA'], ['PLACA']), carrier: find(['TRANSPORTADORA'], ['TRANSPORTADORA']),
    profile: find(['PERFIL'], ['PERFIL']), capacity: find(['CAPACIDADE'], ['CAPACIDADE']), route: find(['ROTA'], ['ROTA']), seller: find(['VENDEDOR'], ['VENDEDOR']), totalTons: find(['TOTAL TONS', 'TOTAL TON'], ['TOTAL', 'TON']),
    occupation: find(['OCUPACAO'], ['OCUPACAO']), revenue: find(['TOTAL FATURAMENTO'], ['TOTAL', 'FATURAMENTO']), returnDate: detectedReturn >= 0 ? detectedReturn : 17,
    leadTime: find(['LEAD TIME DA ROTA', 'LEAD TIME ROTA'], ['LEAD TIME', 'ROTA']), km: find(['KM ROTA', 'KM DA ROTA'], ['KM', 'ROTA']), cost: find(['CUSTO ROTA', 'CUSTO DA ROTA'], ['CUSTO', 'ROTA']),
    costPerTon: detectedCostPerTon >= 0 ? detectedCostPerTon : 31, costPerTonHeader: detectedCostPerTon, costPerKg: find(['R$/KG', 'R$ / KG'], ['R$/KG'])
  };
}
function rowValue(row, column) { return column >= 0 && column < row.length ? row[column] : ''; }
function costCandidateScore(record) { return ['costPerTon','cost','revenue','route','plate','departureDate','returnDate','km'].reduce((score, field) => score + (record[field] !== null && hasValue(record[field]) ? 1 : 0), 0); }
function extractCostRecords(rows, headerIndex, headers, sourceSheet = '') {
  const columns = costColumnMap(headers), candidates = new Map();
  if (headerIndex < 0 || columns.shipment < 0) return { records: [], columns, duplicates: [], sourceRows: 0 };
  let sourceRows = 0;
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const shipments = shipmentKeys(rowValue(row, columns.shipment)); if (!shipments.length) return; sourceRows++;
    const allocation = shipments.length;
    const rawRevenue = parseLocaleNumber(rowValue(row, columns.revenue)), rawCost = parseLocaleNumber(rowValue(row, columns.cost)), rawTotalTons = parseLocaleNumber(rowValue(row, columns.totalTons)), sheetCostPerTon = parseLocaleNumber(rowValue(row, columns.costPerTon));
    const calculatedCostPerTon = Number.isFinite(rawCost) && Number.isFinite(rawTotalTons) && rawTotalTons > 0 ? rawCost / rawTotalTons * 1000 : null;
    const departureDate = isoDateValue(rowValue(row, columns.departure)), returnDate = isoDateValue(rowValue(row, columns.returnDate));
    const leadTime = parseLocaleNumber(rowValue(row, columns.leadTime)), dateDuration = daysBetween(departureDate, returnDate);
    const base = {
      sourceSheet: clean(sourceSheet), sourceRow: headerIndex + offset + 2, sourceShipment: clean(rowValue(row, columns.shipment)), departureDate, returnDate,
      plate: clean(rowValue(row, columns.plate)), carrier: clean(rowValue(row, columns.carrier)), profile: clean(rowValue(row, columns.profile)), capacity: clean(rowValue(row, columns.capacity)),
      route: clean(rowValue(row, columns.route)), seller: clean(rowValue(row, columns.seller)), totalTons: rawTotalTons, occupation: parseLocaleNumber(rowValue(row, columns.occupation)),
      revenue: rawRevenue === null ? null : roundedMoney(rawRevenue / allocation), cost: rawCost === null ? null : roundedMoney(rawCost / allocation), km: parseLocaleNumber(rowValue(row, columns.km)),
      costPerTon: sheetCostPerTon ?? calculatedCostPerTon, costPerTonSource: sheetCostPerTon !== null ? 'sheet' : (calculatedCostPerTon !== null ? 'formula' : ''), costPerKg: parseLocaleNumber(rowValue(row, columns.costPerKg)), sharedShipments: allocation,
      durationDays: dateDuration !== null ? dateDuration : (leadTime !== null && leadTime >= 0 ? Math.round(leadTime * 10) / 10 : null), durationSource: dateDuration !== null ? 'dates' : (leadTime !== null && leadTime >= 0 ? 'lead-time' : '')
    };
    shipments.forEach(shipment => { const record = { ...base, shipment }; if (!candidates.has(shipment)) candidates.set(shipment, []); candidates.get(shipment).push(record); });
  });
  const duplicates = [], records = [];
  candidates.forEach((items, shipment) => {
    if (items.length > 1) duplicates.push({ shipment, sheet: clean(sourceSheet), rows: items.map(item => item.sourceRow) });
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
function buildCrossAnalysis() {
  if (!state.costBase) { state.crossAnalysis = null; return null; }
  const routeIndex = new Map();
  state.records.forEach(record => shipmentKeys(record.shipment).forEach(shipment => { if (!routeIndex.has(shipment)) routeIndex.set(shipment, []); routeIndex.get(shipment).push(record); }));
  const costRecords = state.costBase.costRecords || [], costMap = new Map(costRecords.map(record => [record.shipment, record])), matchedRows = [], costOnlyRows = [];
  costRecords.forEach(costRecord => {
    const candidates = routeIndex.get(costRecord.shipment) || [], routeRecord = bestRouteMatch(costRecord, candidates);
    const common = { shipment: costRecord.shipment, costDate: costRecord.departureDate, routeDate: routeRecord?.date || '', date: costRecord.departureDate || routeRecord?.date || '', fleet: routeRecord?.fleet || '', plate: routeRecord?.plate || costRecord.plate, driver: routeRecord?.driver || '', route: costRecord.route || routeRecord?.city || '', dailyRoute: routeRecord?.city || '', carrier: costRecord.carrier, profile: costRecord.profile, capacity: costRecord.capacity, seller: costRecord.seller, totalTons: costRecord.totalTons, occupation: costRecord.occupation, revenue: costRecord.revenue, cost: costRecord.cost, km: costRecord.km, costPerTon: costRecord.costPerTon, costPerTonSource: costRecord.costPerTonSource || '', costPerKg: costRecord.costPerKg, departureDate: costRecord.departureDate, returnDate: costRecord.returnDate, durationDays: costRecord.durationDays, durationSource: costRecord.durationSource || '', costSourceSheet: costRecord.sourceSheet || '', costSourceRow: costRecord.sourceRow, duplicateRows: costRecord.duplicateRows, sharedShipments: costRecord.sharedShipments, routeMatches: candidates.length, routeSource: routeRecord?.source || '', routeSheet: routeRecord?.sheet || '' };
    if (routeRecord) matchedRows.push({ ...common, status: 'matched' }); else costOnlyRows.push({ ...common, status: 'cost-only' });
  });
  const routeOnlyRows = [];
  routeIndex.forEach((candidates, shipment) => {
    if (costMap.has(shipment)) return; const routeRecord = [...candidates].sort((a,b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id))[0];
    routeOnlyRows.push({ shipment, date: routeRecord.date, routeDate: routeRecord.date, costDate: '', fleet: routeRecord.fleet, plate: routeRecord.plate, driver: routeRecord.driver, route: routeRecord.city, dailyRoute: routeRecord.city, carrier: '', profile: '', capacity: '', seller: '', totalTons: null, occupation: null, revenue: null, cost: null, km: null, costPerTon: null, costPerTonSource: '', costPerKg: null, departureDate: '', returnDate: '', durationDays: null, routeMatches: candidates.length, routeSource: routeRecord.source, routeSheet: routeRecord.sheet, status: 'route-only' });
  });
  const allRows = [...matchedRows, ...routeOnlyRows, ...costOnlyRows].sort((a,b) => String(a.departureDate || a.date).localeCompare(String(b.departureDate || b.date)) || Number(a.shipment) - Number(b.shipment));
  const routeProfiles = enrichRouteDistances(allRows), matchedRouteKeys = new Set(matchedRows.map(routeProfileKey).filter(Boolean));
  state.crossAnalysis = { matchedRows, routeOnlyRows, costOnlyRows, allRows, routeProfiles: routeProfiles.filter(profile => matchedRouteKeys.has(profile.key)), routeUniqueCount: routeIndex.size, costUniqueCount: costRecords.length, duplicateCosts: state.costBase.duplicates || [], columns: state.costBase.columns || {} };
  return state.crossAnalysis;
}
function finiteSum(rows, field) { return roundedMoney(rows.reduce((sum, row) => sum + (Number.isFinite(row[field]) ? row[field] : 0), 0)) || 0; }
function finiteAverage(rows, field) { const values = rows.map(row => row[field]).filter(Number.isFinite); return values.length ? roundedMoney(values.reduce((sum, value) => sum + value, 0) / values.length) : null; }
function finiteMinimum(rows, field) { const values = rows.map(row => row[field]).filter(Number.isFinite); return values.length ? Math.min(...values) : null; }
function finiteMaximum(rows, field) { const values = rows.map(row => row[field]).filter(Number.isFinite); return values.length ? Math.max(...values) : null; }
function financialGroups(rows, field) {
  const groups = new Map();
  rows.forEach(row => { const label = clean(row[field]); if (!label) return; const key = norm(label); if (!groups.has(key)) groups.set(key, { key, label, shipments: 0, costCount: 0, revenueCount: 0, costPerTonCount: 0, durationCount: 0, cost: 0, revenue: 0, costPerTonTotal: 0, costPerTonMin: null, costPerTonMax: null, durationTotal: 0, durationMax: null }); const group = groups.get(key); group.shipments++;
    if (Number.isFinite(row.cost)) { group.cost += row.cost; group.costCount++; } if (Number.isFinite(row.revenue)) { group.revenue += row.revenue; group.revenueCount++; } if (Number.isFinite(row.costPerTon)) { group.costPerTonTotal += row.costPerTon; group.costPerTonCount++; group.costPerTonMin = Math.min(group.costPerTonMin ?? row.costPerTon, row.costPerTon); group.costPerTonMax = Math.max(group.costPerTonMax ?? row.costPerTon, row.costPerTon); }
    if (Number.isFinite(row.durationDays)) { group.durationTotal += row.durationDays; group.durationCount++; group.durationMax = Math.max(group.durationMax ?? row.durationDays, row.durationDays); }
  });
  return [...groups.values()].map(group => ({ ...group, cost: roundedMoney(group.cost) || 0, revenue: roundedMoney(group.revenue) || 0, averageCostPerTon: group.costPerTonCount ? roundedMoney(group.costPerTonTotal / group.costPerTonCount) : null, averageDuration: group.durationCount ? Math.round(group.durationTotal / group.durationCount * 10) / 10 : null }));
}
function percent(value) { return Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'; }
function numberPt(value, digits = 1) { return Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—'; }
function moneyOrDash(value) { return Number.isFinite(value) ? money(value) : '—'; }
function durationLabel(value) { return Number.isFinite(value) ? `${numberPt(value, 1)} dia${value === 1 ? '' : 's'}` : '—'; }
function financialStatusLabel(status) { return status === 'matched' ? 'Cruzado' : status === 'route-only' ? 'Sem base de valores' : 'Sem rota'; }
function financialStatusClass(status) { return status === 'matched' ? 'financial-ok' : status === 'route-only' ? 'financial-warning' : 'financial-missing'; }
function setCostSheetModal(open) { $('costSheetModal').classList.toggle('hidden', !open); document.documentElement.classList.toggle('cost-sheet-open', open); document.body.classList.toggle('cost-sheet-open', open); }
function costBaseSheetNames(base = state.costBase) { return base ? (base.sheetNames?.length ? base.sheetNames : [base.sheetName].filter(Boolean)) : []; }
function costBaseLabel(base = state.costBase) { return costBaseSheetNames(base).map(clean).join(' + '); }
function renderCostSheetOptions() {
  const pending = state.pendingCost; if (!pending) return;
  $('costSheetOptions').innerHTML = pending.names.map((name, index) => `<label class="cost-sheet-option"><input type="checkbox" data-cost-sheet-index="${index}" ${pending.selectedIndexes.has(index) ? 'checked' : ''}/><span><strong>${escapeHtml(costSheetOptionLabel(name))}</strong><small>${escapeHtml(name)}</small></span></label>`).join('');
  const count = pending.selectedIndexes.size; $('costSelectedCount').textContent = count ? `${count} aba${count === 1 ? '' : 's'} selecionada${count === 1 ? '' : 's'}` : 'Nenhuma aba selecionada'; $('confirmCostSheet').disabled = !count;
}
function selectPendingCostSheets(indexes) {
  const pending = state.pendingCost; if (!pending) return;
  pending.selectedIndexes = new Set(indexes.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < pending.names.length)); renderCostSheetOptions();
}
function updatePendingCostSheet(index, checked) {
  const pending = state.pendingCost; if (!pending || !Number.isInteger(index) || index < 0 || index >= pending.names.length) return;
  if (checked) pending.selectedIndexes.add(index); else pending.selectedIndexes.delete(index);
  const count = pending.selectedIndexes.size; $('costSelectedCount').textContent = count ? `${count} aba${count === 1 ? '' : 's'} selecionada${count === 1 ? '' : 's'}` : 'Nenhuma aba selecionada'; $('confirmCostSheet').disabled = !count;
}
function openCostSheetPicker(workbook, fileName) {
  const detected = detectedCostSheets(workbook); if (!detected.names.length) throw new Error('O arquivo não possui abas para selecionar.');
  const previousNames = state.costBase?.fileName === fileName ? costBaseSheetNames() : [], selectedIndexes = new Set(detected.names.map((name, index) => previousNames.includes(name) ? index : -1).filter(index => index >= 0));
  if (!selectedIndexes.size) selectedIndexes.add(0);
  state.pendingCost = { workbook, fileName, names: detected.names, automatic: detected.automatic, selectedIndexes };
  renderCostSheetOptions(); $('costSheetFileName').textContent = fileName; $('costSheetHelp').textContent = detected.automatic ? `${detected.names.length} ${detected.names.length === 1 ? 'base mensal reconhecida' : 'bases mensais reconhecidas'}. Marque uma ou várias abas para consolidar.` : 'Não foi possível reconhecer automaticamente uma base mensal. Marque uma ou várias abas disponíveis.';
  setCostSheetModal(true); $('costSheetOptions').focus?.({ preventScroll: true });
}
async function prepareCostFile(file) {
  if (!file) return;
  if (!window.XLSX) { showToast('Não foi possível carregar o leitor de Excel. Verifique sua conexão e tente novamente.'); return; }
  const previousStatus = state.costBase ? `${state.costBase.fileName} • ${costBaseSheetNames().length} aba${costBaseSheetNames().length === 1 ? '' : 's'} • ${state.costBase.recordCount} embarque${state.costBase.recordCount === 1 ? '' : 's'}` : 'Nenhuma base de valores importada';
  $('costImportStatus').textContent = `Analisando as abas de ${file.name}...`;
  try { const data = await file.arrayBuffer(), workbook = XLSX.read(data, { type: 'array', cellDates: true }); openCostSheetPicker(workbook, file.name); $('costImportStatus').textContent = `${file.name} • escolha uma ou mais abas para concluir`; }
  catch (error) { $('costImportStatus').textContent = previousStatus; showToast(`Não foi possível ler a base de valores: ${error.message}`); }
}
function closeCostSheetPicker() { setCostSheetModal(false); state.pendingCost = null; renderCostBaseStatus(); }
function renderCostBaseStatus() {
  const base = state.costBase;
  if (!base) { $('costImportStatus').textContent = 'Nenhuma base de valores importada'; $('costImportSummary').classList.add('hidden'); $('changeCostSheet').hidden = true; return; }
  const names = costBaseSheetNames(base), sheetCount = names.length; $('costImportStatus').textContent = `${base.fileName} • ${sheetCount} aba${sheetCount === 1 ? '' : 's'} • ${base.recordCount} embarque${base.recordCount === 1 ? '' : 's'}`;
  const headerCount = base.headers.filter(Boolean).length, hasTonValues = base.costRecords?.some(record => Number.isFinite(record.costPerTon)), hasTonHeader = base.sheets?.some(sheet => sheet.columns?.costPerTonHeader >= 0) ?? base.columns?.costPerTonHeader >= 0, tonReady = hasTonValues ? (hasTonHeader ? 'Cabeçalho R$/TON detectado' : 'R$/TON calculado pela fórmula da planilha') : 'R$/TON sem valores válidos'; $('costBaseSheet').textContent = costBaseLabel(base); $('costBaseDetails').textContent = `${sheetCount} aba${sheetCount === 1 ? '' : 's'} consolidada${sheetCount === 1 ? '' : 's'} • ${base.recordCount} embarque${base.recordCount === 1 ? '' : 's'} único${base.recordCount === 1 ? '' : 's'} • ${headerCount} cabeçalho${headerCount === 1 ? '' : 's'} • ${tonReady}`;
  $('costImportSummary').classList.remove('hidden'); $('changeCostSheet').hidden = false;
}
function parseCostSheet(workbook, sheetName) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: false, dateNF: 'dd/mm/yyyy' });
  let headerIndex = costHeaderIndex(rows); if (headerIndex < 0) headerIndex = costHeaderIndex(rows, false);
  const headers = headerIndex >= 0 ? rows[headerIndex].map(clean) : []; if (headerIndex < 0 || !headers.some(header => norm(header) === 'EMBARQUE')) throw new Error(`o cabeçalho EMBARQUE não foi localizado em ${clean(sheetName)}`);
  const parsed = extractCostRecords(rows, headerIndex, headers, sheetName); return { sheetName, rows, headerIndex, headers, ...parsed };
}
function mergeCostSheetBases(sheetBases) {
  const candidates = new Map();
  sheetBases.forEach((base, sheetOrder) => base.records.forEach(record => { if (!candidates.has(record.shipment)) candidates.set(record.shipment, []); candidates.get(record.shipment).push({ ...record, sheetOrder }); }));
  const records = [], duplicates = [];
  candidates.forEach((items, shipment) => {
    const occurrenceCount = items.reduce((sum, item) => sum + Math.max(1, Number(item.duplicateRows) || 1), 0), selected = [...items].sort((a,b) => costCandidateScore(b) - costCandidateScore(a) || a.sheetOrder - b.sheetOrder || a.sourceRow - b.sourceRow)[0];
    if (occurrenceCount > 1) duplicates.push({ shipment, sheets: [...new Set(items.map(item => item.sourceSheet).filter(Boolean))], rows: items.map(item => ({ sheet: item.sourceSheet, row: item.sourceRow })) });
    const { sheetOrder, ...cleanRecord } = selected; records.push({ ...cleanRecord, duplicateRows: occurrenceCount });
  });
  records.sort((a,b) => Number(a.shipment) - Number(b.shipment) || a.shipment.localeCompare(b.shipment)); return { records, duplicates };
}
function confirmCostSheetImport() {
  const pending = state.pendingCost, selectedIndexes = pending ? [...pending.selectedIndexes].sort((a,b) => a - b) : [], sheetNames = selectedIndexes.map(index => pending.names[index]).filter(Boolean); if (!pending || !sheetNames.length) return showToast('Marque pelo menos uma aba válida para importar.');
  try {
    const sheetBases = sheetNames.map(sheetName => parseCostSheet(pending.workbook, sheetName)), merged = mergeCostSheetBases(sheetBases), first = sheetBases[0];
    const headerMap = new Map(); sheetBases.flatMap(base => base.headers).filter(Boolean).forEach(header => { const key = norm(header); if (!headerMap.has(key)) headerMap.set(key, header); });
    const columnKeys = [...new Set(sheetBases.flatMap(base => Object.keys(base.columns || {})))], columns = Object.fromEntries(columnKeys.map(key => [key, sheetBases.some(base => base.columns?.[key] >= 0) ? 0 : -1]));
    state.costBase = { fileName: pending.fileName, sheetName: sheetNames.join(' + '), sheetNames, sheets: sheetBases, rows: first.rows, headerIndex: first.headerIndex, headers: [...headerMap.values()], recordCount: merged.records.length, costRecords: merged.records, columns, duplicates: merged.duplicates, sourceRows: sheetBases.reduce((sum, base) => sum + base.sourceRows, 0), missingTonSheets: sheetBases.filter(base => !base.records.some(record => Number.isFinite(record.costPerTon))).map(base => base.sheetName) }; state.costWorkbook = pending.workbook; state.costFileName = pending.fileName; state.crossAnalysis = null; state.driverPerformance = null; state.improvementAnalysis = null;
    setCostSheetModal(false); state.pendingCost = null; renderCostBaseStatus(); if (state.records.length) render(); showToast(`${sheetNames.length} aba${sheetNames.length === 1 ? '' : 's'} importada${sheetNames.length === 1 ? '' : 's'} e consolidada${sheetNames.length === 1 ? '' : 's'} sem duplicar embarques.`);
  } catch (error) { showToast(`Não foi possível importar as abas escolhidas: ${error.message}`); }
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
const PERFORMANCE_WEIGHTS = Object.freeze({ FALTA: 5, ATESTADO: 3, NEAR_DELAY: 3, HIGH_TON: 2 });
const COMPANY_ORIGIN = 'Santa Rita do Sapucaí/MG', PERFORMANCE_HIGH_TON_FACTOR = 1.25;
function driverRouteKey(value) { return norm(value).replace(/\bCART\s*SMART\s*0*(\d+)\b/g, 'CARTSMART$1').replace(/\bRS\s*0*(\d+)\b/g, 'RS$1').replace(/[^A-Z0-9]+/g, ' ').trim(); }
function driverPersonName(value) { const original = clean(value), withoutPrefix = original.replace(/^(?:CART\s*SMART|RS)\s*0*\d*\s*(?:[-–—:|]\s*)?/i, ''); return clean(withoutPrefix) || original; }
function driverPersonKey(value) { return norm(driverPersonName(value)).replace(/[^A-Z0-9]+/g, ' ').trim(); }
function median(values) { const sorted = values.filter(Number.isFinite).sort((a,b) => a - b); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
const TON_DISTANCE_BANDS = Object.freeze([
  { key: 'D120', label: 'Muito próxima', detail: 'até 120 km de percurso típico', min: 0, max: 120, category: 'near', expectedDays: 1, rank: 0 },
  { key: 'D250', label: 'Próxima', detail: '121 a 250 km de percurso típico', min: 120, max: 250, category: 'near', expectedDays: 1, rank: 1 },
  { key: 'D500', label: 'Regional', detail: '251 a 500 km de percurso típico', min: 250, max: 500, category: 'far', expectedDays: 2, rank: 2 },
  { key: 'D500P', label: 'Longa', detail: 'acima de 500 km de percurso típico', min: 500, max: Infinity, category: 'far', expectedDays: 3, rank: 3 }
]);
const ROUTE_DISTANCE_OVERRIDES = Object.freeze({
  'SANTA RITA DO SAPUCAI': 'D120', 'POUSO ALEGRE': 'D120', 'CACHOEIRA DE MINAS': 'D120', 'PEDRALVA': 'D120', 'PIRANGUINHO': 'D120',
  'SAO SEBASTIAO DA BELA VISTA': 'D120', 'ITAJUBA': 'D250', 'BRASOPOLIS': 'D250', 'CONGONHAL': 'D250', 'CONCEICAO DOS OUROS': 'D250',
  'CAREACU': 'D250', 'CAMBUI': 'D250', 'HELIODORA': 'D250', 'BORDA DA MATA': 'D250', 'PARAISOPOLIS': 'D250', 'CRISTINA': 'D250',
  'DELFIM MOREIRA': 'D250', 'CONCEICAO DAS PEDRAS': 'D250', 'CONSOLACAO': 'D250', 'BELO HORIZONTE': 'D500P'
});
function tonDistanceBand(km) { return Number.isFinite(km) && km > 0 ? TON_DISTANCE_BANDS.find(band => km > band.min && km <= band.max) || null : null; }
function distanceBandByKey(key) { return TON_DISTANCE_BANDS.find(band => band.key === key) || null; }
function routeProfileKey(row) { return norm(row?.route || row?.dailyRoute || '').replace(/[^A-Z0-9]+/g, ' ').trim(); }
function routeDistanceOverride(route) {
  const routeKey = norm(route).replace(/[^A-Z0-9]+/g, ' ').trim(); if (!routeKey) return null;
  return Object.entries(ROUTE_DISTANCE_OVERRIDES).reduce((selected, [city, bandKey]) => {
    if (!(routeKey === city || routeKey.includes(city))) return selected; const band = distanceBandByKey(bandKey);
    return !selected || band.rank > selected.rank ? band : selected;
  }, null);
}
function buildRouteDistanceProfiles(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = routeProfileKey(row); if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, label: clean(row.route || row.dailyRoute), rows: [], kms: [] });
    const group = groups.get(key); group.rows.push(row); if (Number.isFinite(row.km) && row.km > 0) group.kms.push(row.km);
  });
  return [...groups.values()].map(group => {
    const referenceKm = median(group.kms), measuredBand = tonDistanceBand(referenceKm), overrideBand = routeDistanceOverride(group.label), band = overrideBand || measuredBand;
    return { ...group, tripCount: group.rows.length, referenceKm, measuredBand, band, source: group.kms.length >= 2 ? 'route-median' : group.kms.length ? 'sheet-km' : overrideBand ? 'geographic-rule' : '', warning: Boolean(overrideBand && measuredBand && overrideBand.key !== measuredBand.key) };
  });
}
function enrichRouteDistances(rows) {
  const profiles = buildRouteDistanceProfiles(rows), byKey = new Map(profiles.map(profile => [profile.key, profile]));
  rows.forEach(row => {
    const profile = byKey.get(routeProfileKey(row)), fallbackBand = routeDistanceOverride(row.route || row.dailyRoute) || tonDistanceBand(row.km), band = profile?.band || fallbackBand;
    row.distanceKm = profile?.referenceKm ?? (Number.isFinite(row.km) ? row.km : null); row.distanceBandKey = band?.key || ''; row.distanceBandLabel = band?.label || ''; row.distanceCategory = band?.category || ''; row.distanceExpectedDays = band?.expectedDays ?? null; row.distanceSource = profile?.source || ''; row.distanceWarning = Boolean(profile?.warning); row.distanceOrigin = COMPANY_ORIGIN;
  });
  return profiles;
}
function routeDistanceBand(row) { return distanceBandByKey(row?.distanceBandKey) || routeDistanceOverride(row?.route || row?.dailyRoute) || tonDistanceBand(row?.distanceKm ?? row?.km); }
function tonBenchmarkKey(row) { const band = routeDistanceBand(row); return row.fleet && band ? `${row.fleet}|${band.key}` : ''; }
function buildTonBenchmarks(rows) {
  if (rows.some(row => !row.distanceBandKey)) enrichRouteDistances(rows); const groups = new Map();
  rows.forEach(row => { const key = tonBenchmarkKey(row); if (!key || !Number.isFinite(row.costPerTon) || row.costPerTon <= 0) return; const band = routeDistanceBand(row); if (!groups.has(key)) groups.set(key, { key, fleet: row.fleet, band, costPerTonValues: [], durationValues: [] }); const group = groups.get(key); group.costPerTonValues.push(row.costPerTon); if (Number.isFinite(row.durationDays)) group.durationValues.push(row.durationDays); });
  return new Map([...groups].map(([key, group]) => { const durationMedian = median(group.durationValues), durationLimit = Number.isFinite(durationMedian) ? Math.min(durationMedian, group.band.expectedDays) : group.band.expectedDays; return [key, { key, fleet: group.fleet, band: group.band, trips: group.costPerTonValues.length, costPerTonMedian: median(group.costPerTonValues), durationMedian, durationLimit }]; }));
}
function tonDriverStatus(index, trips) {
  if (!Number.isFinite(index) || !trips) return { label: 'Dados insuficientes', className: 'quality-missing' };
  if (trips < 2) return { label: 'Amostra inicial', className: 'quality-sample' };
  if (index <= 85) return { label: 'Excelente', className: 'quality-good' };
  if (index <= 100) return { label: 'Bom', className: 'ton-rating-good' };
  if (index <= 125) return { label: 'Atenção', className: 'quality-watch' };
  return { label: 'Ruim', className: 'quality-bad' };
}
function buildDriverTonAnalysis(rows) {
  const candidates = rows.filter(row => clean(row.driver) && ['COOPERRITA', 'TERCEIROS FIXOS'].includes(row.fleet)), benchmarks = buildTonBenchmarks(candidates), groups = new Map();
  candidates.forEach(row => {
    const driverKey = driverRouteKey(row.driver); if (!driverKey) return; const key = `${row.fleet}|${driverKey}`;
    if (!groups.has(key)) groups.set(key, { key, driverKey, name: clean(row.driver), fleet: row.fleet, allRows: [], tonRows: [], evaluations: [] });
    const group = groups.get(key); group.allRows.push(row); if (Number.isFinite(row.costPerTon) && row.costPerTon > 0) group.tonRows.push(row);
    const benchmark = benchmarks.get(tonBenchmarkKey(row)); if (!benchmark || !Number.isFinite(row.costPerTon) || row.costPerTon <= 0 || !Number.isFinite(benchmark.costPerTonMedian) || benchmark.costPerTonMedian <= 0) return;
    group.evaluations.push({ row, benchmark, ratio: row.costPerTon / benchmark.costPerTonMedian });
  });
  const drivers = [...groups.values()].map(group => {
    const trips = group.evaluations.length, totalTrips = group.allRows.length, incompleteTrips = totalTrips - trips, averageCostPerTon = finiteAverage(group.tonRows, 'costPerTon');
    const efficiencyIndex = trips ? Math.round(group.evaluations.reduce((sum, item) => sum + item.ratio, 0) / trips * 1000) / 10 : null, status = tonDriverStatus(efficiencyIndex, trips);
    const distanceLabels = [...new Set(group.evaluations.map(item => item.benchmark.band.label))];
    return { ...group, trips, totalTrips, incompleteTrips, costPerTonCount: group.tonRows.length, averageCostPerTon, efficiencyIndex, status, distanceLabels };
  }).sort((a,b) => Number(b.trips > 0) - Number(a.trips > 0) || (a.efficiencyIndex ?? Infinity) - (b.efficiencyIndex ?? Infinity) || b.trips - a.trips || (a.averageCostPerTon ?? Infinity) - (b.averageCostPerTon ?? Infinity) || a.name.localeCompare(b.name, 'pt-BR'));
  return { candidates, benchmarks, drivers };
}
function buildDriverPerformance(analysis = state.crossAnalysis) {
  const groups = new Map(), ensureGroup = driver => {
    const key = driverRouteKey(driver); if (!key) return null;
    if (!groups.has(key)) groups.set(key, { key, name: clean(driver), personKey: driverPersonKey(driver), fleets: new Set(), routeRecords: [], financialRows: [], absences: [] }); return groups.get(key);
  };
  state.records.forEach(record => { const group = ensureGroup(record.driver); if (!group) return; group.routeRecords.push(record); if (record.fleet) group.fleets.add(record.fleet); });
  const matchedRows = analysis?.matchedRows || []; matchedRows.forEach(row => { const group = ensureGroup(row.driver); if (!group) return; group.financialRows.push(row); if (row.fleet) group.fleets.add(row.fleet); });
  const byPerson = new Map(); groups.forEach(group => { if (!group.personKey) return; if (!byPerson.has(group.personKey)) byPerson.set(group.personKey, []); byPerson.get(group.personKey).push(group); });
  let linkedAbsences = 0; state.absences.filter(item => item.type === 'FALTA' || item.type === 'ATESTADO').forEach(item => { const candidates = byPerson.get(driverPersonKey(item.employee)) || []; if (candidates.length === 1) { candidates[0].absences.push(item); linkedAbsences++; } });
  const tonBenchmarks = buildTonBenchmarks(matchedRows);
  const drivers = [...groups.values()].map(group => {
    const events = [], addEvent = (type, label, points, source, metric) => events.push({ type, label, points, date: source.date || source.costDate || '', shipment: source.shipment || '', route: source.route || source.city || '', fleet: source.fleet || '', metric, source });
    group.absences.forEach(item => addEvent(item.type, ABSENCE_LABELS[item.type], PERFORMANCE_WEIGHTS[item.type], item, `${ABSENCE_LABELS[item.type]} registrada na planilha`));
    group.financialRows.forEach(row => {
      const distanceBand = routeDistanceBand(row);
      if (distanceBand?.category === 'near' && Number.isFinite(row.durationDays) && row.durationDays > distanceBand.expectedDays) addEvent('NEAR_DELAY', 'Rota curta demorada', PERFORMANCE_WEIGHTS.NEAR_DELAY, row, `${distanceBand.label} desde ${COMPANY_ORIGIN} • ${numberPt(row.distanceKm ?? row.km, 1)} km típicos • ${durationLabel(row.durationDays)} (esperado até ${distanceBand.expectedDays} dia${distanceBand.expectedDays === 1 ? '' : 's'})`);
      const benchmark = tonBenchmarks.get(tonBenchmarkKey(row)), threshold = Number.isFinite(benchmark?.costPerTonMedian) ? benchmark.costPerTonMedian * PERFORMANCE_HIGH_TON_FACTOR : null;
      if (Number.isFinite(row.costPerTon) && Number.isFinite(threshold) && row.costPerTon > threshold) addEvent('HIGH_TON', 'R$/ton elevado', PERFORMANCE_WEIGHTS.HIGH_TON, row, `${money(row.costPerTon)}/ton • limite ${money(threshold)}/ton • ${benchmark.band.label}`);
    });
    const counts = { faltas: events.filter(event => event.type === 'FALTA').length, atestados: events.filter(event => event.type === 'ATESTADO').length, nearDelays: events.filter(event => event.type === 'NEAR_DELAY').length, highTon: events.filter(event => event.type === 'HIGH_TON').length };
    const tonRows = group.financialRows.filter(row => Number.isFinite(row.costPerTon) && row.costPerTon > 0), averageCostPerTon = finiteAverage(tonRows, 'costPerTon');
    const score = events.reduce((sum, event) => sum + event.points, 0), routeUses = group.routeRecords.length, scorePer10Uses = routeUses ? Math.round(score / routeUses * 1000) / 100 : score * 10;
    return { ...group, fleets: [...group.fleets], events: events.sort((a,b) => b.points - a.points || String(a.date).localeCompare(String(b.date))), counts, score, routeUses, scorePer10Uses, costPerTonCount: tonRows.length, averageCostPerTon };
  }).sort((a,b) => b.score - a.score || b.scorePer10Uses - a.scorePer10Uses || a.name.localeCompare(b.name, 'pt-BR'));
  state.driverPerformance = { drivers, matchedTrips: matchedRows.length, linkedAbsences, relevantAbsences: state.absences.filter(item => item.type === 'FALTA' || item.type === 'ATESTADO').length, tonBenchmarks };
  return state.driverPerformance;
}
function performanceBreakdown(driver) {
  const parts = []; if (driver.counts.faltas) parts.push(`${driver.counts.faltas} falta${driver.counts.faltas === 1 ? '' : 's'}`); if (driver.counts.atestados) parts.push(`${driver.counts.atestados} atestado${driver.counts.atestados === 1 ? '' : 's'}`); if (driver.counts.nearDelays) parts.push(`${driver.counts.nearDelays} rota${driver.counts.nearDelays === 1 ? '' : 's'} curta${driver.counts.nearDelays === 1 ? '' : 's'} demorada${driver.counts.nearDelays === 1 ? '' : 's'}`); if (driver.counts.highTon) parts.push(`${driver.counts.highTon} R$/ton elevado${driver.counts.highTon === 1 ? '' : 's'}`); return parts.join(' • ');
}
function performanceTonLabel(driver) { return driver.costPerTonCount ? `R$/ton médio: ${money(driver.averageCostPerTon)}` : 'R$/ton médio: sem valor no campo R$/TON'; }
function renderDriverPerformance() {
  const performance = buildDriverPerformance(state.crossAnalysis), ranked = performance.drivers.filter(driver => driver.score > 0).slice(0, 10);
  $('performanceRanking').innerHTML = ranked.length ? ranked.map((driver, index) => `<li><button class="performance-ranking-action" data-performance-driver="${escapeHtml(driver.key)}"><span class="ranking-position">${index + 1}</span><span class="performance-driver"><strong>${escapeHtml(driver.name)}</strong><small>${escapeHtml(driver.fleets.map(fleet => FLEETS[fleet] || fleet).join(' • ') || 'Frota não informada')} • ${driver.routeUses} uso${driver.routeUses === 1 ? '' : 's'}</small><em>${escapeHtml(performanceBreakdown(driver))}</em></span><span class="performance-score"><b>${driver.score} pts</b><small>${numberPt(driver.scorePer10Uses, 1)} / 10 usos</small><small class="performance-ton">${escapeHtml(performanceTonLabel(driver))}</small></span></button></li>`).join('') : '<li class="no-results">Nenhum motorista possui ocorrências suficientes para este indicador no período.</li>';
  $('performanceRankingCount').textContent = `${ranked.length} motorista${ranked.length === 1 ? '' : 's'} com pontos de atenção`;
  if (!state.costBase) $('performanceStatus').textContent = 'Importe a base de valores para incluir demora e R$/ton elevado. Por enquanto entram somente faltas e atestados vinculados.';
  else if (!performance.matchedTrips) $('performanceStatus').textContent = 'Nenhum embarque foi cruzado com as abas financeiras selecionadas. O ranking usa somente faltas e atestados vinculados.';
  else $('performanceStatus').textContent = `${performance.matchedTrips} ${performance.matchedTrips === 1 ? 'viagem cruzada' : 'viagens cruzadas'} • origem: ${COMPANY_ORIGIN} • R$/ton exibido = média por motorista • valor elevado = acima de 25% da mediana da mesma frota e distância comparável • ${performance.linkedAbsences} de ${performance.relevantAbsences} falta${performance.relevantAbsences === 1 ? '' : 's'}/atestado${performance.relevantAbsences === 1 ? '' : 's'} vinculados a motoristas.`;
}
const IMPROVEMENT_PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, opportunity: 2 });
const IMPROVEMENT_PRIORITY_LABELS = Object.freeze({ high: 'Prioridade alta', medium: 'Ajuste recomendado', opportunity: 'Oportunidade' });
function average(values) { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; }
function normalizedOccupation(value) { if (!Number.isFinite(value) || value <= 0) return null; if (value <= 1) return value; if (value <= 100) return value / 100; return null; }
function mostFrequentLabel(rows, field) {
  const counts = new Map(); rows.forEach(row => { const label = clean(row[field]); if (!label) return; const key = norm(label); if (!counts.has(key)) counts.set(key, { label, count: 0 }); counts.get(key).count++; });
  return [...counts.values()].sort((a,b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))[0] || null;
}
function buildImprovementIdeas(analysis = state.crossAnalysis) {
  const ideas = [], seenTitles = new Set(), addIdea = idea => {
    const titleKey = norm(idea.title); if (!titleKey || seenTitles.has(titleKey)) return; seenTitles.add(titleKey);
    ideas.push({ id: `idea-${ideas.length + 1}`, priority: 'medium', score: 0, area: 'Operação', ...idea });
  };
  const routeShipmentCount = new Set(state.records.flatMap(record => shipmentKeys(record.shipment))).size, matched = analysis?.matchedRows || [], routeCount = analysis?.routeUniqueCount ?? routeShipmentCount;
  const matchedCount = matched.length, coverage = routeCount ? matchedCount / routeCount : null;

  if (!state.costBase) addIdea({ priority: 'high', score: 100, area: 'Qualidade dos dados', title: 'Importar a base financeira do mesmo período', evidence: `${routeShipmentCount} embarque${routeShipmentCount === 1 ? '' : 's'} operacional${routeShipmentCount === 1 ? '' : 'is'} ainda sem cruzamento de R$/ton, custo e retorno.`, action: 'Importar as abas mensais correspondentes às rotas para liberar recomendações de custo, ocupação, prazo e eficiência.' });
  else {
    const routeOnly = analysis?.routeOnlyRows?.length || 0, costOnly = analysis?.costOnlyRows?.length || 0, missingTon = matched.filter(row => !Number.isFinite(row.costPerTon)).length, missingReturn = matched.filter(row => !isoDateValue(row.returnDate)).length;
    const distanceWarnings = (analysis?.allRows || []).filter(row => row.distanceWarning).length, duplicates = state.costBase.duplicates?.length || 0;
    if (!Number.isFinite(coverage) || coverage < .9 || missingTon || missingReturn || distanceWarnings || duplicates) {
      const evidence = [`${matchedCount} de ${routeCount} embarques cruzados${Number.isFinite(coverage) ? ` (${percent(coverage)})` : ''}`];
      if (routeOnly) evidence.push(`${routeOnly} sem base de valores`); if (costOnly) evidence.push(`${costOnly} custos sem rota`); if (missingTon) evidence.push(`${missingTon} sem R$/ton`); if (missingReturn) evidence.push(`${missingReturn} sem retorno`); if (distanceWarnings) evidence.push(`${distanceWarnings} KM incompatíveis`); if (duplicates) evidence.push(`${duplicates} duplicados`);
      const detailKind = routeOnly ? 'route-only' : costOnly ? 'cost-only' : matchedCount ? 'matched' : '';
      addIdea({ priority: !Number.isFinite(coverage) || coverage < .6 ? 'high' : 'medium', score: 95, area: 'Qualidade dos dados', title: 'Completar o cruzamento antes de decidir', evidence: evidence.join(' • '), action: 'Corrigir primeiro número do embarque, R$/TON, data de retorno e KM sinalizado. Isso evita recomendações baseadas em uma amostra incompleta.', detail: detailKind ? { mode: 'financial', kind: detailKind } : null });
    }
  }

  const spots = state.records.filter(record => record.fleet === 'SPOT'), spotShare = state.records.length ? spots.length / state.records.length : 0, spotByPlate = new Map();
  spots.forEach(record => { const key = norm(record.plate) || 'SEM PLACA'; if (!spotByPlate.has(key)) spotByPlate.set(key, { plate: clean(record.plate) || 'Sem placa', rows: [] }); spotByPlate.get(key).rows.push(record); });
  const recurringSpot = [...spotByPlate.values()].sort((a,b) => b.rows.length - a.rows.length || a.plate.localeCompare(b.plate, 'pt-BR'))[0];
  if (spots.length >= 3 && (spotShare >= .15 || (recurringSpot?.rows.length || 0) >= 3)) {
    const recurringRoute = recurringSpot ? mostFrequentLabel(recurringSpot.rows, 'city') : null;
    addIdea({ priority: spotShare >= .3 || (recurringSpot?.rows.length || 0) >= 5 ? 'high' : 'medium', score: 88, area: 'Dimensionamento da frota', title: 'Reduzir dependência de SPOT nas rotas recorrentes', evidence: `${spots.length} de ${state.records.length} utilizações foram SPOT (${percent(spotShare)}). ${recurringSpot ? `${recurringSpot.plate} apareceu ${recurringSpot.rows.length} vez${recurringSpot.rows.length === 1 ? '' : 'es'}${recurringRoute ? `; rota mais repetida: ${recurringRoute.label}` : ''}.` : ''}`, action: 'Simular a transferência das recorrências para carro da casa ou contrato fixo e comparar o R$/ton antes de renovar o uso avulso.', detail: { mode: 'operational', kind: 'SPOT' } });
  }

  const dailyGroups = new Map(); state.records.forEach(record => { const key = dailyRecordKey(record); if (!key) return; if (!dailyGroups.has(key)) dailyGroups.set(key, []); dailyGroups.get(key).push(record); });
  if (dailyGroups.size >= 3) {
    const days = [...dailyGroups].map(([day, rows]) => ({ day, rows, count: rows.length })).sort((a,b) => b.count - a.count), typical = median(days.map(day => day.count)), peak = days[0];
    if (peak && Number.isFinite(typical) && peak.count >= Math.max(3, typical * 1.35) && peak.count - typical >= 2) {
      const peakSpots = peak.rows.filter(row => row.fleet === 'SPOT').length;
      addIdea({ priority: peakSpots / peak.count >= .25 ? 'high' : 'medium', score: 72, area: 'Planejamento diário', title: `Nivelar o pico operacional de ${displayDate({ date: peak.day, sheet: peak.day })}`, evidence: `${peak.count} veículos-dia no pico contra mediana de ${numberPt(typical, 1)}; ${peakSpots} SPOT${peakSpots === 1 ? '' : 's'} nesse dia.`, action: 'Revisar janelas de carregamento e antecipar ou postergar embarques flexíveis para reduzir espera, hora extra e contratação emergencial.', detail: { mode: 'operational', kind: 'DAY', filter: peak.day } });
    }
  }

  if (matched.length) {
    const tonBenchmarks = buildTonBenchmarks(matched), routeStats = new Map();
    matched.forEach(row => {
      const benchmark = tonBenchmarks.get(tonBenchmarkKey(row)), routeKey = routeProfileKey(row); if (!routeKey || !Number.isFinite(row.costPerTon) || !Number.isFinite(benchmark?.costPerTonMedian) || benchmark.costPerTonMedian <= 0) return;
      if (!routeStats.has(routeKey)) routeStats.set(routeKey, { label: clean(row.route || row.dailyRoute), rows: [], ratios: [], values: [] }); const group = routeStats.get(routeKey); group.rows.push(row); group.ratios.push(row.costPerTon / benchmark.costPerTonMedian); group.values.push(row.costPerTon);
    });
    const expensiveRoute = [...routeStats.values()].map(group => ({ ...group, ratio: average(group.ratios), averageTon: average(group.values) })).filter(group => group.rows.length >= 2 && group.ratio >= 1.15).sort((a,b) => b.ratio - a.ratio || b.rows.length - a.rows.length)[0];
    if (expensiveRoute) addIdea({ priority: expensiveRoute.ratio >= 1.35 ? 'high' : 'medium', score: 90, area: 'R$/ton', title: `Atacar o custo elevado da rota ${expensiveRoute.label}`, evidence: `${expensiveRoute.rows.length} embarques • R$/ton médio ${money(expensiveRoute.averageTon)} • ${percent(expensiveRoute.ratio - 1)} acima da referência da mesma frota e distância.`, action: 'Conferir peso embarcado, ocupação, tipo de veículo, agrupamento de pedidos e custo contratado dessa rota antes da próxima programação.', detail: { mode: 'financial', kind: 'route', filter: expensiveRoute.label } });

    const internalByBand = new Map(); matched.filter(row => ['COOPERRITA','TERCEIROS FIXOS'].includes(row.fleet) && Number.isFinite(row.costPerTon)).forEach(row => { const band = routeDistanceBand(row); if (!band) return; if (!internalByBand.has(band.key)) internalByBand.set(band.key, []); internalByBand.get(band.key).push(row.costPerTon); });
    const spotComparisons = matched.filter(row => row.fleet === 'SPOT' && Number.isFinite(row.costPerTon)).map(row => { const band = routeDistanceBand(row), reference = band ? median(internalByBand.get(band.key) || []) : null; return Number.isFinite(reference) && reference > 0 ? { row, ratio: row.costPerTon / reference, reference } : null; }).filter(Boolean);
    const spotComparableRatio = average(spotComparisons.map(item => item.ratio));
    if (spotComparisons.length >= 2 && spotComparableRatio >= 1.15) {
      const topSpotRoute = mostFrequentLabel(spotComparisons.map(item => item.row), 'route');
      addIdea({ priority: spotComparableRatio >= 1.35 ? 'high' : 'medium', score: 87, area: 'SPOT', title: 'Migrar SPOTs caros para capacidade fixa quando possível', evidence: `${spotComparisons.length} viagens comparáveis • R$/ton dos SPOTs ${percent(spotComparableRatio - 1)} acima de casa/fixos na mesma faixa de distância${topSpotRoute ? ` • maior recorrência: ${topSpotRoute.label}` : ''}.`, action: 'Priorizar veículo próprio ou terceiro fixo nas recorrências e usar SPOT como contingência; validar disponibilidade e nível de serviço antes da mudança.', detail: { mode: 'financial', kind: 'spot' } });
    }

    const occupationRows = matched.map(row => ({ row, ratio: normalizedOccupation(row.occupation) })).filter(item => Number.isFinite(item.ratio)), lowOccupation = occupationRows.filter(item => item.ratio < .75), averageOccupation = average(occupationRows.map(item => item.ratio));
    if (occupationRows.length >= 3 && lowOccupation.length >= Math.max(2, Math.ceil(occupationRows.length * .2))) {
      const lowRoute = mostFrequentLabel(lowOccupation.map(item => item.row), 'route');
      addIdea({ priority: averageOccupation < .7 ? 'high' : 'medium', score: 82, area: 'Ocupação', title: 'Aumentar a ocupação antes de liberar veículos', evidence: `${lowOccupation.length} de ${occupationRows.length} embarques ficaram abaixo de 75% de ocupação; média do período ${percent(averageOccupation)}${lowRoute ? ` • maior recorrência: ${lowRoute.label}` : ''}.`, action: 'Consolidar pedidos compatíveis, revisar a capacidade escolhida e criar uma exceção formal para saídas urgentes abaixo da meta.', detail: lowRoute ? { mode: 'financial', kind: 'route', filter: lowRoute.label } : { mode: 'financial', kind: 'matched' } });
    }

    const durationRows = matched.filter(row => Number.isFinite(row.durationDays) && routeDistanceBand(row)), delayedRows = durationRows.filter(row => row.durationDays > routeDistanceBand(row).expectedDays);
    if (delayedRows.length >= 2 || (durationRows.length && delayedRows.length / durationRows.length >= .15)) {
      const delayedRoute = mostFrequentLabel(delayedRows, 'route'), averageExcess = average(delayedRows.map(row => row.durationDays - routeDistanceBand(row).expectedDays));
      addIdea({ priority: durationRows.length && delayedRows.length / durationRows.length >= .3 ? 'high' : 'medium', score: 84, area: 'Prazo de retorno', title: 'Reduzir viagens acima do prazo da distância', evidence: `${delayedRows.length} de ${durationRows.length} viagens completas ultrapassaram o prazo esperado (${percent(delayedRows.length / durationRows.length)}); excesso médio ${numberPt(averageExcess, 1)} dia${averageExcess === 1 ? '' : 's'}${delayedRoute ? ` • rota mais recorrente: ${delayedRoute.label}` : ''}.`, action: 'Separar tempo de carregamento, trânsito, entrega e retorno; definir meta por faixa de distância e tratar a etapa que mais concentra atraso.', detail: delayedRoute ? { mode: 'financial', kind: 'route', filter: delayedRoute.label } : { mode: 'financial', kind: 'duration' } });
    }

    const variabilityGroups = new Map(); matched.filter(row => Number.isFinite(row.costPerTon) && row.costPerTon > 0).forEach(row => { const key = `${row.fleet}|${routeProfileKey(row)}`; if (!routeProfileKey(row)) return; if (!variabilityGroups.has(key)) variabilityGroups.set(key, { label: clean(row.route), fleet: row.fleet, values: [] }); variabilityGroups.get(key).values.push(row.costPerTon); });
    const unstableRoute = [...variabilityGroups.values()].map(group => ({ ...group, min: Math.min(...group.values), max: Math.max(...group.values), spread: Math.max(...group.values) / Math.min(...group.values) })).filter(group => group.values.length >= 3 && group.spread >= 1.5).sort((a,b) => b.spread - a.spread)[0];
    if (unstableRoute) addIdea({ priority: unstableRoute.spread >= 2 ? 'high' : 'medium', score: 78, area: 'Padronização', title: `Padronizar a montagem da rota ${unstableRoute.label}`, evidence: `${unstableRoute.values.length} viagens de ${FLEETS[unstableRoute.fleet] || unstableRoute.fleet}; R$/ton variou de ${money(unstableRoute.min)} a ${money(unstableRoute.max)} (${numberPt(unstableRoute.spread, 1)}×).`, action: 'Comparar peso, ocupação, veículo e custo das viagens extremas e transformar a melhor combinação em padrão de carregamento.', detail: { mode: 'financial', kind: 'route', filter: unstableRoute.label } });

    const tonDrivers = buildDriverTonAnalysis(matched).drivers.filter(driver => driver.trips >= 2 && Number.isFinite(driver.efficiencyIndex)).sort((a,b) => a.efficiencyIndex - b.efficiencyIndex || b.trips - a.trips), bestDriver = tonDrivers[0];
    if (bestDriver && bestDriver.efficiencyIndex <= 100) addIdea({ priority: 'opportunity', score: 66, area: 'Boas práticas', title: `Replicar o padrão de ${bestDriver.name}`, evidence: `${bestDriver.trips} viagens avaliadas • índice ${numberPt(bestDriver.efficiencyIndex, 1)} • R$/ton médio ${money(bestDriver.averageCostPerTon)} • ${bestDriver.status.label}.`, action: 'Revisar as viagens desse motorista, registrar práticas de carregamento e retorno e compartilhar o padrão com a mesma frota; considerar reconhecimento após validação humana.', detail: { mode: 'financial', kind: 'driver-ton', filter: bestDriver.key, fleet: bestDriver.fleet } });
  }

  const performance = state.driverPerformance || buildDriverPerformance(analysis), attentionDriver = performance.drivers.filter(driver => driver.score > 0).sort((a,b) => b.scorePer10Uses - a.scorePer10Uses || b.score - a.score)[0];
  if (attentionDriver && (attentionDriver.score >= 5 || attentionDriver.events.length >= 2)) addIdea({ priority: attentionDriver.scorePer10Uses >= 8 && attentionDriver.events.length >= 3 ? 'high' : 'medium', score: 76, area: 'Acompanhamento', title: `Revisar com contexto as ocorrências de ${attentionDriver.name}`, evidence: `${attentionDriver.score} pontos em ${attentionDriver.routeUses} utilizações • ${performanceBreakdown(attentionDriver)}${attentionDriver.costPerTonCount ? ` • R$/ton médio ${money(attentionDriver.averageCostPerTon)}` : ''}.`, action: 'Conferir cada evidência, ouvir o motorista e separar falha de processo, saúde, trânsito e conduta. A pontuação não deve ser usada isoladamente para punição.', detail: { mode: 'performance', kind: 'PERFORMANCE', filter: attentionDriver.key } });

  const relevantAbsences = state.absences.filter(item => item.type === 'FALTA' || item.type === 'ATESTADO');
  if (relevantAbsences.length >= 2) {
    const absenceDays = new Map(); relevantAbsences.forEach(item => { const day = clean(item.date || item.sheet); absenceDays.set(day, (absenceDays.get(day) || 0) + 1); }); const peakAbsence = [...absenceDays].sort((a,b) => b[1] - a[1])[0];
    const faltas = relevantAbsences.filter(item => item.type === 'FALTA').length, atestados = relevantAbsences.filter(item => item.type === 'ATESTADO').length, detailType = faltas >= atestados ? 'FALTA' : 'ATESTADO';
    addIdea({ priority: peakAbsence?.[1] >= 3 ? 'high' : 'medium', score: 64, area: 'Disponibilidade da equipe', title: 'Criar plano de cobertura para ausências', evidence: `${faltas} falta${faltas === 1 ? '' : 's'} e ${atestados} atestado${atestados === 1 ? '' : 's'} no período${peakAbsence ? `; pico de ${peakAbsence[1]} ocorrência${peakAbsence[1] === 1 ? '' : 's'} em ${displayDate({ date: peakAbsence[0], sheet: peakAbsence[0] })}` : ''}.`, action: 'Manter escala reserva e treinamento cruzado. Tratar atestados como informação de saúde e usar o indicador para capacidade da equipe, não para decisão automática.', detail: { mode: 'operational', kind: detailType } });
  }

  if (!ideas.length && state.records.length) addIdea({ priority: 'opportunity', score: 1, area: 'Gestão', title: 'Criar uma rotina mensal de melhoria contínua', evidence: `${state.records.length} utilizações e ${state.absences.length} afastamentos foram analisados sem um desvio relevante nos limites atuais.`, action: 'Salvar o relatório do período e comparar mensalmente R$/ton, prazo, ocupação e uso de SPOT para detectar mudança de padrão cedo.' });
  ideas.sort((a,b) => IMPROVEMENT_PRIORITY_ORDER[a.priority] - IMPROVEMENT_PRIORITY_ORDER[b.priority] || b.score - a.score || a.title.localeCompare(b.title, 'pt-BR'));
  const result = { ideas, high: ideas.filter(idea => idea.priority === 'high').length, medium: ideas.filter(idea => idea.priority === 'medium').length, opportunity: ideas.filter(idea => idea.priority === 'opportunity').length, coverage, matchedCount, routeCount };
  state.improvementAnalysis = result; return result;
}
function improvementCard(idea, index) {
  const button = idea.detail ? `<button class="improvement-open" type="button" data-improvement-index="${index}">Abrir dados usados <span>→</span></button>` : '';
  return `<article class="improvement-card improvement-${idea.priority}"><div class="improvement-card-top"><span class="improvement-priority">${escapeHtml(IMPROVEMENT_PRIORITY_LABELS[idea.priority])}</span><span class="improvement-area">${escapeHtml(idea.area)}</span></div><h3>${escapeHtml(idea.title)}</h3><p><strong>Evidência</strong>${escapeHtml(idea.evidence)}</p><p><strong>Ação sugerida</strong>${escapeHtml(idea.action)}</p>${button}</article>`;
}
function renderImprovementIdeas() {
  const result = buildImprovementIdeas(state.crossAnalysis);
  $('improvementHigh').textContent = result.high; $('improvementMedium').textContent = result.medium; $('improvementOpportunity').textContent = result.opportunity;
  $('improvementCoverage').textContent = Number.isFinite(result.coverage) ? percent(result.coverage) : state.costBase ? 'Sem embarques' : 'Sem base';
  $('improvementStatus').textContent = `${result.ideas.length} ideia${result.ideas.length === 1 ? '' : 's'} gerada${result.ideas.length === 1 ? '' : 's'} a partir de ${state.records.length} utilizações, ${state.absences.length} afastamentos e ${result.matchedCount} embarque${result.matchedCount === 1 ? '' : 's'} financeiro${result.matchedCount === 1 ? '' : 's'} cruzado${result.matchedCount === 1 ? '' : 's'}.`;
  $('improvementList').innerHTML = result.ideas.map(improvementCard).join('') || '<article class="improvement-empty">Importe as planilhas da operação para gerar ideias de melhoria.</article>';
}
function openImprovementDetail(index) {
  const idea = state.improvementAnalysis?.ideas?.[Number(index)], detail = idea?.detail; if (!detail) return showToast('Esta ideia não possui detalhamento adicional.');
  if (detail.mode === 'financial') return openFinancialDetail(detail.kind, detail.filter || '', detail.fleet || '', detail.category || '');
  if (detail.mode === 'performance') return openDetail('PERFORMANCE', detail.filter || '');
  return openDetail(detail.kind, detail.filter || '');
}
function emptyFinancialRanking(message) { return `<li class="no-results">${escapeHtml(message)}</li>`; }
function driverFleetRankingRows(rows, fleet, analysis = buildDriverTonAnalysis(rows)) {
  const groups = analysis.drivers.filter(group => group.fleet === fleet);
  const tagClass = fleet === 'COOPERRITA' ? 'tag-house' : 'tag-fixed';
  const heading = `<li class="financial-ranking-category"><span class="fleet-tag ${tagClass}">${escapeHtml(FLEETS[fleet])}</span><small>índice menor = melhor • 100 = mediana comparável</small></li>`;
  let rankedPosition = 0;
  const ranking = groups.length ? groups.map(group => {
    const position = group.trips ? ++rankedPosition : null, highlighted = position !== null && position <= 3, topLabel = highlighted ? '<span class="quality-top-label">TOP 3</span>' : '', missingNote = group.incompleteTrips ? ` • ${group.incompleteTrips} sem km/R$/ton comparável` : '';
    const distanceNote = group.distanceLabels?.length ? ` • ${group.distanceLabels.join(' / ')}` : '';
    const summary = group.costPerTonCount ? `${group.trips} ${group.trips === 1 ? 'viagem avaliada' : 'viagens avaliadas'}${missingNote} • R$/ton médio ${money(group.averageCostPerTon)}${distanceNote}` : `${group.totalTrips} ${group.totalTrips === 1 ? 'viagem encontrada' : 'viagens encontradas'} • sem R$/ton válido`;
    const rowClass = highlighted ? 'quality-top-three' : group.trips ? 'quality-other-driver' : 'quality-insufficient-driver';
    return `<li class="${rowClass}"><button class="financial-ranking-action quality-ranking-action" data-financial-kind="driver-ton" data-financial-filter="${escapeHtml(group.key)}" data-financial-fleet="${escapeHtml(fleet)}"><span class="ranking-position">${position ?? '—'}</span><strong>${escapeHtml(group.name)}${topLabel}<small>${escapeHtml(summary)}</small></strong><b>${Number.isFinite(group.efficiencyIndex) ? numberPt(group.efficiencyIndex, 1) : '—'}<small>índice ajustado</small><small class="quality-badge ${group.status.className}">${escapeHtml(group.status.label)}</small></b></button></li>`;
  }).join('') : `<li class="financial-ranking-empty">Nenhum motorista de ${escapeHtml(FLEETS[fleet].toLowerCase())} com embarque cruzado.</li>`;
  return heading + ranking;
}
function routeQualityCategory(row) { return routeDistanceBand(row)?.category || ''; }
function routeQualityStatus(group) {
  if (group.trips < 2) return { label: 'Amostra inicial', className: 'quality-sample' };
  if (group.qualityRate >= .7) return { label: 'Padrão consistente', className: 'quality-good' };
  if (group.qualityRate >= .5) return { label: 'Em observação', className: 'quality-watch' };
  return { label: 'Fora do padrão', className: 'quality-bad' };
}
function buildRouteQualityAnalysis(rows, category) {
  if (rows.some(row => !row.distanceBandKey)) enrichRouteDistances(rows);
  const candidates = rows.filter(row => clean(row.driver) && ['COOPERRITA', 'TERCEIROS FIXOS'].includes(row.fleet) && routeQualityCategory(row) === category), isEligible = row => Number.isFinite(row.costPerTon) && Boolean(routeDistanceBand(row)) && Number.isFinite(row.durationDays) && isoDateValue(row.departureDate) && isoDateValue(row.returnDate), eligible = candidates.filter(isEligible);
  const bandBenchmarks = buildTonBenchmarks(eligible), qualityFleets = ['COOPERRITA', 'TERCEIROS FIXOS'], benchmarks = Object.fromEntries(qualityFleets.map(fleet => {
    const fleetRows = eligible.filter(row => row.fleet === fleet); return [fleet, { trips: fleetRows.length, costPerTonMedian: median(fleetRows.map(row => row.costPerTon)), durationMedian: median(fleetRows.map(row => row.durationDays)) }];
  })), costPerTonMedian = median(eligible.map(row => row.costPerTon)), durationMedian = median(eligible.map(row => row.durationDays)), groups = new Map();
  candidates.forEach(row => {
    const driverKey = driverRouteKey(row.driver); if (!driverKey) return; const key = `${row.fleet}|${driverKey}`;
    if (!groups.has(key)) groups.set(key, { key, driverKey, name: clean(row.driver), fleet: row.fleet, allRows: [], rows: [], costPerTonTotal: 0, durationTotal: 0, compliantTrips: 0, distanceBands: new Set() });
    const group = groups.get(key); group.allRows.push(row); if (!isEligible(row)) return;
    const benchmark = bandBenchmarks.get(tonBenchmarkKey(row)), complies = Number.isFinite(benchmark?.costPerTonMedian) && Number.isFinite(benchmark?.durationLimit) && row.costPerTon <= benchmark.costPerTonMedian && row.durationDays <= benchmark.durationLimit;
    group.rows.push(row); group.distanceBands.add(routeDistanceBand(row).label); group.costPerTonTotal += row.costPerTon; group.durationTotal += row.durationDays; if (complies) group.compliantTrips++;
  });
  const drivers = [...groups.values()].map(group => {
    const trips = group.rows.length, totalTrips = group.allRows.length, incompleteTrips = totalTrips - trips, qualityRate = trips ? group.compliantTrips / trips : null, averageCostPerTon = trips ? roundedMoney(group.costPerTonTotal / trips) : null, averageDuration = trips ? Math.round(group.durationTotal / trips * 10) / 10 : null;
    const result = { ...group, distanceBands: [...group.distanceBands], fleets: [group.fleet], trips, totalTrips, incompleteTrips, qualityRate, averageCostPerTon, averageDuration, status: null }; result.status = trips ? routeQualityStatus(result) : { label: 'Dados insuficientes', className: 'quality-missing' }; return result;
  }).sort((a,b) => Number(b.trips > 0) - Number(a.trips > 0) || Number(b.trips >= 2) - Number(a.trips >= 2) || (b.qualityRate ?? -1) - (a.qualityRate ?? -1) || b.trips - a.trips || (a.averageCostPerTon ?? Infinity) - (b.averageCostPerTon ?? Infinity) || (a.averageDuration ?? Infinity) - (b.averageDuration ?? Infinity) || a.name.localeCompare(b.name, 'pt-BR'));
  return { category, candidates, eligible, drivers, costPerTonMedian, durationMedian, benchmarks, bandBenchmarks };
}
function routeQualityFleetRows(analysis, category, fleet) {
  const drivers = analysis.drivers.filter(group => group.fleet === fleet), benchmark = analysis.benchmarks[fleet], tagClass = fleet === 'COOPERRITA' ? 'tag-house' : 'tag-fixed';
  const reference = benchmark?.trips ? `${benchmark.trips} viagens • referência ajustada por faixa de distância` : 'sem viagens completas nesta distância';
  const heading = `<li class="quality-fleet-heading"><span class="fleet-tag ${tagClass}">${escapeHtml(FLEETS[fleet])}</span><small>${escapeHtml(reference)}</small></li>`;
  let rankedPosition = 0;
  const ranking = drivers.length ? drivers.map(group => {
    const position = group.trips ? ++rankedPosition : null, highlighted = position !== null && position <= 3, topLabel = highlighted ? '<span class="quality-top-label">TOP 3</span>' : '', missingNote = group.incompleteTrips ? ` • ${group.incompleteTrips} sem dados completos` : '';
    const bandNote = group.distanceBands?.length ? ` • ${group.distanceBands.join(' / ')}` : '';
    const tripSummary = group.trips ? `${group.trips} ${group.trips === 1 ? 'viagem avaliada' : 'viagens avaliadas'}${missingNote} • ${money(group.averageCostPerTon)}/ton • ${durationLabel(group.averageDuration)}${bandNote}` : `${group.totalTrips} ${group.totalTrips === 1 ? 'viagem encontrada' : 'viagens encontradas'} • faltam R$/ton, saída ou retorno`;
    const rowClass = highlighted ? 'quality-top-three' : group.trips ? 'quality-other-driver' : 'quality-insufficient-driver';
    return `<li class="${rowClass}"><button class="financial-ranking-action quality-ranking-action" data-financial-kind="quality-driver" data-financial-filter="${escapeHtml(group.key)}" data-financial-fleet="${escapeHtml(fleet)}" data-financial-category="${category}"><span class="ranking-position">${position ?? '—'}</span><strong>${escapeHtml(group.name)}${topLabel}<small>${escapeHtml(tripSummary)}</small></strong><b>${percent(group.qualityRate)}<small>eficiência</small><small class="quality-badge ${group.status.className}">${escapeHtml(group.status.label)}</small></b></button></li>`;
  }).join('') : `<li class="financial-ranking-empty">Nenhum motorista de ${escapeHtml(FLEETS[fleet].toLowerCase())} identificado nesta distância.</li>`;
  return heading + ranking;
}
function renderRouteQualityRanking(rows, category, rankingId, benchmarkId) {
  const analysis = buildRouteQualityAnalysis(rows, category), distanceLabel = category === 'near' ? 'muito próximas e próximas da base' : 'regionais e longas';
  $(benchmarkId).textContent = analysis.eligible.length ? `${analysis.eligible.length} ${analysis.eligible.length === 1 ? 'viagem válida' : 'viagens válidas'} (${distanceLabel}). Origem: ${COMPANY_ORIGIN}. Compara a mesma frota e faixa: até 120, 121–250, 251–500 ou acima de 500 km, respeitando também o prazo esperado.` : `Sem viagens ${distanceLabel} com R$/ton, distância, saída e retorno completos.`;
  $(rankingId).innerHTML = routeQualityFleetRows(analysis, category, 'COOPERRITA') + routeQualityFleetRows(analysis, category, 'TERCEIROS FIXOS');
}
function renderSpotFinancial(rows) {
  const spots = rows.filter(row => row.fleet === 'SPOT'), tonRows = spots.filter(row => Number.isFinite(row.costPerTon));
  const panel = $('spotResultPanel'), badge = $('spotResultBadge'); panel.classList.remove('spot-result-ready','spot-result-neutral');
  if (!spots.length || !tonRows.length) { panel.classList.add('spot-result-neutral'); badge.textContent = spots.length ? 'SEM R$/TON' : 'SEM SPOT CRUZADO'; }
  else { panel.classList.add('spot-result-ready'); badge.textContent = 'R$/TON DISPONÍVEL'; }
  $('spotShipmentCount').textContent = spots.length; $('spotCost').textContent = money(finiteSum(spots, 'cost')); $('spotTonAverage').textContent = moneyOrDash(finiteAverage(tonRows, 'costPerTon')); $('spotTonBest').textContent = moneyOrDash(finiteMinimum(tonRows, 'costPerTon')); $('spotTonHighest').textContent = moneyOrDash(finiteMaximum(tonRows, 'costPerTon')); $('spotTonMissing').textContent = spots.length - tonRows.length;
}
function routeDistanceRankingRows(profiles, direction) {
  const candidates = profiles.filter(profile => profile.band && profile.band.category === (direction === 'near' ? 'near' : 'far'));
  const sorted = candidates.sort((a,b) => direction === 'near' ? a.band.rank - b.band.rank || (a.referenceKm ?? Infinity) - (b.referenceKm ?? Infinity) || a.label.localeCompare(b.label, 'pt-BR') : b.band.rank - a.band.rank || (b.referenceKm ?? -Infinity) - (a.referenceKm ?? -Infinity) || a.label.localeCompare(b.label, 'pt-BR')).slice(0, 5);
  return sorted.length ? sorted.map((profile, index) => {
    const kmLabel = Number.isFinite(profile.referenceKm) ? `${numberPt(profile.referenceKm, 1)} km típicos` : 'KM não informado', warning = profile.warning ? ' • KM da planilha divergente; faixa protegida pela cidade' : '', source = profile.source === 'route-median' ? 'mediana da rota' : profile.source === 'sheet-km' ? 'KM informado' : 'regra geográfica';
    return `<li><button class="financial-ranking-action" data-financial-kind="route" data-financial-filter="${escapeHtml(profile.label)}"><span class="ranking-position">${index + 1}</span><strong title="${escapeHtml(profile.label)}">${escapeHtml(profile.label)}<small>${profile.tripCount} embarque${profile.tripCount === 1 ? '' : 's'} • ${escapeHtml(profile.band.detail)}${escapeHtml(warning)}</small></strong><b>${escapeHtml(profile.band.label)}<small>${escapeHtml(kmLabel)} • ${escapeHtml(source)}</small></b></button></li>`;
  }).join('') : emptyFinancialRanking(direction === 'near' ? 'Nenhuma rota próxima com distância reconhecida.' : 'Nenhuma rota longa com distância reconhecida.');
}
function renderRouteDistanceRankings(analysis) {
  const profiles = analysis.routeProfiles?.length ? [...analysis.routeProfiles] : enrichRouteDistances(analysis.matchedRows || []);
  $('nearRouteRanking').innerHTML = routeDistanceRankingRows(profiles, 'near'); $('farRouteRanking').innerHTML = routeDistanceRankingRows(profiles, 'far');
}
function renderFinancialRankings(analysis) {
  const matched = analysis.matchedRows, routes = financialGroups(matched, 'route');
  const efficient = routes.filter(group => group.costPerTonCount).sort((a,b) => a.averageCostPerTon - b.averageCostPerTon || b.costPerTonCount - a.costPerTonCount).slice(0, 5);
  $('routeEfficiencyRanking').innerHTML = efficient.length ? efficient.map((group, index) => `<li><button class="financial-ranking-action" data-financial-kind="route" data-financial-filter="${escapeHtml(group.label)}"><span class="ranking-position">${index + 1}</span><strong title="${escapeHtml(group.label)}">${escapeHtml(group.label)}<small>${group.costPerTonCount} embarque${group.costPerTonCount === 1 ? '' : 's'} com R$/ton • menor é melhor</small></strong><b>${money(group.averageCostPerTon)}<small>/ton</small></b></button></li>`).join('') : emptyFinancialRanking('Sem R$/ton nas rotas cruzadas.');
  const highest = routes.filter(group => group.costPerTonCount).sort((a,b) => b.averageCostPerTon - a.averageCostPerTon || b.costPerTonCount - a.costPerTonCount).slice(0, 5);
  $('routeTonRanking').innerHTML = highest.length ? highest.map((group, index) => `<li><button class="financial-ranking-action" data-financial-kind="route" data-financial-filter="${escapeHtml(group.label)}"><span class="ranking-position">${index + 1}</span><strong title="${escapeHtml(group.label)}">${escapeHtml(group.label)}<small>${group.costPerTonCount} embarque${group.costPerTonCount === 1 ? '' : 's'} com R$/ton</small></strong><b>${money(group.averageCostPerTon)}<small>/ton</small></b></button></li>`).join('') : emptyFinancialRanking('Sem R$/ton nas rotas cruzadas.');
  renderRouteDistanceRankings(analysis);
  const driverTonAnalysis = buildDriverTonAnalysis(matched); $('driverTonRanking').innerHTML = driverFleetRankingRows(matched, 'COOPERRITA', driverTonAnalysis) + driverFleetRankingRows(matched, 'TERCEIROS FIXOS', driverTonAnalysis);
  renderRouteQualityRanking(matched, 'near', 'nearDriverQualityRanking', 'nearQualityBenchmark'); renderRouteQualityRanking(matched, 'far', 'farDriverQualityRanking', 'farQualityBenchmark');
  const longest = matched.filter(row => Number.isFinite(row.durationDays)).sort((a,b) => b.durationDays - a.durationDays || (b.costPerTon ?? 0) - (a.costPerTon ?? 0)).slice(0, 5);
  $('durationRanking').innerHTML = longest.length ? longest.map((row, index) => `<li><button class="financial-ranking-action" data-financial-kind="shipment" data-financial-filter="${escapeHtml(row.shipment)}"><span class="ranking-position">${index + 1}</span><strong>${escapeHtml(row.driver || 'Motorista não informado')}<small title="${escapeHtml(row.route)}">Emb. ${escapeHtml(row.shipment)} • ${escapeHtml(row.route || 'Rota não informada')}</small></strong><b>${durationLabel(row.durationDays)}</b></button></li>`).join('') : emptyFinancialRanking('As bases escolhidas não possuem lead time ou retorno calculável.');
}
function financialTableRow(row, detailed = false) {
  const fleet = row.fleet ? FLEETS[row.fleet] || row.fleet : row.carrier || '—', departure = displayIsoDate(row.departureDate || row.costDate || row.date), returned = displayIsoDate(row.returnDate);
  const common = `<td><button class="shipment-link" data-financial-kind="shipment" data-financial-filter="${escapeHtml(row.shipment)}">${escapeHtml(row.shipment)}</button>${row.duplicateRows > 1 ? '<small class="duplicate-note">Duplicado na base</small>' : ''}</td><td>${escapeHtml(row.driver || '—')}</td><td class="route-cell" title="${escapeHtml(row.route || '')}">${escapeHtml(row.route || '—')}</td>`;
  const distanceBand = routeDistanceBand(row), distance = distanceBand ? `<span class="route-distance-tag distance-${distanceBand.category}">${escapeHtml(distanceBand.label)}</span><small class="route-distance-note">${Number.isFinite(row.distanceKm) ? `${numberPt(row.distanceKm, 1)} km típicos` : distanceBand.detail}${row.distanceWarning ? ' • revisar KM informado' : ''}</small>` : '—';
  if (detailed) return `<tr><td>${escapeHtml(departure)}</td><td>${escapeHtml(returned)}</td>${common}<td>${escapeHtml(fleet)}</td><td>${escapeHtml(row.plate || '—')}</td><td>${moneyOrDash(row.revenue)}</td><td>${moneyOrDash(row.cost)}</td><td>${moneyOrDash(row.costPerTon)}</td><td>${numberPt(row.km, 1)}</td><td>${distance}</td><td>${durationLabel(row.durationDays)}</td><td><span class="financial-status ${financialStatusClass(row.status)}">${financialStatusLabel(row.status)}</span></td></tr>`;
  return `<tr><td>${escapeHtml(departure)}</td>${common}<td>${escapeHtml(fleet)}</td><td>${moneyOrDash(row.revenue)}</td><td>${moneyOrDash(row.cost)}</td><td>${moneyOrDash(row.costPerTon)}</td><td>${distance}</td><td>${durationLabel(row.durationDays)}</td><td><span class="financial-status ${financialStatusClass(row.status)}">${financialStatusLabel(row.status)}</span></td></tr>`;
}
function renderFinancialTable() {
  const analysis = state.crossAnalysis; if (!analysis) return;
  const query = norm($('financialSearch').value), status = $('financialStatus').value;
  const rows = analysis.allRows.filter(row => (!status || row.status === status) && (!query || norm([row.shipment, row.driver, row.route, row.plate, row.fleet, row.carrier].join(' ')).includes(query)));
  $('financialTableCount').textContent = `${rows.length} embarque${rows.length === 1 ? '' : 's'} exibido${rows.length === 1 ? '' : 's'}`;
  $('financialTable').innerHTML = rows.length ? rows.map(row => financialTableRow(row)).join('') : '<tr><td colspan="11" class="no-results">Nenhum embarque corresponde aos filtros.</td></tr>';
}
function renderCrossAnalysis() {
  const empty = $('financialEmpty'), content = $('financialContent'); if (!empty || !content) return;
  if (!state.costBase) { state.crossAnalysis = null; empty.classList.remove('hidden'); content.classList.add('hidden'); $('financialEmptyTitle').textContent = 'Importe a base de valores para cruzar os embarques'; $('financialEmptyText').textContent = 'Depois de escolher uma ou várias abas, o sistema localizará o cabeçalho R$/TON e ligará custo, rota, motorista e duração automaticamente.'; return; }
  const analysis = buildCrossAnalysis(); empty.classList.add('hidden'); content.classList.remove('hidden');
  const matched = analysis.matchedRows, revenue = finiteSum(matched, 'revenue'), cost = finiteSum(matched, 'cost'), tonRows = matched.filter(row => Number.isFinite(row.costPerTon));
  $('financialPeriod').textContent = `${costBaseLabel()} • ${state.costBase.fileName}`; $('financialMatched').textContent = matched.length; $('financialMatchedSmall').textContent = `de ${analysis.routeUniqueCount} embarque${analysis.routeUniqueCount === 1 ? '' : 's'} da operação`;
  $('financialRevenue').textContent = money(revenue); $('financialCost').textContent = money(cost); $('financialTonAverage').textContent = moneyOrDash(finiteAverage(tonRows, 'costPerTon')); $('financialTonBest').textContent = moneyOrDash(finiteMinimum(tonRows, 'costPerTon')); $('financialTonHighest').textContent = moneyOrDash(finiteMaximum(tonRows, 'costPerTon'));
  const duplicateText = analysis.duplicateCosts.length ? ` ${analysis.duplicateCosts.length} embarque${analysis.duplicateCosts.length === 1 ? '' : 's'} duplicado${analysis.duplicateCosts.length === 1 ? '' : 's'} entre as bases financeiras foi considerado apenas uma vez.` : '', missingTonText = state.costBase.missingTonSheets?.length ? ` Atenção: ${state.costBase.missingTonSheets.join(', ')} não possui valores válidos no campo R$/TON.` : '';
  const notice = $('financialNotice'); notice.classList.remove('financial-notice-ok','financial-notice-warning','financial-notice-error');
  if (!analysis.routeUniqueCount) { notice.classList.add('financial-notice-warning'); notice.textContent = 'A planilha de rotas não contém números de embarque reconhecíveis para realizar o cruzamento.'; }
  else if (!matched.length) { notice.classList.add('financial-notice-error'); notice.textContent = `Nenhum dos ${analysis.routeUniqueCount} embarques da operação foi encontrado em ${costBaseLabel()}. Confira se as planilhas selecionadas correspondem ao período da operação.${duplicateText}${missingTonText}`; }
  else if (!tonRows.length) { notice.classList.add('financial-notice-error'); notice.textContent = 'Nenhum valor numérico de R$/TON foi encontrado nos embarques cruzados. Confira a aba e o cabeçalho selecionados.'; }
  else { const coverage = matched.length / analysis.routeUniqueCount; notice.classList.add(coverage >= .8 && !state.costBase.missingTonSheets?.length ? 'financial-notice-ok' : 'financial-notice-warning'); notice.textContent = `${matched.length} de ${analysis.routeUniqueCount} embarques da operação foram cruzados (${percent(coverage)}). ${tonRows.length} possuem R$/ton, ${analysis.routeOnlyRows.length} estão sem base de valores e ${analysis.costOnlyRows.length} registros financeiros não aparecem nas rotas.${duplicateText}${missingTonText}`; }
  renderSpotFinancial(matched); renderFinancialRankings(analysis); renderFinancialTable();
}
function openFinancialDetail(kind = 'all', filter = '', fleet = '', category = '') {
  const analysis = state.crossAnalysis || buildCrossAnalysis(); if (!analysis) return showToast('Importe as duas planilhas antes de abrir a análise financeira.');
  rememberDetailOrigin();
  let rows = [...analysis.allRows], title = 'Todos os embarques', subtitle = 'Conferência entre a operação e a base de valores', detailMetric = '';
  if (['matched','revenue','cost','ton-average','ton-best','ton-highest','duration'].includes(kind)) rows = [...analysis.matchedRows];
  if (kind === 'route-only') rows = [...analysis.routeOnlyRows]; if (kind === 'cost-only') rows = [...analysis.costOnlyRows];
  if (kind === 'spot') { rows = analysis.matchedRows.filter(row => row.fleet === 'SPOT').sort((a,b) => (a.costPerTon ?? Infinity) - (b.costPerTon ?? Infinity)); title = 'R$/ton dos SPOTs'; subtitle = 'Menores valores de R$/ton aparecem primeiro; confira cada embarque'; }
  if (kind === 'route') { rows = analysis.matchedRows.filter(row => norm(row.route) === norm(filter)); const band = routeDistanceBand(rows[0]); title = `Rota — ${filter}`; subtitle = `Embarques, R$/ton, custos, faturamento e duração desta rota${band ? ` • ${band.label} a partir de ${COMPANY_ORIGIN}${Number.isFinite(rows[0]?.distanceKm) ? ` • ${numberPt(rows[0].distanceKm, 1)} km típicos` : ''}` : ''}`; }
  if (kind === 'driver') { rows = analysis.matchedRows.filter(row => norm(row.driver) === norm(filter) && (!fleet || row.fleet === fleet)); title = `${fleet ? `${FLEETS[fleet]} — ` : ''}${filter}`; subtitle = 'Embarques e R$/ton ligados a este motorista'; }
  if (kind === 'driver-ton') { const tonAnalysis = buildDriverTonAnalysis(analysis.matchedRows), group = tonAnalysis.drivers.find(item => item.key === filter); rows = group ? [...group.allRows].sort((a,b) => String(a.departureDate).localeCompare(String(b.departureDate))) : []; title = group ? `${FLEETS[group.fleet]} — ${group.name}` : 'Classificação por R$/ton'; subtitle = group ? `${group.status.label}: R$/ton médio ${moneyOrDash(group.averageCostPerTon)}. Índice ${numberPt(group.efficiencyIndex, 1)}; 100 representa a mediana da mesma frota e distância comparável desde ${COMPANY_ORIGIN}, e valores menores são melhores.${group.distanceLabels?.length ? ` Faixas avaliadas: ${group.distanceLabels.join(', ')}.` : ''}${group.incompleteTrips ? ` ${group.incompleteTrips} viagem${group.incompleteTrips === 1 ? '' : 's'} sem comparação completa.` : ''}` : 'Não foi possível localizar este motorista.'; detailMetric = group && Number.isFinite(group.efficiencyIndex) ? `Índice ${numberPt(group.efficiencyIndex, 1)}` : 'Sem índice'; }
  if (kind === 'quality-driver') { const quality = buildRouteQualityAnalysis(analysis.matchedRows, category), group = quality.drivers.find(item => item.key === filter || item.driverKey === filter); rows = group ? [...group.allRows].sort((a,b) => String(a.departureDate).localeCompare(String(b.departureDate))) : []; title = `${category === 'near' ? 'Rotas próximas da base' : 'Rotas regionais e longas'} — ${group ? `${FLEETS[group.fleet]} — ${group.name}` : filter}`; subtitle = group ? (group.trips ? `${group.status.label}: ${percent(group.qualityRate)} de eficiência. Cada viagem foi comparada ao R$/ton e ao prazo da mesma frota e faixa desde ${COMPANY_ORIGIN}.${group.distanceBands?.length ? ` Faixas: ${group.distanceBands.join(', ')}.` : ''}${group.incompleteTrips ? ` ${group.incompleteTrips} ${group.incompleteTrips === 1 ? 'viagem ficou' : 'viagens ficaram'} sem avaliação por falta de dados.` : ''} Saída e retorno vêm da base de valores.` : `Dados insuficientes: ${group.totalTrips} ${group.totalTrips === 1 ? 'viagem encontrada' : 'viagens encontradas'}, mas falta R$/ton, saída ou retorno para calcular a eficiência.`) : 'Não foi possível localizar as viagens deste motorista.'; }
  if (kind === 'shipment') { rows = analysis.allRows.filter(row => row.shipment === clean(filter)); title = `Embarque ${filter}`; subtitle = 'Linha financeira e operação encontradas para este embarque'; }
  if (kind === 'revenue') { title = 'Faturamento dos embarques cruzados'; rows.sort((a,b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity)); }
  if (kind === 'cost') { title = 'Custo das rotas cruzadas'; rows.sort((a,b) => (b.cost ?? -Infinity) - (a.cost ?? -Infinity)); }
  if (kind === 'ton-average') { title = 'R$/ton dos embarques cruzados'; subtitle = 'Média calculada somente com valores numéricos do campo R$/TON'; rows = rows.filter(row => Number.isFinite(row.costPerTon)).sort((a,b) => a.costPerTon - b.costPerTon); }
  if (kind === 'ton-best') { title = 'Menores valores de R$/ton'; subtitle = 'Menor valor é considerado mais eficiente'; rows = rows.filter(row => Number.isFinite(row.costPerTon)).sort((a,b) => a.costPerTon - b.costPerTon); }
  if (kind === 'ton-highest') { title = 'Maiores valores de R$/ton'; subtitle = 'Embarques com maior R$/ton aparecem primeiro'; rows = rows.filter(row => Number.isFinite(row.costPerTon)).sort((a,b) => b.costPerTon - a.costPerTon); }
  if (kind === 'duration') { title = 'Viagens mais demoradas'; subtitle = 'Tempo entre a data de saída e a data de retorno; lead time somente quando uma das datas não existe'; rows = rows.filter(row => Number.isFinite(row.durationDays)).sort((a,b) => b.durationDays - a.durationDays); }
  if (kind === 'matched') title = 'Embarques localizados nas duas planilhas'; if (kind === 'route-only') { title = 'Embarques sem base de valores'; subtitle = 'Presentes na operação, mas ausentes nas abas financeiras selecionadas'; } if (kind === 'cost-only') { title = 'Registros de valores sem rota localizada'; subtitle = 'Presentes na base financeira, mas ausentes na operação importada'; }
  $('dashboard').classList.add('hidden'); $('indicatorView').classList.add('hidden'); $('financialDetailView').classList.remove('hidden'); setDetailMode(true); $('financialDetailTitle').textContent = title; $('financialDetailSubtitle').textContent = subtitle;
  const tonKinds = ['spot','ton-average','ton-best','ton-highest'], total = detailMetric || (kind === 'cost' ? money(finiteSum(rows, 'cost')) : kind === 'revenue' ? money(finiteSum(rows, 'revenue')) : tonKinds.includes(kind) ? `Média ${moneyOrDash(finiteAverage(rows, 'costPerTon'))}/ton` : `${rows.length} embarque${rows.length === 1 ? '' : 's'}`);
  const detailTotal = $('financialDetailTotal'); detailTotal.textContent = total; $('financialDetailTable').innerHTML = rows.length ? rows.map(row => financialTableRow(row, true)).join('') : '<tr><td colspan="14" class="no-results">Nenhum dado encontrado.</td></tr>'; $('financialDetailTableWrap').scrollTop = 0; $('financialDetailTableWrap').scrollLeft = 0; $('backFinancialDetail').focus?.({ preventScroll: true });
}
function closeFinancialDetail() { $('financialDetailView').classList.add('hidden'); if (state.records.length) $('dashboard').classList.remove('hidden'); setDetailMode(false); restoreDetailOrigin(); }
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
function setIndicatorTableHeader(mode = 'fleet') {
  $('indicatorTableHead').innerHTML = mode === 'performance' ? '<tr><th>Data</th><th>Critério</th><th>Motorista</th><th>Embarque</th><th>Rota</th><th>Evidência</th><th>Pontos</th></tr>' : '<tr><th>Data</th><th>Frota</th><th>Placa</th><th>Motorista</th><th>Embarque</th><th>Rota</th><th>Custo</th></tr>';
}
function performanceEventRow(event, driver) {
  const fleet = event.fleet ? FLEETS[event.fleet] || event.fleet : '', source = event.source || {};
  return `<tr><td>${escapeHtml(displayDate(source))}</td><td><span class="performance-event-tag">${escapeHtml(event.label)}</span>${fleet ? `<small class="performance-event-fleet">${escapeHtml(fleet)}</small>` : ''}</td><td>${escapeHtml(driver.name)}</td><td>${escapeHtml(event.shipment || '—')}</td><td class="route-cell">${escapeHtml(event.route || '—')}</td><td>${escapeHtml(event.metric)}</td><td><strong class="performance-event-points">+${event.points}</strong></td></tr>`;
}
function openDetail(kind, filter = '') {
  const absenceType = ['FOLGA','FÉRIAS','ATESTADO','FALTA'].includes(kind);
  const performanceDriver = kind === 'PERFORMANCE' ? (state.driverPerformance || buildDriverPerformance(state.crossAnalysis)).drivers.find(driver => driver.key === filter) : null;
  if (kind === 'PERFORMANCE' && !performanceDriver) return showToast('Não foi possível localizar os dados deste motorista.');
  rememberDetailOrigin();
  $('dashboard').classList.add('hidden'); $('financialDetailView').classList.add('hidden'); $('indicatorView').classList.remove('hidden'); setDetailMode(true);
  if (kind === 'PERFORMANCE') {
    setIndicatorTableHeader('performance'); $('indicatorTitle').textContent = `Menor desempenho — ${performanceDriver.name}`; $('indicatorSubtitle').textContent = `${performanceDriver.routeUses} utilização${performanceDriver.routeUses === 1 ? '' : 'ões'} • ${performanceTonLabel(performanceDriver)} • ${performanceBreakdown(performanceDriver)}. Revise cada ocorrência antes de qualquer decisão.`; $('indicatorTotal').textContent = `${performanceDriver.score} ponto${performanceDriver.score === 1 ? '' : 's'}`;
    $('indicatorTable').innerHTML = performanceDriver.events.length ? performanceDriver.events.map(event => performanceEventRow(event, performanceDriver)).join('') : '<tr><td colspan="7" class="no-results">Nenhum ponto de atenção encontrado.</td></tr>';
  } else if (absenceType) {
    setIndicatorTableHeader();
    const items = sortedAbsences().filter(r => r.type === kind && (!filter || r.employee === filter));
    $('indicatorTitle').textContent = `${ABSENCE_LABELS[kind]}${filter ? ` — ${filter}` : ''}`; $('indicatorSubtitle').textContent = 'Funcionários e datas encontrados nas planilhas'; $('indicatorTotal').textContent = `${items.length} registro${items.length === 1 ? '' : 's'}`;
    $('indicatorTable').innerHTML = items.map(r => `<tr><td>${escapeHtml(displayDate(r))}</td><td>${escapeHtml(ABSENCE_LABELS[kind])}</td><td>${escapeHtml(r.employee)}</td><td>—</td><td>—</td><td>${escapeHtml(r.sheet)}</td><td>—</td></tr>`).join('') || '<tr><td colspan="7" class="no-results">Sem dados.</td></tr>';
  } else {
    setIndicatorTableHeader();
    const dayDetail = kind === 'DAY';
    let records = kind === 'all' ? sortedRecords() : dayDetail ? sortedRecords().filter(r => dailyRecordKey(r) === clean(filter)) : sortedRecords().filter(r => r.fleet === kind);
    if (kind === 'OVERNIGHT') records = sortedRecords().filter(isOvernight);
    if (filter && !dayDetail) records = records.filter(r => r.plate === filter);
    const dayLabel = dayDetail ? displayDate({ date: filter, sheet: filter }) : '';
    const title = kind === 'all' ? 'Veículos-dia em rota' : kind === 'OVERNIGHT' ? 'Rotas com pernoite' : dayDetail ? `Uso da frota — ${dayLabel}` : FLEETS[kind];
    const total = sumRecordCosts(records);
    const fleetSummary = dayDetail ? FLEET_ORDER.filter(fleet => records.some(record => record.fleet === fleet)).map(fleet => `${FLEETS[fleet]}: ${records.filter(record => record.fleet === fleet).length}`).join(' • ') : '';
    $('indicatorTitle').textContent = `${title}${filter && !dayDetail ? ` — ${filter}` : ''}`; $('indicatorSubtitle').textContent = dayDetail ? `${records.length} utilização${records.length === 1 ? '' : 'ões'} que compõem esta barra${fleetSummary ? ` • ${fleetSummary}` : ''} • custo configurado ${money(total)}` : `${records.length} utilização${records.length === 1 ? '' : 'ões'} que compõem este indicador`; $('indicatorTotal').textContent = dayDetail ? `${records.length} veículo${records.length === 1 ? '' : 's'}-dia` : money(total);
    $('indicatorTable').innerHTML = records.map(r => `<tr><td>${escapeHtml(displayDate(r))}</td><td>${escapeHtml(FLEETS[r.fleet])}</td><td>${escapeHtml(r.plate)}</td><td>${escapeHtml(r.driver || '—')}</td><td>${escapeHtml(r.shipment || '—')}</td><td>${escapeHtml(r.city || '—')}</td><td>${money(recordRate(r))}${hasUsageRate(r) ? '<small class="individual-rate-note">Individual</small>' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="no-results">Sem dados.</td></tr>';
  }
  $('indicatorTableWrap').scrollTop = 0; $('indicatorTableWrap').scrollLeft = 0; $('backDashboard').focus?.({ preventScroll: true });
}

function closeDetail() { $('indicatorView').classList.add('hidden'); if (state.records.length) $('dashboard').classList.remove('hidden'); setDetailMode(false); restoreDetailOrigin(); }

function render() {
  $('indicatorView').classList.add('hidden'); $('financialDetailView').classList.add('hidden'); $('dashboard').classList.remove('hidden'); setDetailMode(false); setActiveTab(state.activeTab, { focus: false, scroll: false }); $('clearData').hidden = false; const records = sortedRecords();
  $('importStatus').textContent = `${state.loadedKeys.size} arquivo(s) • ${records.length} rotas • ${state.absences.length} afastamentos`;
  $('metricUses').textContent = records.length; $('metricHouse').textContent = countFleet(records, 'COOPERRITA'); $('metricFixed').textContent = countFleet(records, 'TERCEIROS FIXOS'); $('metricSpot').textContent = countFleet(records, 'SPOT'); $('metricLeaves').textContent = countAbsence('FOLGA'); $('metricVacation').textContent = countAbsence('FÉRIAS'); $('metricMedical').textContent = countAbsence('ATESTADO'); $('metricOvernight').textContent = records.filter(isOvernight).length;
  setOptions('dateFilter', [...new Set(records.map(r => r.date))].filter(Boolean).sort(), 'Todos os dias', value => displayDate({ date: value, sheet: value })); setOptions('fleetFilter', FLEET_ORDER.filter(fleet => records.some(r => r.fleet === fleet)), 'Todas as frotas', fleet => FLEETS[fleet]); setOptions('plateFilter', [...new Set(records.map(r => r.plate))].sort(), 'Todas as placas'); setOptions('employeeFilter', [...new Set(state.absences.map(r => r.employee))].sort(), 'Todos'); setOptions('absenceFilter', [...new Set(state.absences.map(r => r.type))].sort(), 'Todos os tipos', type => ABSENCE_LABELS[type]);
  renderCharts(records); renderTable(); renderAbsenceTable(); renderCosts(); renderVehicleRateEditor(); renderInsights(); renderCrossAnalysis(); renderDriverPerformance(); renderImprovementIdeas(); $('auditSummary').textContent = `${state.audit.filter(v => /concluída/.test(v)).length} arquivo(s) analisado(s).`; $('auditList').innerHTML = state.audit.slice(0, 100).map(item => `<li>${escapeHtml(item)}</li>`).join('');
}
function renderCharts(records) {
  const daily = new Map(); records.forEach(r => { const day = dailyRecordKey(r); if (!daily.has(day)) daily.set(day, { COOPERRITA: 0, 'TERCEIROS FIXOS': 0, SPOT: 0 }); daily.get(day)[r.fleet]++; });
  const rows = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])); const max = Math.max(...rows.map(([, counts]) => Object.values(counts).reduce((sum, n) => sum + n, 0)), 1);
  $('dailyChart').innerHTML = rows.map(([day, counts]) => { const total = Object.values(counts).reduce((sum, n) => sum + n, 0), dayLabel = displayDate({ date: day, sheet: day }); const segments = FLEET_ORDER.filter(f => counts[f]).map(f => `<span class="bar-segment ${f === 'COOPERRITA' ? 'house-bar' : f === 'TERCEIROS FIXOS' ? 'fixed-bar' : 'spot-bar'}" style="height:${(counts[f] / total) * 100}%"></span>`).join(''); return `<button class="bar-item chart-day-action" type="button" data-chart-day="${escapeHtml(day)}" title="${escapeHtml(dayLabel)}: ${total} veículo(s)-dia. Clique para ver os registros." aria-label="Ver ${total} utilização${total === 1 ? '' : 'ões'} de ${escapeHtml(dayLabel)}"><span class="bar-value">${total}</span><span class="bar stacked-bar" style="height:${Math.max(3, Math.round((total / max) * 138))}px">${segments}</span><span class="bar-label">${escapeHtml(/^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(5).split('-').reverse().join('/') : day)}</span></button>`; }).join('');
  $('noChart').classList.toggle('hidden', rows.length > 0);
  const plates = new Map(); records.forEach(r => { const current = plates.get(r.plate) || { count: 0, fleets: new Set() }; current.count++; current.fleets.add(r.fleet); plates.set(r.plate, current); }); const rank = [...plates.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0, 6);
  $('vehicleRanking').innerHTML = rank.length ? rank.map(([plate, info], i) => `<li><span class="rank-number">${i + 1}</span><span class="rank-name">${escapeHtml(plate)}<small>${escapeHtml([...info.fleets].map(f => FLEETS[f]).join(' • '))}</small></span><span class="rank-count">${info.count} uso${info.count === 1 ? '' : 's'}</span></li>`).join('') : '<li class="no-results">Sem dados.</li>';
}
function renderTable() { const records = filteredRecords(); $('reportCount').textContent = `${records.length} rota${records.length === 1 ? '' : 's'} encontrada${records.length === 1 ? '' : 's'}`; $('usageTable').innerHTML = records.length ? records.map(r => `<tr><td>${escapeHtml(displayDate(r))}<br><small>${escapeHtml(r.sheet)}</small></td><td><span class="fleet-tag ${r.fleet === 'COOPERRITA' ? 'tag-house' : r.fleet === 'TERCEIROS FIXOS' ? 'tag-fixed' : 'tag-spot'}">${escapeHtml(FLEETS[r.fleet])}</span></td><td>${escapeHtml(r.plate)}</td><td>${escapeHtml(r.driver || '—')}</td><td>${escapeHtml(r.shipment || '—')}</td><td>${escapeHtml(r.city || '—')}${isOvernight(r) ? '<span class="overnight">Pernoite</span>' : ''}</td><td>${escapeHtml(r.source)}</td></tr>`).join('') : '<tr><td class="no-results" colspan="7">Nenhuma utilização corresponde aos filtros.</td></tr>'; }
function renderAbsenceTable() { const records = filteredAbsences(); $('absenceCount').textContent = `${records.length} ocorrência${records.length === 1 ? '' : 's'} no período`; $('absenceTable').innerHTML = records.length ? records.map(r => `<tr><td>${escapeHtml(displayDate(r))}<br><small>${escapeHtml(r.sheet)}</small></td><td>${escapeHtml(r.employee)}</td><td><span class="absence-tag ${r.type === 'FOLGA' ? 'absence-folga' : r.type === 'FÉRIAS' ? 'absence-ferias' : r.type === 'ATESTADO' ? 'absence-atestado' : 'absence-falta'}">${escapeHtml(ABSENCE_LABELS[r.type])}</span></td><td>${escapeHtml(r.source)}</td></tr>`).join('') : '<tr><td class="no-results" colspan="4">Nenhum afastamento corresponde aos filtros.</td></tr>'; }
function exportCsv() {
  const records = filteredRecords(), absences = filteredAbsences(), financial = state.crossAnalysis?.allRows || [];
  if (!records.length && !absences.length && !financial.length) { showToast('Não há dados para exportar.'); return; }
  const lines = [
    ['Tipo','Data saída','Data retorno','Frota / Ocorrência','Placa / Funcionário','Motorista','Telefone','Embarque','Cidades / Rota','Arquivo','Faturamento','Custo rota','R$/ton','KM informado','KM típico da rota','Proximidade desde Santa Rita do Sapucaí','Duração (dias)','Situação'],
    ...records.map(r => ['Rota', displayDate(r), '', FLEETS[r.fleet], r.plate, r.driver, r.phone, r.shipment, r.city, r.source,'','','','','','','','']),
    ...absences.map(r => ['Afastamento', displayDate(r), '', ABSENCE_LABELS[r.type], r.employee, '', '', '', '', r.source,'','','','','','','','']),
    ...financial.map(r => ['Financeiro', displayIsoDate(r.departureDate || r.costDate || r.date), displayIsoDate(r.returnDate), r.fleet ? FLEETS[r.fleet] : r.carrier, r.plate, r.driver, '', r.shipment, r.route, state.costBase?.fileName || '', r.revenue ?? '', r.cost ?? '', r.costPerTon ?? '', r.km ?? '', r.distanceKm ?? '', r.distanceBandLabel || '', r.durationDays ?? '', financialStatusLabel(r.status)])
  ];
  const csv = lines.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
  link.href = url; link.download = 'relatorio-frota-completo.csv'; link.click(); URL.revokeObjectURL(url);
}
function clearAll() { state.records = []; state.absences = []; state.audit = []; state.loadedKeys.clear(); state.crossAnalysis = null; state.driverPerformance = null; state.improvementAnalysis = null; state.activeTab = 'overview'; setActiveTab('overview', { focus: false, scroll: false }); $('dashboard').classList.add('hidden'); $('indicatorView').classList.add('hidden'); $('financialDetailView').classList.add('hidden'); setDetailMode(false); $('clearData').hidden = true; $('importStatus').textContent = 'Nenhuma planilha importada'; fileInput.value = ''; folderInput.value = ''; showToast('Dados removidos do painel.'); }

APP_TAB_CONFIG.forEach(tab => {
  const button = $(tab.buttonId);
  button.addEventListener('click', () => setActiveTab(tab.key, { focus: true, scroll: true }));
  button.addEventListener('keydown', event => navigateTabByKeyboard(event, tab.key));
});
$('chooseFiles').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', e => readFiles([...e.target.files])); folderInput.addEventListener('change', e => readFiles([...e.target.files]));
$('chooseCostFile').addEventListener('click', () => { costFileInput.value = ''; costFileInput.click(); }); costFileInput.addEventListener('change', e => prepareCostFile(e.target.files?.[0])); $('confirmCostSheet').addEventListener('click', confirmCostSheetImport); $('cancelCostSheet').addEventListener('click', closeCostSheetPicker); $('changeCostSheet').addEventListener('click', reopenCostSheetPicker); $('costSelectAll').addEventListener('click', () => selectPendingCostSheets(state.pendingCost?.names.map((_, index) => index) || [])); $('costClearSelection').addEventListener('click', () => selectPendingCostSheets([])); $('costSheetOptions').addEventListener('change', e => { const input = e.target.closest?.('[data-cost-sheet-index]'); if (input) updatePendingCostSheet(Number(input.dataset.costSheetIndex), Boolean(input.checked)); }); $('costSheetModal').addEventListener('click', e => { if (e.target === $('costSheetModal')) closeCostSheetPicker(); });
dropzone.addEventListener('click', e => { if (!e.target.closest('button')) fileInput.click(); }); dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
['dragenter', 'dragover'].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('dragging'); })); ['dragleave', 'drop'].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('dragging'); })); dropzone.addEventListener('drop', e => readFiles([...e.dataTransfer.files].filter(f => /\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(f.name))));
['searchInput', 'dateFilter', 'fleetFilter', 'plateFilter'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderTable)); ['employeeFilter', 'absenceFilter'].forEach(id => $(id).addEventListener('change', renderAbsenceTable)); $('clearData').addEventListener('click', clearAll); $('exportCsv').addEventListener('click', exportCsv);
$('financialSearch').addEventListener('input', renderFinancialTable); $('financialStatus').addEventListener('change', renderFinancialTable); $('backFinancialDetail').addEventListener('click', closeFinancialDetail);
$('refreshImprovements').addEventListener('click', () => { renderImprovementIdeas(); showToast('Ideias de melhoria atualizadas com os dados atuais.'); });
$('saveRate').addEventListener('click', saveRate); $('vehicleRateFleet').addEventListener('change', renderVehicleRateEditor); $('vehicleRatePlate').addEventListener('change', renderVehicleRateUsages); $('vehicleRateUsage').addEventListener('change', loadVehicleRateValue); $('saveVehicleRate').addEventListener('click', saveVehicleRate); $('removeVehicleRate').addEventListener('click', removeVehicleRate); document.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.detail))); $('backDashboard').addEventListener('click', closeDetail);
document.addEventListener('click', e => { const item = e.target.closest('.cost-result'); if (item) openDetail(item.dataset.detail); });
document.addEventListener('click', e => { const item = e.target.closest('.ranking-action'); if (item) openDetail(item.dataset.rankingKind, item.dataset.rankingFilter); });
document.addEventListener('click', e => { const item = e.target.closest('[data-performance-driver]'); if (item) openDetail('PERFORMANCE', item.dataset.performanceDriver); });
document.addEventListener('click', e => { const item = e.target.closest('[data-chart-day]'); if (item) openDetail('DAY', item.dataset.chartDay); });
document.addEventListener('click', e => { const item = e.target.closest('[data-improvement-index]'); if (item) openImprovementDetail(item.dataset.improvementIndex); });
document.addEventListener('click', e => { const item = e.target.closest('[data-financial-kind]'); if (item) openFinancialDetail(item.dataset.financialKind, item.dataset.financialFilter || '', item.dataset.financialFleet || '', item.dataset.financialCategory || ''); });
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('costSheetModal').classList.contains('hidden')) closeCostSheetPicker(); else if (!$('financialDetailView').classList.contains('hidden')) closeFinancialDetail(); else if (!$('indicatorView').classList.contains('hidden')) closeDetail(); });
setActiveTab(state.activeTab, { focus: false, scroll: false });

/* ===================================================
   PrintCalc 3D — Application Logic
   Bambu Lab A1 Combo · CEMIG Montes Claros MG
   =================================================== */

'use strict';

// ─── State ────────────────────────────────────────────────
const APP_KEY   = 'printcalc3d_v1';
const SYNC_KEY  = 'printcalc_syncCode';
const FB_KEY    = 'printcalc_firebase';

// Configuração padrão do Firebase do Ariel (conecta automaticamente em todos os aparelhos)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDRCKSJ-Z81-TzMUbrY9cw4haiV4h72zb8",
  authDomain: "printcalc-3d-218c2.firebaseapp.com",
  projectId: "printcalc-3d-218c2",
  storageBucket: "printcalc-3d-218c2.firebasestorage.app",
  messagingSenderId: "227036033568",
  appId: "1:227036033568:web:2f4920490b48e3aef1c245"
};

let state = {
  quotes: [],
  settings: {
    tariff:          0.956,
    bandeira:        0,
    machineCost:     4500,
    machineLife:     5000,
    printerPower:    89,
    maintenanceRate: 0.50,    // R$ por hora (não mais %)
    laborRate:       20,
    setupTime:       15,
    finishTime:      10,
    defaultMargin:   40,
  },
  syncCode:        '',
  firebaseConfig:  null,
  db:              null,       // Firestore instance
  currentModal:    null,       // quote id open in modal
  charts:          {},
};

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadLocalData();
  initSyncCode();
  restoreFirebase();
  applySettingsToUI();
  bindEvents();
  updateSlider();
  calculate();
  renderDashboard();
  renderHistory();
  updateTariffBadge();
  updateNavBadge();
  updateClientSuggestions();
});

// ─── Local Storage ────────────────────────────────────────
function loadLocalData() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state.quotes   = saved.quotes   || [];
      state.settings = { ...state.settings, ...(saved.settings || {}) };
    }
  } catch(e) { console.warn('LoadLocalData:', e); }
}

function saveLocalData() {
  try {
    localStorage.setItem(APP_KEY, JSON.stringify({
      quotes:   state.quotes,
      settings: state.settings,
    }));
  } catch(e) { console.warn('SaveLocalData:', e); }
}

// ─── Sync Code ────────────────────────────────────────────
function initSyncCode() {
  let code = localStorage.getItem(SYNC_KEY);
  if (!code) {
    code = generateSyncCode();
    localStorage.setItem(SYNC_KEY, code);
  }
  state.syncCode = code;
  el('syncCodeDisplay').textContent = code;
  el('syncCodeInput').placeholder   = `Ex: ${code}`;
}

function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Firebase ─────────────────────────────────────────────
async function restoreFirebase() {
  try {
    let cfg = null;
    const raw = localStorage.getItem(FB_KEY);
    if (raw) {
      cfg = JSON.parse(raw);
    } else if (DEFAULT_FIREBASE_CONFIG) {
      cfg = DEFAULT_FIREBASE_CONFIG;
    }
    if (cfg) {
      await initFirebase(cfg, false);
    }
  } catch(e) { /* silent */ }
}

async function initFirebase(cfg, showFeedback = true) {
  try {
    // Dynamically load Firebase SDK
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js');
    }

    if (window.firebase.apps && window.firebase.apps.length > 0) {
      window.firebase.apps.forEach(app => app.delete());
    }

    const app = window.firebase.initializeApp(cfg);
    state.db            = window.firebase.firestore(app);
    state.firebaseConfig = cfg;
    localStorage.setItem(FB_KEY, JSON.stringify(cfg));

    updateSyncStatus(true);
    if (showFeedback) {
      showFbStatus('✅ Firebase conectado com sucesso! Sincronizando...', 'ok');
      showToast('☁️ Sincronização em nuvem ativada!', 'success');
    }

    // Initial sync
    await syncFromFirebase();
    startFirebaseListener();
  } catch(err) {
    console.error('Firebase init error:', err);
    if (showFeedback) {
      showFbStatus(`❌ Erro: ${err.message || 'Configuração inválida'}`, 'err');
    }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function syncFromFirebase() {
  if (!state.db || !state.syncCode) return;
  try {
    const doc = await state.db.collection('sessions').doc(state.syncCode).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.quotes)   state.quotes   = data.quotes;
      if (data.settings) state.settings = { ...state.settings, ...data.settings };
      saveLocalData();
      renderDashboard();
      renderHistory();
      applySettingsToUI();
      updateNavBadge();
    }
  } catch(e) { console.warn('Sync from Firebase:', e); }
}

async function syncToFirebase() {
  if (!state.db || !state.syncCode) return;
  try {
    await state.db.collection('sessions').doc(state.syncCode).set({
      quotes:    state.quotes,
      settings:  state.settings,
      updatedAt: new Date().toISOString(),
    });
  } catch(e) { console.warn('Sync to Firebase:', e); }
}

function startFirebaseListener() {
  if (!state.db || !state.syncCode) return;
  state.db.collection('sessions').doc(state.syncCode).onSnapshot(doc => {
    if (doc.exists && !doc.metadata.hasPendingWrites) {
      const data = doc.data();
      if (data.quotes)   state.quotes   = data.quotes;
      if (data.settings) state.settings = { ...state.settings, ...data.settings };
      saveLocalData();
      renderDashboard();
      renderHistory();
      updateNavBadge();
    }
  });
}

function updateSyncStatus(online) {
  const s = el('syncStatus');
  s.textContent = online ? '● Nuvem' : '● Local';
  s.className   = 'printer-status' + (online ? ' online' : '');
}

// ─── Settings ─────────────────────────────────────────────
function applySettingsToUI() {
  const s = state.settings;
  setVal('settingsTariff',         s.tariff);
  setVal('settingsBandeira',       s.bandeira);
  setVal('settingsMachineCost',    s.machineCost);
  setVal('settingsMachineLife',    s.machineLife);
  setVal('settingsPower',          s.printerPower);
  setVal('settingsMaintenanceRate',s.maintenanceRate);
  setVal('settingsLaborRate',      s.laborRate);
  setVal('settingsDefaultMargin',  s.defaultMargin);
  setVal('settingsSetupTime',      s.setupTime);
  setVal('settingsFinishTime',     s.finishTime);

  // Apply defaults to calculator form
  setVal('printerPower',     s.printerPower);
  setVal('machineCost',      s.machineCost);
  setVal('machineLife',      s.machineLife);
  setVal('maintenanceRate',  s.maintenanceRate);
  setVal('laborRate',        s.laborRate);
  setVal('laborSetup',       s.setupTime);
  setVal('laborFinish',      s.finishTime);
  setVal('profitMargin',     s.defaultMargin);

  updateTotalTariff();
  updateTariffBadge();
  updateSlider();
}

function saveSettings() {
  state.settings = {
    tariff:          parseFloat(getVal('settingsTariff'))          || 0.956,
    bandeira:        parseFloat(getVal('settingsBandeira'))        || 0,
    machineCost:     parseFloat(getVal('settingsMachineCost'))     || 4500,
    machineLife:     parseFloat(getVal('settingsMachineLife'))     || 5000,
    printerPower:    parseFloat(getVal('settingsPower'))           || 89,
    maintenanceRate: parseFloat(getVal('settingsMaintenanceRate')) || 0.50,
    laborRate:       parseFloat(getVal('settingsLaborRate'))       || 20,
    defaultMargin:   parseFloat(getVal('settingsDefaultMargin'))   || 40,
    setupTime:       parseFloat(getVal('settingsSetupTime'))       || 15,
    finishTime:      parseFloat(getVal('settingsFinishTime'))      || 10,
  };
  saveLocalData();
  syncToFirebase();
  applySettingsToUI();
  calculate();
  showToast('✅ Configurações salvas!', 'success');
}

function updateTotalTariff() {
  const tariff   = parseFloat(getVal('settingsTariff'))   || 0.956;
  const bandeira = parseFloat(getVal('settingsBandeira')) || 0;
  el('totalTariffDisplay').textContent = `R$ ${fmtMoney(tariff + bandeira)}/kWh`;
}

// ─── Calculator ───────────────────────────────────────────
function calculate() {
  const printH   = parseFloat(getVal('printHours'))   || 0;
  const printM   = parseFloat(getVal('printMinutes')) || 0;
  const totalH   = printH + printM / 60;

  const power    = parseFloat(getVal('printerPower')) || state.settings.printerPower;
  const tariff   = (state.settings.tariff || 0.956) + (state.settings.bandeira || 0);

  // 1. Energy
  const kWh         = (power / 1000) * totalH;
  const energyCost  = kWh * tariff;

  // 2. Filament
  const grams        = parseFloat(getVal('filamentWeight'))   || 0;
  const priceKg      = parseFloat(getVal('filamentPriceKg'))  || 0;
  const filamentCost = (grams / 1000) * priceKg;

  // 3. Machine depreciation + flat maintenance R$/h
  const mCost    = parseFloat(getVal('machineCost'))      || state.settings.machineCost;
  const mLife    = parseFloat(getVal('machineLife'))       || state.settings.machineLife;
  const maint    = parseFloat(getVal('maintenanceRate'))   || state.settings.maintenanceRate;
  const depreciation    = (mCost / mLife) * totalH;
  const maintenanceCost = maint * totalH;   // R$/h direto, sem % do custo
  const machineTotalCost = depreciation + maintenanceCost;

  // 4. Labor
  const lRate    = parseFloat(getVal('laborRate'))    || state.settings.laborRate;
  const lSetup   = parseFloat(getVal('laborSetup'))   || state.settings.setupTime;
  const lFinish  = parseFloat(getVal('laborFinish'))  || state.settings.finishTime;
  const laborH   = (lSetup + lFinish) / 60;
  const laborCost= laborH * lRate;

  // 5. Packaging
  const packCost = parseFloat(getVal('packagingCost')) || 0;
  const shipCost = parseFloat(getVal('shippingCost'))  || 0;
  const packTotal= packCost + shipCost;

  // Total
  const totalCost   = energyCost + filamentCost + machineTotalCost + laborCost + packTotal;
  const margin      = parseFloat(getVal('profitMargin')) || 0;
  const sellingPrice= totalCost * (1 + margin / 100);
  const profit      = sellingPrice - totalCost;

  // Update energy mini-display
  el('energyKwhDisplay').textContent = `${kWh.toFixed(3)} kWh`;
  el('energyCostMini').textContent   = `R$ ${fmtMoney(energyCost)}`;
  el('machineDisplay').textContent   = `R$ ${fmtMoney(machineTotalCost)}`;

  // Update breakdown bars
  const max = Math.max(totalCost, 0.01);
  updateBar('barEnergy',    'resultEnergy',    energyCost,       max);
  updateBar('barFilament',  'resultFilament',  filamentCost,     max);
  updateBar('barMachine',   'resultMachine',   machineTotalCost, max);
  updateBar('barLabor',     'resultLabor',     laborCost,        max);
  updateBar('barPackaging', 'resultPackaging', packTotal,        max);

  el('resultTotalCost').textContent  = `R$ ${fmtMoney(totalCost)}`;
  el('resultSellingPrice').textContent = `R$ ${fmtMoney(sellingPrice)}`;
  el('resultProfit').textContent     = `R$ ${fmtMoney(profit)}`;

  // Margin display
  el('marginDisplay').textContent = `${margin.toFixed(0)}%`;
  updateSlider();

  return { energyCost, filamentCost, machineTotalCost, laborCost, packTotal, totalCost, sellingPrice, profit, margin, totalH, kWh };
}

function updateBar(barId, valId, amount, total) {
  const pct = total > 0 ? Math.min((amount / total) * 100, 100) : 0;
  el(barId).style.width  = `${pct}%`;
  el(valId).textContent  = `R$ ${fmtMoney(amount)}`;
}

function updateSlider() {
  const slider = el('profitMargin');
  if (!slider) return;
  const val = parseFloat(slider.value) || 0;
  const pct = (val / 300) * 100;
  slider.style.setProperty('--fill', `${pct}%`);
}

// ─── Save Quote ───────────────────────────────────────────
function saveQuote() {
  const client = getVal('clientName').trim();
  const piece  = getVal('pieceName').trim();
  if (!client) { showToast('⚠️ Informe o nome do cliente', 'error'); return; }
  if (!piece)  { showToast('⚠️ Informe o nome da peça',   'error'); return; }

  const c = calculate();

  const quote = {
    id:              Date.now().toString(),
    date:            new Date().toISOString(),
    clientName:      client,
    pieceName:       piece,
    filamentType:    getVal('filamentType'),
    filamentWeight:  parseFloat(getVal('filamentWeight'))   || 0,
    filamentPriceKg: parseFloat(getVal('filamentPriceKg'))  || 0,
    printHours:      parseFloat(getVal('printHours'))       || 0,
    printMinutes:    parseFloat(getVal('printMinutes'))      || 0,
    printerPower:    parseFloat(getVal('printerPower'))      || 89,
    laborRate:       parseFloat(getVal('laborRate'))         || 20,
    laborSetup:      parseFloat(getVal('laborSetup'))        || 15,
    laborFinish:     parseFloat(getVal('laborFinish'))       || 10,
    packagingCost:   parseFloat(getVal('packagingCost'))     || 0,
    shippingCost:    parseFloat(getVal('shippingCost'))      || 0,
    notes:           getVal('notes'),
    energyCost:      c.energyCost,
    filamentCost:    c.filamentCost,
    machineCost:     c.machineTotalCost,
    laborCost:       c.laborCost,
    packTotal:       c.packTotal,
    totalCost:       c.totalCost,
    sellingPrice:    c.sellingPrice,
    profit:          c.profit,
    margin:          c.margin,
    totalPrintHours: c.totalH,
    status:         'pending',
  };

  state.quotes.unshift(quote);
  saveLocalData();
  syncToFirebase();

  renderDashboard();
  renderHistory();
  updateNavBadge();
  updateClientSuggestions();

  showToast(`✅ Pedido de "${client}" salvo!`, 'success');
  resetCalculatorForm();
  showSection('history');
}

function resetCalculatorForm() {
  setVal('clientName',    '');
  setVal('pieceName',     '');
  setVal('printHours',    '0');
  setVal('printMinutes',  '0');
  setVal('filamentWeight','0');
  setVal('packagingCost', '0');
  setVal('shippingCost',  '0');
  setVal('notes',         '');
  calculate();
}

// ─── Dashboard ────────────────────────────────────────────
function renderDashboard() {
  const quotes = state.quotes;

  // Stats
  const totalOrders   = quotes.length;
  const totalRevenue  = quotes.reduce((s, q) => s + q.sellingPrice, 0);
  const totalProfit   = quotes.reduce((s, q) => s + q.profit, 0);
  const avgTicket     = totalOrders ? totalRevenue / totalOrders : 0;

  el('totalOrders').textContent   = totalOrders;
  el('totalRevenue').textContent  = `R$ ${fmtMoney(totalRevenue)}`;
  el('totalProfit').textContent   = `R$ ${fmtMoney(totalProfit)}`;
  el('avgTicket').textContent     = `R$ ${fmtMoney(avgTicket)}`;

  // Stat changes
  const thisMonth  = quotes.filter(q => isThisMonth(q.date));
  const lastMonth  = quotes.filter(q => isLastMonth(q.date));
  const tRev = thisMonth.reduce((s,q)=>s+q.sellingPrice,0);
  const lRev = lastMonth.reduce((s,q)=>s+q.sellingPrice,0);

  el('ordersChange').textContent  = `${thisMonth.length} esse mês`;
  el('revenueChange').textContent = lRev > 0
    ? `${tRev >= lRev ? '+' : ''}${fmtPct((tRev - lRev) / lRev * 100)} vs mês anterior`
    : (totalOrders ? 'Sem comparativo' : 'Aguardando pedidos');
  el('revenueChange').className = 'stat-change' + (tRev >= lRev && lRev > 0 ? ' up' : lRev > 0 ? ' down' : '');

  const avgMargin = totalOrders
    ? quotes.reduce((s,q)=>s+q.margin,0) / totalOrders
    : 0;
  el('profitChange').textContent  = `${fmtPct(avgMargin)} margem média`;
  el('ticketChange').textContent  = `${totalOrders} pedido(s) total`;

  renderRevenueChart();
  renderCostChart();
  renderFilamentChart();
  renderTopClients();
  renderRecentList();
}

function renderRevenueChart() {
  const quotes = state.quotes;
  const labels = getLast6Months();
  const revData   = labels.map(m => sumByMonth(quotes, m, 'sellingPrice'));
  const profData  = labels.map(m => sumByMonth(quotes, m, 'profit'));
  const hasData   = revData.some(v => v > 0);

  el('revenueEmpty').style.display  = hasData ? 'none' : 'flex';

  const ctx = el('revenueChart').getContext('2d');
  if (state.charts.revenue) state.charts.revenue.destroy();

  state.charts.revenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Faturamento',
          data: revData,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,.1)',
          pointBackgroundColor: '#8b5cf6',
          tension: .4, fill: true, borderWidth: 2, pointRadius: 4,
        },
        {
          label: 'Lucro',
          data: profData,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52,211,153,.07)',
          pointBackgroundColor: '#34d399',
          tension: .4, fill: true, borderWidth: 2, pointRadius: 4,
        },
      ],
    },
    options: chartOpts({ prefix: 'R$ ' }),
  });
}

function renderCostChart() {
  const quotes = state.quotes;
  const totals = {
    '⚡ Energia':    quotes.reduce((s,q)=>s+q.energyCost, 0),
    '🧵 Filamento':  quotes.reduce((s,q)=>s+q.filamentCost, 0),
    '🖨️ Máquina':   quotes.reduce((s,q)=>s+q.machineCost, 0),
    '👷 Mão de obra':quotes.reduce((s,q)=>s+q.laborCost, 0),
    '📦 Embalagem':  quotes.reduce((s,q)=>s+q.packTotal, 0),
  };
  const vals   = Object.values(totals);
  const hasData= vals.some(v => v > 0);
  el('costsEmpty').style.display = hasData ? 'none' : 'flex';

  const ctx = el('costsChart').getContext('2d');
  if (state.charts.costs) state.charts.costs.destroy();

  state.charts.costs = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(totals),
      datasets: [{
        data: vals,
        backgroundColor: ['#f59e0b','#8b5cf6','#ec4899','#34d399','#6366f1'],
        borderColor: 'transparent',
        hoverOffset: 8,
      }],
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 }, padding: 12, boxWidth: 10 } } },
      cutout: '65%',
    },
  });
}

function renderFilamentChart() {
  const map = {};
  state.quotes.forEach(q => {
    const t = q.filamentType || 'PLA';
    map[t] = (map[t] || 0) + (q.filamentWeight || 0);
  });
  const labels = Object.keys(map);
  const vals   = Object.values(map);
  const hasData= vals.some(v => v > 0);

  el('filamentEmpty').style.display = hasData ? 'none' : 'flex';
  const ctx = el('filamentChart').getContext('2d');
  if (state.charts.filament) state.charts.filament.destroy();

  const colors = ['#8b5cf6','#22d3ee','#f59e0b','#34d399','#f472b6','#818cf8','#fbbf24','#a78bfa','#6ee7b7'];
  state.charts.filament = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Gramas',
        data: vals,
        backgroundColor: labels.map((_,i) => colors[i % colors.length] + '99'),
        borderColor:     labels.map((_,i) => colors[i % colors.length]),
        borderWidth: 1, borderRadius: 6,
      }],
    },
    options: chartOpts({ suffix: ' g', showLegend: false }),
  });
}

function renderTopClients() {
  const map = {};
  state.quotes.forEach(q => {
    const n = q.clientName || 'Sem nome';
    if (!map[n]) map[n] = 0;
    map[n] += q.sellingPrice;
  });
  const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxVal = sorted[0]?.[1] || 1;
  const container = el('topClients');

  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state-small"><span>👥</span><p>Nenhum cliente cadastrado</p></div>`;
    return;
  }

  container.innerHTML = sorted.map(([name, val]) => `
    <div class="client-row">
      <div class="client-avatar">${name.charAt(0).toUpperCase()}</div>
      <div class="client-info">
        <div class="client-name" title="${esc(name)}">${esc(name)}</div>
        <div class="client-val">R$ ${fmtMoney(val)}</div>
      </div>
      <div class="client-bar-wrap">
        <div class="client-bar">
          <div class="client-bar-fill" style="width:${(val/maxVal)*100}%"></div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderRecentList() {
  const recent = state.quotes.slice(0, 5);
  const container = el('recentList');

  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state-small"><span>📋</span><p>Nenhum pedido ainda</p></div>`;
    return;
  }

  const colors = { paid:'#34d399', pending:'#fbbf24' };
  container.innerHTML = recent.map(q => `
    <div class="recent-item" onclick="openDetailModal('${q.id}')">
      <div class="recent-dot" style="background:${colors[q.status]||'#64748b'}"></div>
      <div class="recent-info">
        <div class="recent-client">${esc(q.clientName)}</div>
        <div class="recent-piece">${esc(q.pieceName)} · ${q.filamentType}</div>
      </div>
      <div class="recent-price">R$ ${fmtMoney(q.sellingPrice)}</div>
    </div>
  `).join('');
}

// ─── History ──────────────────────────────────────────────
function renderHistory(filter = '') {
  const search  = (el('searchInput')?.value  || '').toLowerCase();
  const fType   = el('filterFilament')?.value || '';
  const fStatus = el('filterStatus')?.value   || '';

  let quotes = state.quotes;
  if (search)  quotes = quotes.filter(q =>
    q.clientName?.toLowerCase().includes(search) ||
    q.pieceName?.toLowerCase().includes(search)
  );
  if (fType)   quotes = quotes.filter(q => q.filamentType === fType);
  if (fStatus) quotes = quotes.filter(q => q.status === fStatus);

  const tbody   = el('historyBody');
  const empty   = el('historyEmpty');
  const table   = el('historyTable');

  if (quotes.length === 0) {
    tbody.innerHTML    = '';
    table.style.display= 'none';
    empty.style.display= 'flex';
    return;
  }

  table.style.display= '';
  empty.style.display= 'none';

  tbody.innerHTML = quotes.map(q => {
    const h = Math.floor(q.totalPrintHours || 0);
    const m = Math.round(((q.totalPrintHours || 0) - h) * 60);
    const timeStr = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
    const dateStr = new Date(q.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const stBadge = q.status === 'paid'
      ? `<span class="status-badge status-paid">✅ Pago</span>`
      : `<span class="status-badge status-pending">⏳ Pendente</span>`;

    return `
      <tr>
        <td>${dateStr}</td>
        <td><strong>${esc(q.clientName)}</strong></td>
        <td>${esc(q.pieceName)}</td>
        <td>${q.filamentType || '—'}</td>
        <td>${timeStr}</td>
        <td class="cost">R$ ${fmtMoney(q.totalCost)}</td>
        <td class="price">R$ ${fmtMoney(q.sellingPrice)}</td>
        <td class="profit">R$ ${fmtMoney(q.profit)}</td>
        <td>${stBadge}</td>
        <td>
          <button class="action-btn view" onclick="openDetailModal('${q.id}')" title="Ver detalhes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="action-btn del" onclick="deleteQuote('${q.id}')" title="Excluir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Detail Modal ─────────────────────────────────────────
function openDetailModal(id) {
  const q = state.quotes.find(x => x.id === id);
  if (!q) return;
  state.currentModal = id;

  const h = Math.floor(q.totalPrintHours || 0);
  const m = Math.round(((q.totalPrintHours || 0) - h) * 60);
  const timeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;

  el('modalTitle').textContent = `Pedido: ${q.pieceName}`;
  el('modalBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">👤 Cliente</div>
        <div class="detail-val">${esc(q.clientName)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">🏷️ Peça</div>
        <div class="detail-val">${esc(q.pieceName)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">📅 Data</div>
        <div class="detail-val">${new Date(q.date).toLocaleString('pt-BR')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">🧵 Filamento</div>
        <div class="detail-val">${q.filamentType} · ${q.filamentWeight}g</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">⏱️ Tempo</div>
        <div class="detail-val">${timeStr}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">📋 Status</div>
        <div class="detail-val">${q.status === 'paid' ? '✅ Pago' : '⏳ Pendente'}</div>
      </div>
      <div class="detail-sep"></div>
      <div class="detail-item">
        <div class="detail-label">⚡ Energia</div>
        <div class="detail-val" style="color:#fbbf24">R$ ${fmtMoney(q.energyCost)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">🧵 Filamento</div>
        <div class="detail-val" style="color:#a78bfa">R$ ${fmtMoney(q.filamentCost)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">🖨️ Máquina</div>
        <div class="detail-val" style="color:#f472b6">R$ ${fmtMoney(q.machineCost)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">👷 Mão de obra</div>
        <div class="detail-val" style="color:#34d399">R$ ${fmtMoney(q.laborCost)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">📦 Embalagem/Frete</div>
        <div class="detail-val" style="color:#818cf8">R$ ${fmtMoney(q.packTotal)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">💰 Margem</div>
        <div class="detail-val">${(q.margin||0).toFixed(0)}%</div>
      </div>
      <div class="detail-sep"></div>
      <div class="detail-item">
        <div class="detail-label">🏷️ Custo Total</div>
        <div class="detail-val">R$ ${fmtMoney(q.totalCost)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">💵 Preço de Venda</div>
        <div class="detail-val" style="color:#a78bfa;font-size:20px">R$ ${fmtMoney(q.sellingPrice)}</div>
      </div>
      <div class="detail-item full-w">
        <div class="detail-label">📈 Lucro</div>
        <div class="detail-val" style="color:#34d399;font-size:20px">R$ ${fmtMoney(q.profit)}</div>
      </div>
      ${q.notes ? `
      <div class="detail-item full-w">
        <div class="detail-label">📝 Observações</div>
        <div class="detail-note">${esc(q.notes)}</div>
      </div>` : ''}
    </div>
  `;

  el('togglePayBtn').textContent = q.status === 'paid' ? 'Marcar como Pendente' : 'Marcar como Pago';
  el('detailModal').classList.add('open');
}

function closeModal() {
  el('detailModal').classList.remove('open');
  state.currentModal = null;
}

function togglePaymentStatus() {
  const q = state.quotes.find(x => x.id === state.currentModal);
  if (!q) return;
  q.status = q.status === 'paid' ? 'pending' : 'paid';
  saveLocalData();
  syncToFirebase();
  renderHistory();
  renderDashboard();
  openDetailModal(q.id); // refresh modal
  showToast(`✅ Status alterado para "${q.status === 'paid' ? 'Pago' : 'Pendente'}"`, 'success');
}

function deleteCurrentQuote() {
  if (!state.currentModal) return;
  deleteQuote(state.currentModal);
  closeModal();
}

function deleteQuote(id) {
  if (!confirm('Excluir este pedido? Esta ação não pode ser desfeita.')) return;
  state.quotes = state.quotes.filter(q => q.id !== id);
  saveLocalData();
  syncToFirebase();
  renderHistory();
  renderDashboard();
  updateNavBadge();
  showToast('🗑️ Pedido excluído', 'info');
}

// ─── Export / Import ──────────────────────────────────────
function exportCSV() {
  const headers = ['Data','Cliente','Peça','Filamento','Peso(g)','Tempo(h)','Energia(R$)','Filamento(R$)','Máquina(R$)','MãoDeObra(R$)','Embalagem(R$)','CustoTotal(R$)','PreçoVenda(R$)','Lucro(R$)','Margem(%)','Status'];
  const rows = state.quotes.map(q => [
    new Date(q.date).toLocaleDateString('pt-BR'),
    q.clientName, q.pieceName, q.filamentType, q.filamentWeight,
    (q.totalPrintHours||0).toFixed(2),
    q.energyCost.toFixed(2), q.filamentCost.toFixed(2), q.machineCost.toFixed(2),
    q.laborCost.toFixed(2), q.packTotal.toFixed(2), q.totalCost.toFixed(2),
    q.sellingPrice.toFixed(2), q.profit.toFixed(2), q.margin.toFixed(0), q.status,
  ]);
  const csv  = [headers, ...rows].map(r => r.join(';')).join('\n');
  downloadFile(`printcalc_historico_${todayStr()}.csv`, csv, 'text/csv;charset=utf-8;');
}

function exportJSON() {
  const data = JSON.stringify({ quotes: state.quotes, settings: state.settings }, null, 2);
  downloadFile(`printcalc_backup_${todayStr()}.json`, data, 'application/json');
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.quotes) throw new Error('Arquivo inválido');
      if (!confirm(`Importar ${data.quotes.length} pedidos? Os dados atuais serão mesclados.`)) return;
      // Merge: add quotes not already present
      const existingIds = new Set(state.quotes.map(q => q.id));
      const newQuotes   = (data.quotes || []).filter(q => !existingIds.has(q.id));
      state.quotes = [...newQuotes, ...state.quotes];
      if (data.settings) state.settings = { ...state.settings, ...data.settings };
      saveLocalData();
      syncToFirebase();
      renderDashboard();
      renderHistory();
      applySettingsToUI();
      updateNavBadge();
      showToast(`✅ ${newQuotes.length} pedidos importados!`, 'success');
    } catch(err) {
      showToast(`❌ Arquivo inválido: ${err.message}`, 'error');
    }
    event.target.value = ''; // reset
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('⚠️ Limpar TODOS os dados? Esta ação é irreversível!')) return;
  if (!confirm('Tem certeza? Todos os pedidos e configurações serão apagados.')) return;
  state.quotes = [];
  state.settings = {
    tariff:0.956,bandeira:0,machineCost:4500,machineLife:5000,
    printerPower:89,maintenanceRate:0.5,laborRate:20,
    setupTime:15,finishTime:10,defaultMargin:40,
  };
  saveLocalData();
  syncToFirebase();
  applySettingsToUI();
  renderDashboard();
  renderHistory();
  updateNavBadge();
  showToast('🗑️ Dados limpos', 'info');
}

// ─── Sync Code Connect ────────────────────────────────────
function applySyncCode() {
  const input = el('syncCodeInput').value.trim().toUpperCase();
  if (!input || input.length < 6) {
    showToast('⚠️ Código inválido', 'error'); return;
  }
  if (!confirm(`Conectar com código "${input}"? Seus dados serão substituídos pelos dados deste código.`)) return;
  state.syncCode = input;
  localStorage.setItem(SYNC_KEY, input);
  el('syncCodeDisplay').textContent = input;
  el('syncCodeInput').value = '';
  // Re-sync from Firebase with new code
  if (state.db) {
    syncFromFirebase().then(() => showToast(`☁️ Conectado ao código ${input}!`, 'success'));
  } else {
    showToast(`✅ Código alterado para ${input}. Configure o Firebase para sincronizar.`, 'info');
  }
}

function copySyncCode() {
  navigator.clipboard.writeText(state.syncCode)
    .then(() => showToast('📋 Código copiado!', 'success'))
    .catch(() => showToast('❌ Não foi possível copiar', 'error'));
}

function saveFirebaseConfig() {
  const raw = el('firebaseConfigInput').value.trim();
  if (!raw) { showFbStatus('Cole a configuração Firebase antes de conectar.', 'err'); return; }
  try {
    const cfg = JSON.parse(raw);
    if (!cfg.apiKey || !cfg.projectId) throw new Error('apiKey ou projectId ausente');
    initFirebase(cfg, true);
  } catch(err) {
    showFbStatus(`❌ JSON inválido: ${err.message}`, 'err');
  }
}

function showFbStatus(msg, type) {
  const el_ = el('firebaseStatusMsg');
  el_.textContent = msg;
  el_.className   = `firebase-status-msg ${type}`;
}

// ─── Navigation ───────────────────────────────────────────
function showSection(name) {
  const sections = {
    dashboard:  { sec: 'dashboardSection',  title: 'Dashboard',      sub: 'Visão geral do seu negócio' },
    calculator: { sec: 'calculatorSection', title: 'Novo Cálculo',   sub: 'Bambu Lab A1 Combo · CEMIG Montes Claros' },
    history:    { sec: 'historySection',    title: 'Histórico',      sub: 'Todos os pedidos salvos' },
    settings:   { sec: 'settingsSection',   title: 'Configurações',  sub: 'CEMIG, impressora, sincronização' },
  };
  const s = sections[name];
  if (!s) return;

  document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => { x.classList.remove('active'); x.removeAttribute('aria-current'); });

  el(s.sec).classList.add('active');
  const navEl = el(`nav-${name}`);
  if (navEl) { navEl.classList.add('active'); navEl.setAttribute('aria-current', 'page'); }
  el('pageTitle').textContent    = s.title;
  el('pageSubtitle').textContent = s.sub;

  // Close mobile sidebar
  el('sidebar').classList.remove('mobile-open');
}

// ─── Event Bindings ───────────────────────────────────────
function bindEvents() {
  // Nav items
  document.querySelectorAll('.nav-item[data-section]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); showSection(a.dataset.section); });
  });

  // Link buttons (View all)
  document.querySelectorAll('.link-btn[data-section]').forEach(b => {
    b.addEventListener('click', e => { e.preventDefault(); showSection(b.dataset.section); });
  });

  // Topbar new quote
  el('newQuoteTopBtn').addEventListener('click', () => showSection('calculator'));
  el('firstCalcBtn').addEventListener('click',   () => showSection('calculator'));

  // Sidebar collapse
  el('collapseBtn').addEventListener('click', () => {
    el('sidebar').classList.toggle('collapsed');
  });

  // Mobile menu
  el('menuBtn').addEventListener('click', () => {
    el('sidebar').classList.toggle('mobile-open');
  });

  // Calculator inputs — live calculate
  const calcInputs = ['printHours','printMinutes','printerPower','filamentWeight','filamentPriceKg','machineCost','machineLife','maintenanceRate','laborRate','laborSetup','laborFinish','packagingCost','shippingCost','profitMargin','filamentType'];
  calcInputs.forEach(id => el(id)?.addEventListener('input', calculate));

  // Margin slider label sync
  el('profitMargin').addEventListener('input', () => {
    const v = parseFloat(el('profitMargin').value);
    el('marginDisplay').textContent = `${v.toFixed(0)}%`;
    updateSlider();
    calculate();
    // Highlight active preset
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.margin) === v);
    });
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.addEventListener('click', () => {
      setVal('profitMargin', b.dataset.margin);
      updateSlider();
      calculate();
      document.querySelectorAll('.preset-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });

  // Save quote
  el('saveBtn').addEventListener('click', saveQuote);

  // History search/filter
  el('searchInput').addEventListener('input',    renderHistory);
  el('filterFilament').addEventListener('change', renderHistory);
  el('filterStatus').addEventListener('change',   renderHistory);
  el('exportCsvBtn').addEventListener('click',    exportCSV);

  // Settings
  el('saveSettingsBtn').addEventListener('click',  saveSettings);
  el('settingsTariff').addEventListener('input',   updateTotalTariff);
  el('settingsBandeira').addEventListener('change', updateTotalTariff);
  el('exportJsonBtn').addEventListener('click',    exportJSON);
  el('importFile').addEventListener('change',      importJSON);
  el('clearDataBtn').addEventListener('click',     clearAllData);

  // Sync
  el('copySyncBtn').addEventListener('click', copySyncCode);
  el('applySyncBtn').addEventListener('click', applySyncCode);
  el('saveFirebaseBtn').addEventListener('click', saveFirebaseConfig);

  // Modal
  el('closeModalBtn').addEventListener('click',  closeModal);
  el('closeModalBtn2').addEventListener('click', closeModal);
  el('togglePayBtn').addEventListener('click',   togglePaymentStatus);
  el('deleteQuoteBtn').addEventListener('click', deleteCurrentQuote);
  el('detailModal').addEventListener('click', e => {
    if (e.target === el('detailModal')) closeModal();
  });
}

// ─── Helpers ──────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function getVal(id) { return el(id)?.value ?? ''; }
function setVal(id, v) { const e = el(id); if (e) e.value = v; }
function fmtMoney(v) { return (v||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtPct(v) { return `${(v||0).toFixed(1)}%`; }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayStr() { return new Date().toISOString().slice(0,10); }

function downloadFile(name, content, type) {
  const blob = new Blob(['\uFEFF'+content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  t.innerHTML = `<span class="toast-icon">${icons[type]||'💬'}</span><span>${msg}</span>`;
  el('toastContainer').appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(24px)'; t.style.transition='all .3s ease'; }, 2800);
  setTimeout(() => t.remove(), 3200);
}

function updateNavBadge() {
  el('navBadge').textContent = state.quotes.length;
}

function updateTariffBadge() {
  const t = (state.settings.tariff || 0.956) + (state.settings.bandeira || 0);
  const bVal = parseFloat(state.settings.bandeira) || 0;
  const name = bVal === 0 ? 'Verde' : bVal < 0.02 ? 'Amarela' : bVal < 0.05 ? 'Vermelha 1' : bVal < 0.10 ? 'Vermelha 2' : 'Escassez';
  const emoji= bVal === 0 ? '🟢' : bVal < 0.02 ? '🟡' : '🔴';
  el('tariffBadgeText').textContent = `${emoji} ${name} · R$ ${fmtMoney(t)}/kWh`;
}

function updateClientSuggestions() {
  const dl = el('clientSuggestions');
  if (!dl) return;
  const names = [...new Set(state.quotes.map(q => q.clientName).filter(Boolean))];
  dl.innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }));
  }
  return months;
}

function sumByMonth(quotes, monthLabel, field) {
  return quotes.filter(q => {
    const d = new Date(q.date);
    const label = d.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });
    return label === monthLabel;
  }).reduce((s, q) => s + (q[field] || 0), 0);
}

function isThisMonth(iso) {
  const now = new Date();
  const d   = new Date(iso);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isLastMonth(iso) {
  const now  = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const d    = new Date(iso);
  return d.getMonth() === last.getMonth() && d.getFullYear() === last.getFullYear();
}

function chartOpts({ prefix = '', suffix = '', showLegend = true } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        labels: { color:'#94a3b8', font: { family:'Outfit', size:11 }, padding:16, boxWidth:10 },
      },
      tooltip: {
        backgroundColor: 'rgba(13,13,34,.95)',
        borderColor: 'rgba(255,255,255,.1)',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        padding: 12,
        callbacks: {
          label: ctx => `${ctx.dataset.label || ''}: ${prefix}${ctx.parsed.y?.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})||ctx.parsed.y}${suffix}`,
        },
      },
    },
    scales: {
      x: { grid: { color:'rgba(255,255,255,.04)' }, ticks: { color:'#64748b', font:{family:'Outfit',size:11} } },
      y: { grid: { color:'rgba(255,255,255,.04)' }, ticks: { color:'#64748b', font:{family:'Outfit',size:11},
        callback: v => `${prefix}${v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(0)}${suffix}`,
      }},
    },
  };
}

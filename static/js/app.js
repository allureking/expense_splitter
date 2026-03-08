// ===== SplitEase - Main Application =====

// --- Base URL (works behind reverse proxy sub-path) ---
const BASE_URL = (() => {
    // Detect if we're behind a sub-path (e.g. /split/)
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
        const src = s.getAttribute('src');
        if (src.includes('app.js')) {
            // Script is loaded as "js/app.js" relative to the page
            // The page URL gives us the base path
            break;
        }
    }
    // Use the current page path as base, stripping trailing index.html
    let base = window.location.pathname.replace(/index\.html$/, '');
    if (!base.endsWith('/')) base += '/';
    return base;
})();

function apiUrl(path) {
    // path like "api/projects" or "api/ip"
    return BASE_URL + path;
}

// --- State ---
let project = {
    name: '',
    currency: getDefaultCurrency(),
    people: [],
    expenses: []
};

let cloudId = null;
let syncTimer = null;
let editingExpenseId = null;
let history = JSON.parse(localStorage.getItem('splitease_history') || '[]');
let currentTheme = localStorage.getItem('splitease_theme') || 'light';

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    applyTheme(currentTheme);
    applyLanguage();

    const urlParams = new URLSearchParams(window.location.search);
    const pid = urlParams.get('id');

    if (pid) {
        cloudId = pid;
        await loadFromServer(pid);
    } else {
        const draft = localStorage.getItem('splitease_draft');
        if (draft) {
            try {
                project = JSON.parse(draft);
            } catch (e) {}
        }
    }

    render();
    setupKeyboardShortcuts();
});

// --- Theme ---
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = theme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
}

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('splitease_theme', currentTheme);
    applyTheme(currentTheme);
}

// --- Tabs ---
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    document.getElementById('viewActive').classList.toggle('hidden', tab !== 'active');
    document.getElementById('viewHistory').classList.toggle('hidden', tab !== 'history');

    if (tab === 'history') renderHistory();
}

// --- Render ---
function render() {
    renderProjectHeader();
    renderPeople();
    updatePayerOptions();
    renderExpenses();
    renderSummary();
    applyLanguage();
}

function renderProjectHeader() {
    const nameInput = document.getElementById('projectName');
    if (nameInput) nameInput.value = project.name;

    const currSelect = document.getElementById('currencySelect');
    if (currSelect) currSelect.value = project.currency || getDefaultCurrency();

    // Sync badge
    const syncBadge = document.getElementById('syncBadge');
    if (syncBadge) {
        syncBadge.classList.toggle('hidden', !cloudId);
    }
}

function renderPeople() {
    const container = document.getElementById('peopleList');
    if (!container) return;

    let html = project.people.map(p =>
        `<span class="person-tag">
            ${p}
            <button class="remove-person" onclick="removePerson('${escapeAttr(p)}')">&times;</button>
        </span>`
    ).join('');

    html += `
        <span class="add-person-inline">
            <input type="text" id="newPersonInput" data-i18n-ph="addPersonPh"
                   placeholder="${t('addPersonPh')}"
                   onkeydown="if(event.key==='Enter'){addPerson();event.preventDefault()}">
            <button class="btn btn-primary btn-sm" onclick="addPerson()" data-i18n="addBtn">${t('addBtn')}</button>
        </span>
    `;

    container.innerHTML = html;
}

function renderExpenses() {
    const container = document.getElementById('expenseList');
    if (!container) return;

    if (project.expenses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">\u{1F4B0}</div>
                <div class="empty-state-text" data-i18n="settleEmpty">${t('settleEmpty')}</div>
            </div>
        `;
        return;
    }

    const c = project.currency || '$';

    container.innerHTML = project.expenses.map(exp => {
        const involvedCount = exp.splits ? Object.keys(exp.splits).filter(k => exp.splits[k] > 0).length : 0;
        const isExpanded = editingExpenseId === exp.id;

        return `
            <div class="expense-card ${isExpanded ? 'expanded' : ''}" data-id="${exp.id}">
                <div class="expense-main" onclick="toggleExpenseDetail('${exp.id}')">
                    <div class="expense-info">
                        <div class="expense-name">${escapeHtml(exp.name)}</div>
                        <div class="expense-meta">
                            <span>${exp.payer ? t('paidLabel') + ': ' + escapeHtml(exp.payer) : ''}</span>
                            <span>${exp.date || ''}</span>
                            <span>${involvedCount}/${project.people.length}</span>
                        </div>
                    </div>
                    <div class="expense-amount">${c}${exp.amount.toFixed(2)}</div>
                    <div class="expense-actions" onclick="event.stopPropagation()">
                        <button class="btn btn-icon btn-outline" onclick="openEditModal('${exp.id}')" title="${t('edit')}">
                            \u{270E}
                        </button>
                        <button class="btn btn-icon btn-outline" onclick="removeExpense('${exp.id}')" title="Delete"
                                style="color:var(--danger)">
                            \u{2715}
                        </button>
                    </div>
                </div>
                <div class="expense-detail">
                    ${renderExpenseDetail(exp)}
                </div>
            </div>
        `;
    }).join('');
}

function renderExpenseDetail(exp) {
    const c = project.currency || '$';

    let splitTypeHTML = `
        <div class="split-type-selector">
            <button class="split-type-btn ${exp.splitType === 'equal' ? 'active' : ''}"
                    onclick="changeSplitType('${exp.id}', 'equal')" data-i18n="splitEqual">${t('splitEqual')}</button>
            <button class="split-type-btn ${exp.splitType === 'ratio' ? 'active' : ''}"
                    onclick="changeSplitType('${exp.id}', 'ratio')" data-i18n="splitRatio">${t('splitRatio')}</button>
            <button class="split-type-btn ${exp.splitType === 'custom' ? 'active' : ''}"
                    onclick="changeSplitType('${exp.id}', 'custom')" data-i18n="splitCustom">${t('splitCustom')}</button>
        </div>
    `;

    let peopleHTML = '<div class="split-people-grid">';

    project.people.forEach(p => {
        const share = exp.splits?.[p] || 0;
        const isIncluded = share > 0;
        const ratio = exp.ratios?.[p] || 1;

        let valueHTML = '';
        if (exp.splitType === 'equal') {
            valueHTML = `<span class="split-value">${c}${share.toFixed(2)}</span>`;
        } else if (exp.splitType === 'ratio') {
            valueHTML = `
                <input type="number" min="0" step="1" value="${ratio}"
                       onchange="updateRatio('${exp.id}', '${escapeAttr(p)}', this.value)"
                       onclick="event.stopPropagation()">
                <span class="split-value">${c}${share.toFixed(2)}</span>
            `;
        } else {
            valueHTML = `
                <input type="number" min="0" step="0.01" value="${share.toFixed(2)}"
                       onchange="updateCustomSplit('${exp.id}', '${escapeAttr(p)}', this.value)"
                       onclick="event.stopPropagation()">
            `;
        }

        peopleHTML += `
            <div class="split-person-item ${isIncluded ? '' : 'excluded'}">
                <input type="checkbox" ${isIncluded ? 'checked' : ''}
                       onchange="togglePersonSplit('${exp.id}', '${escapeAttr(p)}', this.checked)"
                       onclick="event.stopPropagation()">
                <span class="person-label">${escapeHtml(p)}</span>
                ${valueHTML}
            </div>
        `;
    });

    peopleHTML += '</div>';

    return splitTypeHTML + peopleHTML;
}

function renderSummary() {
    if (project.expenses.length === 0 || project.people.length === 0) {
        document.getElementById('summarySection')?.classList.add('hidden');
        return;
    }

    document.getElementById('summarySection')?.classList.remove('hidden');

    const c = project.currency || '$';
    const total = project.expenses.reduce((s, e) => s + e.amount, 0);

    // Total banner
    const totalEl = document.getElementById('totalAmount');
    if (totalEl) totalEl.textContent = `${c}${total.toFixed(2)}`;

    // Person summaries
    const personSummary = getPersonSummary(project);
    const summaryGrid = document.getElementById('personSummaryGrid');
    if (summaryGrid) {
        summaryGrid.innerHTML = project.people.map(p => {
            const s = personSummary[p];
            const netClass = s.net > 0.01 ? 'positive' : s.net < -0.01 ? 'negative' : 'zero';
            const netLabel = s.net > 0.01 ? `+${c}${s.net.toFixed(2)}`
                           : s.net < -0.01 ? `-${c}${Math.abs(s.net).toFixed(2)}`
                           : `${c}0.00`;
            return `
                <div class="person-summary-card">
                    <div class="person-summary-name">${escapeHtml(p)}</div>
                    <div class="person-summary-paid">${t('paidLabel')}: ${c}${s.paid.toFixed(2)}</div>
                    <div class="person-summary-paid">${t('owesLabel')}: ${c}${s.owes.toFixed(2)}</div>
                    <div class="person-summary-owes ${netClass}">${netLabel}</div>
                </div>
            `;
        }).join('');
    }

    // Settlements
    const settlements = calculateSettlements(project);
    const settleList = document.getElementById('settleList');
    if (settleList) {
        if (settlements.length === 0) {
            settleList.innerHTML = project.expenses.length > 0
                ? `<div class="settle-empty">${t('allSettled')}</div>`
                : `<div class="settle-empty">${t('settleEmpty')}</div>`;
        } else {
            settleList.innerHTML = settlements.map(s => `
                <div class="settle-item">
                    <span class="settle-from">${escapeHtml(s.from)}</span>
                    <span class="settle-arrow">\u{2192}</span>
                    <span class="settle-to">${escapeHtml(s.to)}</span>
                    <span class="settle-amount">${c}${s.amount.toFixed(2)}</span>
                </div>
            `).join('');
        }
    }
}

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">\u{1F4C1}</div>
                <div class="empty-state-text" data-i18n="noHistory">${t('noHistory')}</div>
            </div>
        `;
        return;
    }

    container.innerHTML = history.map((proj, idx) => {
        const c = proj.currency || '$';
        const total = proj.expenses.reduce((s, e) => s + e.amount, 0);
        return `
            <div class="history-item">
                <div class="history-info">
                    <h3>${escapeHtml(proj.name || 'Untitled')}</h3>
                    <div class="history-meta">
                        ${t('savedAt')}: ${proj.archivedAt || ''} · ${proj.people.length} people · ${proj.expenses.length} items
                    </div>
                </div>
                <div style="text-align:right">
                    <div class="history-amount">${c}${total.toFixed(2)}</div>
                    <div style="display:flex;gap:4px;margin-top:6px;justify-content:flex-end">
                        <button class="btn btn-sm btn-primary" onclick="loadFromHistory(${idx})">${t('loadProject')}</button>
                        <button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="deleteFromHistory(${idx})">\u{2715}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// --- Actions: People ---
function addPerson() {
    const input = document.getElementById('newPersonInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    if (project.people.includes(name)) {
        showToast(currentLang === 'cn' ? '成员已存在' : 'Person already exists', 'error');
        return;
    }
    project.people.push(name);
    input.value = '';

    // Add this person to all existing expenses with 0 share
    project.expenses.forEach(exp => {
        if (exp.splitType === 'equal') {
            recalcEqualSplit(exp);
        }
        // For ratio/custom, new person starts excluded (0)
        if (!exp.splits) exp.splits = {};
        if (exp.splits[name] === undefined && exp.splitType !== 'equal') {
            exp.splits[name] = 0;
        }
    });

    render();
    save();

    // Re-focus input
    setTimeout(() => document.getElementById('newPersonInput')?.focus(), 50);
}

function removePerson(name) {
    project.people = project.people.filter(p => p !== name);

    project.expenses.forEach(exp => {
        if (exp.splits) delete exp.splits[name];
        if (exp.ratios) delete exp.ratios[name];
        if (exp.payer === name) exp.payer = project.people[0] || '';
        if (exp.splitType === 'equal') recalcEqualSplit(exp);
    });

    render();
    save();
}

// --- Actions: Expenses ---
function addExpense() {
    const nameInput = document.getElementById('expenseName');
    const amountInput = document.getElementById('expenseAmount');
    const payerSelect = document.getElementById('expensePayer');
    const dateInput = document.getElementById('expenseDate');

    const name = nameInput?.value.trim();
    const amount = parseFloat(amountInput?.value);
    const payer = payerSelect?.value || project.people[0] || '';
    const date = dateInput?.value || new Date().toISOString().slice(0, 10);

    if (!name || isNaN(amount) || amount <= 0) {
        showToast(currentLang === 'cn' ? '请填写名称和金额' : 'Enter name and amount', 'error');
        return;
    }

    if (project.people.length === 0) {
        showToast(t('addPeopleFirst'), 'error');
        return;
    }

    const splits = {};
    const share = amount / project.people.length;
    project.people.forEach(p => { splits[p] = Math.round(share * 100) / 100; });

    // Fix rounding: adjust first person to make total exact
    const splitTotal = Object.values(splits).reduce((a, b) => a + b, 0);
    const diff = Math.round((amount - splitTotal) * 100) / 100;
    if (diff !== 0 && project.people.length > 0) {
        splits[project.people[0]] += diff;
    }

    project.expenses.push({
        id: crypto.randomUUID().slice(0, 8),
        name,
        amount,
        payer,
        date,
        splitType: 'equal',
        splits
    });

    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';

    render();
    save();

    // Re-focus name input
    setTimeout(() => nameInput?.focus(), 50);
}

function removeExpense(id) {
    if (!confirm(t('confirmDelete'))) return;
    project.expenses = project.expenses.filter(e => e.id !== id);
    if (editingExpenseId === id) editingExpenseId = null;
    render();
    save();
}

function toggleExpenseDetail(id) {
    editingExpenseId = editingExpenseId === id ? null : id;
    renderExpenses();
    renderSummary();
}

// --- Split Logic ---
function changeSplitType(expId, type) {
    const exp = project.expenses.find(e => e.id === expId);
    if (!exp) return;
    exp.splitType = type;

    if (type === 'equal') {
        recalcEqualSplit(exp);
    } else if (type === 'ratio') {
        if (!exp.ratios) {
            exp.ratios = {};
            project.people.forEach(p => {
                exp.ratios[p] = exp.splits[p] > 0 ? 1 : 0;
            });
        }
        recalcRatioSplit(exp);
    }
    // 'custom' keeps current values

    renderExpenses();
    renderSummary();
    save();
}

function togglePersonSplit(expId, person, checked) {
    const exp = project.expenses.find(e => e.id === expId);
    if (!exp) return;

    if (!exp.splits) exp.splits = {};

    if (checked) {
        if (exp.splitType === 'ratio') {
            if (!exp.ratios) exp.ratios = {};
            exp.ratios[person] = 1;
            recalcRatioSplit(exp);
        } else if (exp.splitType === 'equal') {
            exp.splits[person] = 1; // placeholder, recalc below
            recalcEqualSplit(exp);
        } else {
            exp.splits[person] = 0; // custom: user fills in
        }
    } else {
        exp.splits[person] = 0;
        if (exp.ratios) exp.ratios[person] = 0;
        if (exp.splitType === 'equal') recalcEqualSplit(exp);
        if (exp.splitType === 'ratio') recalcRatioSplit(exp);
    }

    renderExpenses();
    renderSummary();
    save();
}

function updateRatio(expId, person, value) {
    const exp = project.expenses.find(e => e.id === expId);
    if (!exp) return;
    if (!exp.ratios) exp.ratios = {};
    exp.ratios[person] = Math.max(0, parseFloat(value) || 0);
    recalcRatioSplit(exp);
    renderExpenses();
    renderSummary();
    save();
}

function updateCustomSplit(expId, person, value) {
    const exp = project.expenses.find(e => e.id === expId);
    if (!exp) return;
    if (!exp.splits) exp.splits = {};
    exp.splits[person] = Math.max(0, parseFloat(value) || 0);
    renderSummary();
    save();
}

function recalcEqualSplit(exp) {
    if (!exp.splits) exp.splits = {};
    const involved = project.people.filter(p => (exp.splits[p] || 0) > 0 || !exp.splits.hasOwnProperty(p));

    // If no one included yet, include everyone
    const active = involved.length > 0 ? involved : [...project.people];

    project.people.forEach(p => { exp.splits[p] = 0; });

    if (active.length === 0) return;

    const share = exp.amount / active.length;
    active.forEach(p => { exp.splits[p] = Math.round(share * 100) / 100; });

    // Fix rounding
    const total = Object.values(exp.splits).reduce((a, b) => a + b, 0);
    const diff = Math.round((exp.amount - total) * 100) / 100;
    if (diff !== 0 && active.length > 0) {
        exp.splits[active[0]] += diff;
    }
}

function recalcRatioSplit(exp) {
    if (!exp.ratios) exp.ratios = {};
    if (!exp.splits) exp.splits = {};

    const totalRatio = Object.values(exp.ratios).reduce((a, b) => a + b, 0);

    project.people.forEach(p => {
        const ratio = exp.ratios[p] || 0;
        if (totalRatio > 0 && ratio > 0) {
            exp.splits[p] = Math.round((exp.amount * ratio / totalRatio) * 100) / 100;
        } else {
            exp.splits[p] = 0;
        }
    });

    // Fix rounding
    const splitTotal = Object.values(exp.splits).reduce((a, b) => a + b, 0);
    const diff = Math.round((exp.amount - splitTotal) * 100) / 100;
    const firstActive = project.people.find(p => (exp.ratios[p] || 0) > 0);
    if (diff !== 0 && firstActive) {
        exp.splits[firstActive] += diff;
    }
}

// --- Edit Modal ---
function openEditModal(id) {
    const exp = project.expenses.find(e => e.id === id);
    if (!exp) return;

    document.getElementById('editExpId').value = id;
    document.getElementById('editExpName').value = exp.name;
    document.getElementById('editExpAmount').value = exp.amount;
    document.getElementById('editExpDate').value = exp.date || '';

    // Payer selector
    const payerContainer = document.getElementById('editExpPayer');
    payerContainer.innerHTML = project.people.map(p =>
        `<button type="button" class="payer-chip ${exp.payer === p ? 'selected' : ''}"
                 onclick="selectEditPayer(this, '${escapeAttr(p)}')">${escapeHtml(p)}</button>`
    ).join('');

    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

function selectEditPayer(btn, name) {
    btn.parentElement.querySelectorAll('.payer-chip').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function saveEdit() {
    const id = document.getElementById('editExpId').value;
    const exp = project.expenses.find(e => e.id === id);
    if (!exp) return;

    const name = document.getElementById('editExpName').value.trim();
    const amount = parseFloat(document.getElementById('editExpAmount').value);
    const date = document.getElementById('editExpDate').value;
    const payerBtn = document.querySelector('#editExpPayer .payer-chip.selected');
    const payer = payerBtn?.textContent || exp.payer;

    if (!name || isNaN(amount) || amount <= 0) {
        showToast(currentLang === 'cn' ? '请填写名称和金额' : 'Enter name and amount', 'error');
        return;
    }

    const amountChanged = exp.amount !== amount;
    exp.name = name;
    exp.amount = amount;
    exp.date = date;
    exp.payer = payer;

    if (amountChanged) {
        if (exp.splitType === 'equal') recalcEqualSplit(exp);
        else if (exp.splitType === 'ratio') recalcRatioSplit(exp);
    }

    closeEditModal();
    render();
    save();
}

// --- History ---
function archiveProject() {
    if (project.expenses.length === 0) {
        showToast(t('nothingToSave'), 'error');
        return;
    }

    project.name = document.getElementById('projectName')?.value || project.name || 'Untitled';
    project.archivedAt = new Date().toLocaleString();
    history.unshift(JSON.parse(JSON.stringify(project)));
    localStorage.setItem('splitease_history', JSON.stringify(history));

    showToast(currentLang === 'cn' ? '已存档' : 'Archived!', 'success');
    resetProject(false);
    switchTab('history');
}

function loadFromHistory(index) {
    if (project.expenses.length > 0 && !confirm(t('confirmLoad'))) return;
    project = JSON.parse(JSON.stringify(history[index]));
    cloudId = null;
    updateURL();
    switchTab('active');
    render();
    save();
}

function deleteFromHistory(index) {
    history.splice(index, 1);
    localStorage.setItem('splitease_history', JSON.stringify(history));
    renderHistory();
}

function clearHistory() {
    if (!confirm(t('confirmClearHistory'))) return;
    history = [];
    localStorage.setItem('splitease_history', '[]');
    renderHistory();
}

// --- Project Management ---
function resetProject(confirmFirst = true) {
    if (confirmFirst && !confirm(t('confirmClear'))) return;
    project = { name: '', currency: getDefaultCurrency(), people: [], expenses: [] };
    editingExpenseId = null;
    cloudId = null;
    updateURL();

    const nameInput = document.getElementById('projectName');
    if (nameInput) nameInput.value = '';

    document.getElementById('syncBadge')?.classList.add('hidden');
    localStorage.removeItem('splitease_draft');

    render();
}

function onProjectNameChange(value) {
    project.name = value;
    save();
}

function onCurrencyChange(value) {
    project.currency = value;
    render();
    save();
}

// --- Save & Sync ---
function save() {
    localStorage.setItem('splitease_draft', JSON.stringify(project));

    if (cloudId) {
        syncToServer();
    }
}

async function syncToServer() {
    try {
        await fetch(apiUrl(`api/projects/${cloudId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: project })
        });
    } catch (e) {
        console.error('Sync failed:', e);
    }
}

async function loadFromServer(id) {
    try {
        const res = await fetch(apiUrl(`api/projects/${id}`));
        if (!res.ok) {
            showToast('Project not found', 'error');
            return;
        }
        const { data } = await res.json();
        project = data;
        document.getElementById('syncBadge')?.classList.remove('hidden');

        // Start polling for updates
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(async () => {
            try {
                const r = await fetch(apiUrl(`api/projects/${id}`));
                if (r.ok) {
                    const { data: serverData } = await r.json();
                    // Simple change detection
                    if (JSON.stringify(serverData) !== JSON.stringify(project)) {
                        project = serverData;
                        render();
                    }
                }
            } catch (e) {}
        }, 5000);
    } catch (e) {
        showToast('Could not connect to server', 'error');
    }
}

async function startShare() {
    if (cloudId) {
        const res = await fetch(apiUrl('api/ip'));
        const { ip } = await res.json();
        const link = `http://${ip}:8000/?id=${cloudId}`;
        copyToClipboard(link);
        showToast(t('copied'), 'success');
        prompt(t('sharePrompt'), link);
        return;
    }

    if (!confirm(t('shareConfirm'))) return;

    try {
        const res = await fetch(apiUrl('api/projects'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: project })
        });
        const { id } = await res.json();
        cloudId = id;
        updateURL();
        document.getElementById('syncBadge')?.classList.remove('hidden');

        const ipRes = await fetch(apiUrl('api/ip'));
        const { ip } = await ipRes.json();
        const link = `http://${ip}:8000/?id=${cloudId}`;
        prompt(t('sharePrompt'), link);
    } catch (e) {
        showToast('Share failed', 'error');
    }
}

function updateURL() {
    const url = cloudId
        ? `${location.protocol}//${location.host}${location.pathname}?id=${cloudId}`
        : `${location.protocol}//${location.host}${location.pathname}`;
    window.history.replaceState({}, '', url);
}

// --- CSV Actions ---
function handleCSVImport() {
    const input = document.getElementById('csvFileInput');
    const file = input?.files[0];
    if (!file) {
        showToast(t('noFileSelected'), 'error');
        return;
    }
    if (project.people.length === 0) {
        showToast(t('addPeopleFirst'), 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const { expenses, count } = importMOZECSV(e.target.result, project.people);

            // Set payer from the payer select if available
            const payer = document.getElementById('expensePayer')?.value || project.people[0];
            expenses.forEach(exp => { exp.payer = payer; });

            project.expenses.push(...expenses);
            input.value = '';
            showToast(`${count} ${t('csvImported')}`, 'success');
            render();
            save();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function handleExportAll() {
    const csv = exportAllCSV(project);
    const name = (project.name || 'expenses').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    downloadCSV(csv, `${name}_all.csv`);
}

function handleExportForPerson(person) {
    const csv = exportMOZECSV(project, person);
    const name = (project.name || 'expenses').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    downloadCSV(csv, `${name}_${person}.csv`);
}

function showExportMenu() {
    const modal = document.getElementById('exportModal');
    const list = document.getElementById('exportPersonList');

    list.innerHTML = `
        <button class="btn btn-block btn-primary mb-8" onclick="handleExportAll();closeExportModal()">
            ${t('exportAll')}
        </button>
        ${project.people.map(p => `
            <button class="btn btn-block btn-outline mb-8" onclick="handleExportForPerson('${escapeAttr(p)}');closeExportModal()">
                ${t('exportForPerson')} ${escapeHtml(p)} (MOZE)
            </button>
        `).join('')}
    `;

    modal.classList.add('active');
}

function closeExportModal() {
    document.getElementById('exportModal').classList.remove('active');
}

// --- Settlement Copy ---
function copySettlement() {
    const settlements = calculateSettlements(project);
    const c = project.currency || '$';
    const text = formatSettlementText(settlements, c);
    copyToClipboard(text);
    showToast(t('copied'), 'success');
}

// --- Utilities ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function copyToClipboard(text) {
    navigator.clipboard?.writeText(text).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Escape closes modals
        if (e.key === 'Escape') {
            closeEditModal();
            closeExportModal();
        }
    });
}

// --- Payer Select for Add Form ---
function updatePayerOptions() {
    const select = document.getElementById('expensePayer');
    if (!select) return;

    const current = select.value;
    select.innerHTML = project.people.map(p =>
        `<option value="${escapeAttr(p)}" ${p === current ? 'selected' : ''}>${escapeHtml(p)}</option>`
    ).join('');
}

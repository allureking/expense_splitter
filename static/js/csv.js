// ===== CSV Import/Export Module =====

// --- CSV Parser (MOZE format) ---

function parseCSVLine(text) {
    const result = [];
    let cell = '';
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && insideQuote && next === '"') {
            cell += '"';
            i++;
        } else if (char === '"') {
            insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
            result.push(cell);
            cell = '';
        } else if ((char === '\r' || char === '\n') && !insideQuote) {
            result.push(cell);
            return { row: result, endIndex: i };
        } else {
            cell += char;
        }
    }
    result.push(cell);
    return { row: result, endIndex: text.length };
}

function parseCSV(text) {
    const rows = [];
    let cursor = 0;

    // Remove BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    while (cursor < text.length) {
        const { row, endIndex } = parseCSVLine(text.slice(cursor));
        if (row.length > 1 || (row.length === 1 && row[0].trim())) {
            rows.push(row);
        }
        cursor += endIndex + 1;
        if (text[cursor] === '\n' || text[cursor] === '\r') cursor++;
    }
    return rows;
}

// --- Expense Fingerprint (for deduplication) ---
// Uses amount + date + time + merchant — fields the user won't modify after import

function csvFingerprint(amount, date, time, merchant) {
    const a = Math.abs(parseFloat(amount) || 0).toFixed(2);
    const d = (date || '').trim();
    const t = (time || '').trim();
    const m = (merchant || '').trim().toLowerCase();
    return `${a}|${d}|${t}|${m}`;
}

// --- Currency mapping from MOZE ---
const MOZE_CURRENCY_MAP = {
    'CNY': '¥', 'USD': '$', 'EUR': '€', 'GBP': '£',
    'KRW': '₩', 'JPY': 'JP¥', 'TWD': 'NT$', 'HKD': 'HK$',
    'CAD': 'CA$', 'AUD': 'AU$', 'SGD': 'S$', 'THB': '฿',
};

// --- MOZE CSV Import (with smart deduplication) ---

function importMOZECSV(csvText, people, existingExpenses) {
    const rows = parseCSV(csvText);
    if (rows.length < 2) return { expenses: [], count: 0, skipped: 0, currency: null };

    const headers = rows[0].map(h => h.trim());
    const idxAmount = headers.indexOf('金额');
    const idxName = headers.indexOf('名称');
    const idxDesc = headers.indexOf('描述');
    const idxDate = headers.indexOf('日期');
    const idxTime = headers.indexOf('时间');
    const idxMerchant = headers.indexOf('商家');
    const idxCurrency = headers.indexOf('币种');

    if (idxAmount === -1) {
        throw new Error("Cannot find '金额' (Amount) column in CSV");
    }

    // Build fingerprint set from existing expenses (use stored _csvFingerprint)
    const existingFingerprints = new Set();
    (existingExpenses || []).forEach(exp => {
        if (exp._csvFingerprint) {
            existingFingerprints.add(exp._csvFingerprint);
        }
    });

    const expenses = [];
    let skipped = 0;
    let detectedCurrency = null;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= idxAmount) continue;

        const rawAmt = parseFloat(row[idxAmount]);
        if (isNaN(rawAmt) || rawAmt >= 0) continue;

        const amount = Math.abs(rawAmt);
        let name = (row[idxName] || '').trim();
        const merchant = idxMerchant !== -1 ? (row[idxMerchant] || '').trim() : '';
        const desc = idxDesc !== -1 ? (row[idxDesc] || '').trim() : '';
        if (!name && merchant) name = merchant;
        if (!name && desc) name = desc;
        name = name.replace(/[\r\n]+/g, ' ').substring(0, 50) || t('itemNamePh');

        const date = idxDate !== -1 ? (row[idxDate] || '').trim() : '';
        const time = idxTime !== -1 ? (row[idxTime] || '').trim() : '';

        // Auto-detect currency from first expense row
        if (!detectedCurrency && idxCurrency !== -1) {
            const currCode = (row[idxCurrency] || '').trim().toUpperCase();
            if (MOZE_CURRENCY_MAP[currCode]) {
                detectedCurrency = MOZE_CURRENCY_MAP[currCode];
            }
        }

        // Deduplication: fingerprint based on immutable CSV fields (not name)
        const fp = csvFingerprint(amount, date, time, merchant);
        if (existingFingerprints.has(fp)) {
            skipped++;
            continue;
        }
        existingFingerprints.add(fp); // prevent duplicates within same CSV

        const splits = {};
        const share = amount / people.length;
        people.forEach(p => { splits[p] = Math.round(share * 100) / 100; });

        expenses.push({
            id: crypto.randomUUID().slice(0, 8),
            name,
            amount,
            payer: people[0] || '',
            date: date || new Date().toISOString().slice(0, 10),
            splitType: 'equal',
            splits,
            _csvFingerprint: fp
        });
    }

    return { expenses, count: expenses.length, skipped, currency: detectedCurrency };
}

// --- MOZE CSV Export ---

function exportMOZECSV(project, person) {
    const currency = project.currency || '¥';
    const headers = ['日期', '名称', '金额', '描述'];
    const rows = [headers.join(',')];

    project.expenses.forEach(exp => {
        if (!exp.splits || !exp.splits[person]) return;

        const share = exp.splits[person];
        if (share <= 0) return;

        const date = exp.date || '';
        const name = csvEscape(exp.name);
        const amount = (-share).toFixed(2); // Negative = expense in MOZE
        const desc = csvEscape(`Split from: ${project.name || 'SplitEase'}`);

        rows.push(`${date},${name},${amount},${desc}`);
    });

    return rows.join('\n');
}

function exportAllCSV(project) {
    const currency = project.currency || '¥';
    const headers = ['日期', '名称', '总金额', '付款人', '分摊方式'];
    project.people.forEach(p => headers.push(p));
    const rows = [headers.map(csvEscape).join(',')];

    project.expenses.forEach(exp => {
        const cols = [
            exp.date || '',
            csvEscape(exp.name),
            exp.amount.toFixed(2),
            csvEscape(exp.payer || ''),
            exp.splitType || 'equal'
        ];
        project.people.forEach(p => {
            cols.push(exp.splits?.[p]?.toFixed(2) || '0.00');
        });
        rows.push(cols.join(','));
    });

    return rows.join('\n');
}

function csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function downloadCSV(content, filename) {
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

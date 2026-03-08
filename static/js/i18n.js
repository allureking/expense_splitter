// ===== Internationalization Module =====

const I18N = {
    en: {
        appTitle: "SplitEase",
        tabActive: "Active",
        tabHistory: "History",
        projectName: "Project Name",
        projectNamePh: "e.g. Orlando Trip 2025",
        currency: "Currency",
        people: "People",
        addPersonPh: "Name",
        addBtn: "Add",
        expenses: "Expenses",
        addExpense: "Add Expense",
        itemName: "Description",
        itemNamePh: "What was it for?",
        amount: "Amount",
        payer: "Who paid?",
        date: "Date",
        splitWith: "Split with",
        splitEqual: "Equal",
        splitRatio: "Ratio",
        splitCustom: "Custom",
        summary: "Summary",
        totalCost: "Total",
        settlement: "Settlement",
        settleCopy: "Copy",
        settleEmpty: "Add expenses to see settlements",
        allSettled: "All settled up!",
        pays: "pays",
        gets: "gets back",
        paidLabel: "paid",
        owesLabel: "owes",
        importCSV: "Import MOZE CSV",
        exportCSV: "Export CSV",
        processCSV: "Import",
        exportForPerson: "Export for",
        csvImported: "expenses imported",
        noFileSelected: "Please select a CSV file",
        addPeopleFirst: "Add people first",
        history: "History",
        noHistory: "No saved projects",
        loadProject: "Load",
        deleteProject: "Delete",
        clearHistory: "Clear All",
        savedAt: "Saved",
        finishSave: "Archive",
        clearAll: "Clear",
        shareProject: "Share",
        shareLinked: "Linked",
        sharePrompt: "Share this link — anyone can edit:",
        shareConfirm: "Create a shareable link? Anyone with it can edit.",
        confirmDelete: "Delete this expense?",
        confirmClear: "Clear all data?",
        confirmClearHistory: "Delete all history?",
        confirmLoad: "Load will overwrite current data. Continue?",
        nothingToSave: "Nothing to save",
        cancel: "Cancel",
        save: "Save",
        edit: "Edit",
        editExpense: "Edit Expense",
        copied: "Copied!",
        exportAll: "Export All",
        importExport: "Import / Export",
        manualEntry: "Manual Entry",
        everyone: "Everyone",
        archive: "Archive Project",
        newProject: "New Project",
    },
    cn: {
        appTitle: "SplitEase",
        tabActive: "当前",
        tabHistory: "历史",
        projectName: "项目名称",
        projectNamePh: "例如：2025 奥兰多之旅",
        currency: "货币",
        people: "成员",
        addPersonPh: "姓名",
        addBtn: "添加",
        expenses: "消费",
        addExpense: "添加消费",
        itemName: "描述",
        itemNamePh: "消费内容",
        amount: "金额",
        payer: "谁付的？",
        date: "日期",
        splitWith: "参与分摊",
        splitEqual: "均分",
        splitRatio: "按比例",
        splitCustom: "自定义",
        summary: "汇总",
        totalCost: "总计",
        settlement: "结算方案",
        settleCopy: "复制",
        settleEmpty: "添加消费后查看结算方案",
        allSettled: "全部结清！",
        pays: "应付",
        gets: "应收",
        paidLabel: "已付",
        owesLabel: "应付",
        importCSV: "导入 MOZE CSV",
        exportCSV: "导出 CSV",
        processCSV: "导入",
        exportForPerson: "导出给",
        csvImported: "笔消费已导入",
        noFileSelected: "请先选择 CSV 文件",
        addPeopleFirst: "请先添加成员",
        history: "历史记录",
        noHistory: "暂无保存的项目",
        loadProject: "加载",
        deleteProject: "删除",
        clearHistory: "清空全部",
        savedAt: "保存于",
        finishSave: "存档",
        clearAll: "清空",
        shareProject: "分享",
        shareLinked: "已链接",
        sharePrompt: "分享此链接 — 所有人可编辑：",
        shareConfirm: "创建分享链接？所有人都可以编辑。",
        confirmDelete: "确定删除这笔消费？",
        confirmClear: "确定清空所有数据？",
        confirmClearHistory: "确定删除所有历史记录？",
        confirmLoad: "加载将覆盖当前数据。继续？",
        nothingToSave: "没有可保存的内容",
        cancel: "取消",
        save: "保存",
        edit: "编辑",
        editExpense: "编辑消费",
        copied: "已复制！",
        exportAll: "导出全部",
        importExport: "导入 / 导出",
        manualEntry: "手动录入",
        everyone: "全选",
        archive: "存档项目",
        newProject: "新建项目",
    }
};

let currentLang = localStorage.getItem('splitease_lang') || 'en';

function t(key) {
    return I18N[currentLang]?.[key] || I18N.en[key] || key;
}

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('splitease_lang', lang);
    applyLanguage();
}

function toggleLang() {
    setLang(currentLang === 'en' ? 'cn' : 'en');
}

function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (text) el.textContent = text;
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        const text = t(key);
        if (text) el.placeholder = text;
    });
}

function getDefaultCurrency() {
    return currentLang === 'cn' ? '¥' : '$';
}

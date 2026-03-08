// ===== Settlement Algorithm =====
// Calculates minimum transfers to settle all debts

function calculateBalances(project) {
    const balances = {};
    project.people.forEach(p => { balances[p] = 0; });

    project.expenses.forEach(exp => {
        // Payer gets credit for the full amount
        if (exp.payer && balances[exp.payer] !== undefined) {
            balances[exp.payer] += exp.amount;
        }

        // Each person in splits owes their share
        if (exp.splits) {
            Object.entries(exp.splits).forEach(([person, share]) => {
                if (balances[person] !== undefined) {
                    balances[person] -= share;
                }
            });
        }
    });

    return balances;
}

function calculateSettlements(project) {
    const balances = calculateBalances(project);
    const settlements = [];

    // Separate into debtors (negative balance) and creditors (positive balance)
    const debtors = [];
    const creditors = [];

    Object.entries(balances).forEach(([person, balance]) => {
        const rounded = Math.round(balance * 100) / 100;
        if (rounded < -0.01) {
            debtors.push({ person, amount: Math.abs(rounded) });
        } else if (rounded > 0.01) {
            creditors.push({ person, amount: rounded });
        }
    });

    // Sort: largest debts/credits first for greedy matching
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // Greedy settlement
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const amount = Math.min(debtors[i].amount, creditors[j].amount);
        const rounded = Math.round(amount * 100) / 100;

        if (rounded > 0.01) {
            settlements.push({
                from: debtors[i].person,
                to: creditors[j].person,
                amount: rounded
            });
        }

        debtors[i].amount -= amount;
        creditors[j].amount -= amount;

        if (debtors[i].amount < 0.01) i++;
        if (creditors[j].amount < 0.01) j++;
    }

    return settlements;
}

function formatSettlementText(settlements, currency) {
    if (settlements.length === 0) return t('allSettled');
    return settlements.map(s =>
        `${s.from} → ${s.to}: ${currency}${s.amount.toFixed(2)}`
    ).join('\n');
}

function getPersonSummary(project) {
    const summary = {};
    project.people.forEach(p => {
        summary[p] = { paid: 0, owes: 0, net: 0 };
    });

    project.expenses.forEach(exp => {
        if (exp.payer && summary[exp.payer]) {
            summary[exp.payer].paid += exp.amount;
        }
        if (exp.splits) {
            Object.entries(exp.splits).forEach(([person, share]) => {
                if (summary[person]) {
                    summary[person].owes += share;
                }
            });
        }
    });

    Object.keys(summary).forEach(p => {
        summary[p].net = Math.round((summary[p].paid - summary[p].owes) * 100) / 100;
    });

    return summary;
}

// Converte "Janeiro", "01", "jan", "01/2026" para formato SQL "YYYY-MM"

const MONTHS_PT = {
    janeiro: '01', jan: '01',
    fevereiro: '02', fev: '02',
    março: '03', mar: '03',
    abril: '04', abr: '04',
    maio: '05',
    junho: '06', jun: '06',
    julho: '07', jul: '07',
    agosto: '08', ago: '08',
    setembro: '09', set: '09',
    outubro: '10', out: '10',
    novembro: '11', nov: '11',
    dezembro: '12', dez: '12'
};

function parseMonth(input) {
    if (!input) return new Date().toISOString().slice(0, 7); // "YYYY-MM"
    
    input = input.toLowerCase().trim();
    
    // Formato: "01/2026" ou "01/26"
    if (/^\d{1,2}\/\d{2,4}$/.test(input)) {
        const [m, y] = input.split('/');
        const month = m.padStart(2, '0');
        const year = y.length === 2 ? '20' + y : y;
        return `${year}-${month}`;
    }
    
    // Formato: "janeiro 2026", "jan 2026", "janeiro", "jan"
    const parts = input.split(/\s+/);
    const monthName = parts[0];
    const year = parts[1] || new Date().getFullYear();
    
    const monthNum = MONTHS_PT[monthName];
    if (!monthNum) return null; // Mês inválido
    
    return `${year}-${monthNum}`;
}

function monthToLabel(monthStr) {
    // "2026-02" -> "Fevereiro/2026"
    const [year, month] = monthStr.split('-');
    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${monthNames[parseInt(month) - 1]}/${year}`;
}

module.exports = { parseMonth, monthToLabel, MONTHS_PT };

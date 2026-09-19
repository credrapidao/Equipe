import * as XLSX from 'xlsx';
import { Employee, EmployeeAdvance, Team, Promoter, Advance } from '../types';
import { getTeamDisplay } from './teams';

// Helper to format currency numbers cleanly (2 decimal places)
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// Helper to format ISO date (YYYY-MM-DD) to Brazilian date (DD/MM/YYYY)
export function formatBRDate(dateStr?: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

// Auto-calculate column widths based on cell content
function getColumnWidths(data: (string | number | undefined | null)[][]): { wch: number }[] {
  const colWidths: number[] = [];
  data.forEach(row => {
    row.forEach((cell, colIdx) => {
      const cellLen = cell !== undefined && cell !== null ? String(cell).length : 0;
      colWidths[colIdx] = Math.max(colWidths[colIdx] || 10, cellLen + 3);
    });
  });
  return colWidths.map(w => ({ wch: Math.min(w, 50) }));
}

/**
 * EXPORT EMPLOYEE MONTHLY CLOSING (FECHAMENTO DE MÊS)
 */
export interface ExportClosingItem {
  employee: Employee;
  proportionalSalary: number;
  totalAbsencesDiscount: number;
  totalAdvances: number;
  netSalary: number;
  displayProportionalSalary?: number;
  displayAbsencesDiscount?: number;
  displayAdvances?: number;
  displayNetSalary?: number;
  isSplit?: boolean;
  workedDays?: number;
}

export function exportEmployeeClosingToExcel({
  monthName,
  monthNumber,
  year,
  items,
  teams,
  teamName = 'Geral',
}: {
  monthName: string;
  monthNumber: number;
  year: number;
  items: ExportClosingItem[];
  teams: Team[];
  teamName?: string;
}) {
  const wb = XLSX.utils.book_new();

  // 1. SHEET: Fechamento Detalhado
  const detailedHeaders = [
    'Nome do Funcionário',
    'Equipe',
    'Cargo',
    'Nível',
    'CPF',
    'Tipo Chave PIX',
    'Chave PIX',
    'Salário Base (R$)',
    'Salário Proporcional (R$)',
    'Desconto Faltas (R$)',
    'Adiantamentos/Vales (R$)',
    'Líquido a Pagar (R$)',
    'Status',
    'Observações'
  ];

  const detailedRows: (string | number)[][] = [
    [`FECHAMENTO DE FOLHA - ${teamName.toUpperCase()} (${monthName.toUpperCase()} / ${year})`],
    [`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
    [], // Blank line
    detailedHeaders
  ];

  let sumBase = 0;
  let sumProp = 0;
  let sumFaltas = 0;
  let sumAdiant = 0;
  let sumNet = 0;

  items.forEach(item => {
    const emp = item.employee;
    const teamDisplay = getTeamDisplay(emp.team, teams);
    const propSal = item.displayProportionalSalary !== undefined ? item.displayProportionalSalary : item.proportionalSalary;
    const absDisc = item.displayAbsencesDiscount !== undefined ? item.displayAbsencesDiscount : item.totalAbsencesDiscount;
    const advTot = item.displayAdvances !== undefined ? item.displayAdvances : item.totalAdvances;
    const netSal = item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary;

    if (emp.active) {
      sumBase += Number(emp.baseSalary || 0);
      sumProp += Number(propSal || 0);
      sumFaltas += Number(absDisc || 0);
      sumAdiant += Number(advTot || 0);
      sumNet += Number(netSal || 0);
    }

    const obs = item.isSplit 
      ? 'Divisão 50/50 entre equipes Flash e Rapidão' 
      : (!emp.active ? 'Funcionário Inativo' : '');

    detailedRows.push([
      emp.name,
      teamDisplay.name,
      emp.role || '',
      emp.level || '',
      emp.document || '',
      emp.pixKeyType || 'PIX',
      emp.pixKey || '',
      roundCurrency(emp.baseSalary),
      roundCurrency(propSal),
      roundCurrency(absDisc),
      roundCurrency(advTot),
      roundCurrency(netSal),
      emp.active ? 'Ativo' : 'Inativo',
      obs
    ]);
  });

  // Total Summary Row
  detailedRows.push([]);
  detailedRows.push([
    'TOTAL GERAL',
    '',
    '',
    '',
    '',
    '',
    '',
    roundCurrency(sumBase),
    roundCurrency(sumProp),
    roundCurrency(sumFaltas),
    roundCurrency(sumAdiant),
    roundCurrency(sumNet),
    '',
    ''
  ]);

  const wsDetailed = XLSX.utils.aoa_to_sheet(detailedRows);
  wsDetailed['!cols'] = getColumnWidths(detailedRows.slice(3));
  XLSX.utils.book_append_sheet(wb, wsDetailed, 'Fechamento de Salários');

  // 2. SHEET: Lote Pagamentos PIX (Pronto para copiar ou importar no Internet Banking)
  const pixHeaders = [
    'Favorecido (Nome)',
    'CPF',
    'Tipo Chave PIX',
    'Chave PIX',
    'Valor a Pagar (R$)',
    'Equipe',
    'Descrição / Referência'
  ];

  const pixRows: (string | number)[][] = [
    [`LOTE DE PAGAMENTO PIX - ${monthName.toUpperCase()}/${year}`],
    [],
    pixHeaders
  ];

  items
    .filter(item => item.employee.active && (item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary) > 0)
    .forEach(item => {
      const emp = item.employee;
      const teamDisplay = getTeamDisplay(emp.team, teams);
      const netSal = item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary;

      pixRows.push([
        emp.name,
        emp.document || '',
        emp.pixKeyType || 'PIX',
        emp.pixKey || '',
        roundCurrency(netSal),
        teamDisplay.name,
        `Salário ${monthName}/${year}`
      ]);
    });

  pixRows.push([]);
  pixRows.push([
    'TOTAL A TRANSFERIR',
    '',
    '',
    '',
    roundCurrency(sumNet),
    '',
    ''
  ]);

  const wsPix = XLSX.utils.aoa_to_sheet(pixRows);
  wsPix['!cols'] = getColumnWidths(pixRows.slice(2));
  XLSX.utils.book_append_sheet(wb, wsPix, 'Lote PIX');

  // Trigger File Download
  const safeTeam = teamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const fileName = `Fechamento_${safeTeam}_${year}_${String(monthNumber).padStart(2, '0')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * EXPORT EMPLOYEE ADVANCES (ADIANTAMENTOS DE FUNCIONÁRIOS - APENAS PENDENTES)
 */
export function exportEmployeeAdvancesToExcel({
  advances,
  employees,
  teams,
  title = 'Adiantamentos Pendentes de Funcionários',
}: {
  advances: EmployeeAdvance[];
  employees: Employee[];
  teams: Team[];
  title?: string;
}) {
  const wb = XLSX.utils.book_new();

  // Filtrar estritamente apenas os adiantamentos com status pendente
  const pendingAdvances = advances
    .filter(a => a.status === 'pending')
    .sort((a, b) => b.date.localeCompare(a.date));

  const headers = [
    'Data Solicitação',
    'Funcionário',
    'Equipe',
    'CPF',
    'Tipo Chave PIX',
    'Chave PIX',
    'Valor Pendente (R$)',
    'Status',
    'Observações / Motivo'
  ];

  const rows: (string | number)[][] = [
    [`${title.toUpperCase()}`],
    [`Exportado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
    ['Filtro aplicado: Apenas adiantamentos pendentes de pagamento'],
    [],
    headers
  ];

  let totalPending = 0;

  pendingAdvances.forEach(adv => {
    const emp = employees.find(e => e.id === adv.employeeId);
    const empName = emp ? emp.name : 'Funcionário Excluído';
    const teamDisplay = getTeamDisplay(emp?.team, teams);

    totalPending += Number(adv.amount || 0);

    rows.push([
      formatBRDate(adv.date),
      empName,
      teamDisplay.name,
      emp?.document || '',
      emp?.pixKeyType || 'PIX',
      emp?.pixKey || '',
      roundCurrency(adv.amount),
      'Pendente',
      adv.notes || ''
    ]);
  });

  rows.push([]);
  rows.push([
    'TOTAL PENDENTE A PAGAR',
    '',
    '',
    '',
    '',
    '',
    roundCurrency(totalPending),
    `${pendingAdvances.length} pendente(s)`,
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = getColumnWidths(rows.slice(4));
  XLSX.utils.book_append_sheet(wb, ws, 'Adiantamentos Pendentes');

  // Sheet 2: Lote de Pagamento PIX Pronto para Internet Banking
  if (pendingAdvances.length > 0) {
    const pendingHeaders = [
      'Favorecido (Nome)',
      'CPF',
      'Tipo Chave PIX',
      'Chave PIX',
      'Valor a Pagar (R$)',
      'Data Solicitação',
      'Equipe',
      'Motivo / Descrição'
    ];

    const pendingRows: (string | number)[][] = [
      ['LOTE PIX - ADIANTAMENTOS PENDENTES DE QUITAÇÃO'],
      [`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
      [],
      pendingHeaders
    ];

    pendingAdvances.forEach(adv => {
      const emp = employees.find(e => e.id === adv.employeeId);
      const teamDisplay = getTeamDisplay(emp?.team, teams);

      pendingRows.push([
        emp ? emp.name : 'Funcionário',
        emp?.document || '',
        emp?.pixKeyType || 'PIX',
        emp?.pixKey || '',
        roundCurrency(adv.amount),
        formatBRDate(adv.date),
        teamDisplay.name,
        adv.notes || 'Adiantamento'
      ]);
    });

    pendingRows.push([]);
    pendingRows.push([
      'TOTAL A TRANSFERIR',
      '',
      '',
      '',
      roundCurrency(totalPending),
      '',
      '',
      ''
    ]);

    const wsPending = XLSX.utils.aoa_to_sheet(pendingRows);
    wsPending['!cols'] = getColumnWidths(pendingRows.slice(3));
    XLSX.utils.book_append_sheet(wb, wsPending, 'Lote PIX Pendentes');
  }

  const fileName = `Adiantamentos_Pendentes_Funcionarios_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * EXPORT PROMOTER ADVANCES (ADIANTAMENTOS DE PROMOTORES - APENAS PENDENTES)
 */
export function exportPromoterAdvancesToExcel({
  advances,
  promoters,
  title = 'Adiantamentos Pendentes de Promotores',
}: {
  advances: Advance[];
  promoters: Promoter[];
  title?: string;
}) {
  const wb = XLSX.utils.book_new();

  // Filtrar estritamente apenas os adiantamentos com status pendente
  const pendingAdvances = advances
    .filter(a => a.status === 'pending')
    .sort((a, b) => b.date.localeCompare(a.date));

  const headers = [
    'Data Solicitação',
    'Promotor',
    'Equipe',
    'CPF',
    'Tipo Chave PIX',
    'Chave PIX',
    'Valor Pendente (R$)',
    'Status',
    'Observações'
  ];

  const rows: (string | number)[][] = [
    [`${title.toUpperCase()}`],
    [`Exportado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
    ['Filtro aplicado: Apenas adiantamentos pendentes de pagamento'],
    [],
    headers
  ];

  let totalPending = 0;

  pendingAdvances.forEach(adv => {
    const prom = promoters.find(p => p.id === adv.promoterId);
    const promName = adv.promoterName || prom?.name || 'Promotor';
    const teamName = prom?.team === 'rapidao' ? 'Time Rapidão' : 'Time Flash';

    totalPending += Number(adv.amount || 0);

    rows.push([
      formatBRDate(adv.date),
      promName,
      teamName,
      prom?.document || '',
      prom?.pixKeyType || 'PIX',
      prom?.pixKey || '',
      roundCurrency(adv.amount),
      'Pendente',
      adv.notes || ''
    ]);
  });

  rows.push([]);
  rows.push([
    'TOTAL PENDENTE A PAGAR',
    '',
    '',
    '',
    '',
    '',
    roundCurrency(totalPending),
    `${pendingAdvances.length} pendente(s)`,
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = getColumnWidths(rows.slice(4));
  XLSX.utils.book_append_sheet(wb, ws, 'Adiantamentos Pendentes');

  // Sheet 2: Lote PIX
  if (pendingAdvances.length > 0) {
    const pixHeaders = [
      'Favorecido (Nome)',
      'CPF',
      'Tipo Chave PIX',
      'Chave PIX',
      'Valor a Pagar (R$)',
      'Data Solicitação',
      'Equipe',
      'Observações'
    ];

    const pixRows: (string | number)[][] = [
      ['LOTE PIX - ADIANTAMENTOS PENDENTES DE QUITAÇÃO'],
      [`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
      [],
      pixHeaders
    ];

    pendingAdvances.forEach(adv => {
      const prom = promoters.find(p => p.id === adv.promoterId);
      const promName = adv.promoterName || prom?.name || 'Promotor';
      const teamName = prom?.team === 'rapidao' ? 'Time Rapidão' : 'Time Flash';

      pixRows.push([
        promName,
        prom?.document || '',
        prom?.pixKeyType || 'PIX',
        prom?.pixKey || '',
        roundCurrency(adv.amount),
        formatBRDate(adv.date),
        teamName,
        adv.notes || 'Adiantamento'
      ]);
    });

    pixRows.push([]);
    pixRows.push([
      'TOTAL A TRANSFERIR',
      '',
      '',
      '',
      roundCurrency(totalPending),
      '',
      '',
      ''
    ]);

    const wsPix = XLSX.utils.aoa_to_sheet(pixRows);
    wsPix['!cols'] = getColumnWidths(pixRows.slice(3));
    XLSX.utils.book_append_sheet(wb, wsPix, 'Lote PIX Pendentes');
  }

  const fileName = `Adiantamentos_Pendentes_Promotores_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * EXPORT EMPLOYEE REGISTRATION LIST (CADASTRO DE FUNCIONÁRIOS)
 */
export function exportEmployeesListToExcel({
  employees,
  teams,
}: {
  employees: Employee[];
  teams: Team[];
}) {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Nome do Funcionário',
    'Equipe',
    'CPF / Documento',
    'Telefone / WhatsApp',
    'Cargo / Função',
    'Nível',
    'Tipo Chave PIX',
    'Chave PIX',
    'Salário Base (R$)',
    'Data de Admissão',
    'Status',
    'Observações'
  ];

  const rows: (string | number)[][] = [
    ['CADASTRO DE FUNCIONÁRIOS'],
    [`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
    [],
    headers
  ];

  let totalSalaries = 0;

  employees.forEach(emp => {
    const teamDisplay = getTeamDisplay(emp.team, teams);
    if (emp.active) {
      totalSalaries += Number(emp.baseSalary || 0);
    }

    const obs = emp.team === 'both' ? 'Divisão 50/50 entre Flash e Rapidão' : '';

    rows.push([
      emp.name,
      teamDisplay.name,
      emp.document || '',
      emp.phoneNumber || '',
      emp.role || '',
      emp.level || '',
      emp.pixKeyType || 'PIX',
      emp.pixKey || '',
      roundCurrency(emp.baseSalary),
      formatBRDate(emp.admissionDate),
      emp.active ? 'Ativo' : 'Inativo',
      obs
    ]);
  });

  rows.push([]);
  rows.push([
    'TOTAL DA FOLHA (ATIVOS)',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    roundCurrency(totalSalaries),
    '',
    '',
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = getColumnWidths(rows.slice(3));
  XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');

  const fileName = `Funcionarios_Cadastro_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}


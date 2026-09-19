import * as XLSX from 'xlsx';
import { Employee, EmployeeAdvance, Team, Promoter, Advance } from '../types';
import { getTeamDisplay } from './teams';

// Helper to format currency numbers cleanly (2 decimal places)
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// Normaliza o tipo de chave PIX para os padrões aceitos pelos bancos brasileiros
export function normalizePixKeyType(type?: string): string {
  if (!type) return 'CPF';
  const t = type.trim().toLowerCase();
  if (t === 'phone' || t === 'telefone' || t === 'celular') return 'TELEFONE';
  if (t === 'email' || t === 'e-mail') return 'EMAIL';
  if (t === 'random' || t === 'aleatoria' || t === 'aleatória' || t === 'evp') return 'ALEATORIA';
  if (t === 'cnpj') return 'CNPJ';
  if (t === 'cpf') return 'CPF';
  return type.trim().toUpperCase();
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
 * EXPORTAÇÃO PADRONIZADA DE LOTE PIX PARA INTERNET BANKING (CORA, INTER, ITAÚ, STONE, ETC.)
 * Layout exato solicitado:
 * Colunas na linha 1: Valor | Chave | Tipo | Nome | Documento
 */
export interface BatchPaymentRow {
  valor: number;
  chave: string;
  tipo: string;
  nome: string;
  documento: string;
  equipe?: string;
  data?: string;
  motivo?: string;
}

export function exportBatchPaymentToExcel({
  rows,
  fileName,
  title = 'Lote PIX de Pagamentos Pendentes',
}: {
  rows: BatchPaymentRow[];
  fileName: string;
  title?: string;
}) {
  const wb = XLSX.utils.book_new();

  // ABA 1: Lote PIX (Exatamente como os bancos exigem: 5 colunas diretas na linha 1)
  const batchHeaders = ['Valor', 'Chave', 'Tipo', 'Nome', 'Documento'];
  
  const batchData: (string | number)[][] = [
    batchHeaders,
    ...rows.map(r => [
      roundCurrency(r.valor),
      String(r.chave || '').trim(),
      normalizePixKeyType(r.tipo),
      String(r.nome || '').trim(),
      String(r.documento || '').trim(),
    ])
  ];

  const wsBatch = XLSX.utils.aoa_to_sheet(batchData);
  
  // Larguras das colunas
  wsBatch['!cols'] = [
    { wch: 14 }, // Valor
    { wch: 36 }, // Chave
    { wch: 14 }, // Tipo
    { wch: 36 }, // Nome
    { wch: 20 }, // Documento
  ];

  // Preservar zeros à esquerda de CPF e Chave PIX e formatação monetária de Valor
  for (let r = 1; r <= rows.length; r++) {
    const cellValor = XLSX.utils.encode_cell({ r, c: 0 });
    if (wsBatch[cellValor]) {
      wsBatch[cellValor].t = 'n';
      wsBatch[cellValor].z = '0.00';
    }
    const cellChave = XLSX.utils.encode_cell({ r, c: 1 });
    if (wsBatch[cellChave]) {
      wsBatch[cellChave].t = 's';
    }
    const cellTipo = XLSX.utils.encode_cell({ r, c: 2 });
    if (wsBatch[cellTipo]) {
      wsBatch[cellTipo].t = 's';
    }
    const cellNome = XLSX.utils.encode_cell({ r, c: 3 });
    if (wsBatch[cellNome]) {
      wsBatch[cellNome].t = 's';
    }
    const cellDoc = XLSX.utils.encode_cell({ r, c: 4 });
    if (wsBatch[cellDoc]) {
      wsBatch[cellDoc].t = 's';
    }
  }

  XLSX.utils.book_append_sheet(wb, wsBatch, 'Lote PIX');

  // ABA 2: Detalhamento para conferência interna (com equipes, datas e totais)
  const totalAmount = rows.reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
  const detailHeaders = [
    'Favorecido',
    'Documento / CPF',
    'Tipo Chave PIX',
    'Chave PIX',
    'Valor a Pagar (R$)',
    'Data Solicitação',
    'Equipe',
    'Motivo / Descrição'
  ];

  const detailRows: (string | number)[][] = [
    [title.toUpperCase()],
    [`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
    [`Total de registros: ${rows.length} pendência(s) | Total a pagar: R$ ${roundCurrency(totalAmount).toFixed(2)}`],
    [],
    detailHeaders,
    ...rows.map(r => [
      r.nome,
      r.documento,
      normalizePixKeyType(r.tipo),
      r.chave,
      roundCurrency(r.valor),
      formatBRDate(r.data),
      r.equipe || '',
      r.motivo || 'Adiantamento'
    ]),
    [],
    [
      'TOTAL GERAL A TRANSFERIR',
      '',
      '',
      '',
      roundCurrency(totalAmount),
      `${rows.length} pagamento(s)`,
      '',
      ''
    ]
  ];

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail['!cols'] = getColumnWidths(detailRows.slice(4));
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Conferência Detalhada');

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
  const pendingAdvances = advances
    .filter(a => a.status === 'pending')
    .sort((a, b) => b.date.localeCompare(a.date));

  const rows: BatchPaymentRow[] = pendingAdvances.map(adv => {
    const emp = employees.find(e => e.id === adv.employeeId);
    const teamDisplay = getTeamDisplay(emp?.team, teams);
    return {
      valor: Number(adv.amount || 0),
      chave: emp?.pixKey || '',
      tipo: emp?.pixKeyType || 'CPF',
      nome: emp ? emp.name : 'Funcionário',
      documento: emp?.document || '',
      equipe: teamDisplay.name,
      data: adv.date,
      motivo: adv.notes || 'Adiantamento'
    };
  });

  const fileName = `Lote_PIX_Pendentes_Funcionarios_${new Date().toISOString().split('T')[0]}.xlsx`;
  exportBatchPaymentToExcel({
    rows,
    fileName,
    title,
  });
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
  const pendingAdvances = advances
    .filter(a => a.status === 'pending')
    .sort((a, b) => b.date.localeCompare(a.date));

  const rows: BatchPaymentRow[] = pendingAdvances.map(adv => {
    const prom = promoters.find(p => p.id === adv.promoterId);
    const promName = adv.promoterName || prom?.name || 'Promotor';
    const teamName = prom?.team === 'rapidao' ? 'Time Rapidão' : 'Time Flash';
    return {
      valor: Number(adv.amount || 0),
      chave: prom?.pixKey || '',
      tipo: prom?.pixKeyType || 'CPF',
      nome: promName,
      documento: prom?.document || '',
      equipe: teamName,
      data: adv.date,
      motivo: adv.notes || 'Adiantamento'
    };
  });

  const fileName = `Lote_PIX_Pendentes_Promotores_${new Date().toISOString().split('T')[0]}.xlsx`;
  exportBatchPaymentToExcel({
    rows,
    fileName,
    title,
  });
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


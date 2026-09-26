import * as XLSX from 'xlsx';
import { Employee, EmployeeAdvance, Team, Promoter, Advance } from '../types';
import { getTeamDisplay } from './teams';

// Helper to format currency numbers cleanly (2 decimal places)
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// Normaliza o tipo de chave PIX para os padrões aceitos pelos bancos (ex: Telefone, Email, CPF, CNPJ, Aleatória)
export function normalizePixKeyType(type?: string): string {
  if (!type) return 'CPF';
  const t = type.trim().toLowerCase();
  if (t === 'phone' || t === 'telefone' || t === 'celular') return 'Telefone';
  if (t === 'email' || t === 'e-mail') return 'Email';
  if (t === 'random' || t === 'aleatoria' || t === 'aleatória' || t === 'evp') return 'Aleatória';
  if (t === 'cnpj') return 'CNPJ';
  if (t === 'cpf') return 'CPF';
  return type.trim();
}

// Formata chave PIX para lote bancário (ex: telefone 11 dígitos puro sem +55 ou símbolos, e-mail em minúsculas)
export function formatPixKey(rawKey: string = '', rawType: string = ''): string {
  const key = String(rawKey || '').trim();
  const type = normalizePixKeyType(rawType);

  if (type === 'Telefone') {
    let digits = key.replace(/\D/g, '');
    // Se vier com o DDI do Brasil 55 e tiver 12 ou 13 dígitos (ex: 5511997793975), remove o 55
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      digits = digits.slice(2);
    }
    return digits;
  }

  if (type === 'CPF') {
    const digits = key.replace(/\D/g, '');
    return digits.length === 11 ? digits : key;
  }

  if (type === 'CNPJ') {
    const digits = key.replace(/\D/g, '');
    return digits.length === 14 ? digits : key;
  }

  if (type === 'Email') {
    return key.toLowerCase();
  }

  return key;
}

// Formata documento (CPF ou CNPJ) com máscara padrão e preservação de zeros à esquerda (ex: 077.246.843-59)
export function formatDocument(docStr?: string): string {
  if (!docStr) return '';
  const digits = String(docStr).replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return String(docStr).trim();
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
  // Layout exato solicitado: Valor | Chave | Tipo | Nome | Documento
  // Exemplo: 2416.67 | 11997793975 | Telefone | Gestor de Carteira Flash | 077.246.843-59
  //          2800.00 | cadastro.rapidao@teste.com | Email | Cadastro Rapidão | 115.111.554-18
  const batchHeaders = ['Valor', 'Chave', 'Tipo', 'Nome', 'Documento'];
  
  const batchData: string[][] = [
    batchHeaders,
    ...rows.map(r => {
      const type = normalizePixKeyType(r.tipo);
      const valStr = Number(r.valor || 0).toFixed(2);
      const keyStr = formatPixKey(r.chave, type);
      const nameStr = String(r.nome || '').trim();
      const docStr = formatDocument(r.documento);
      return [valStr, keyStr, type, nameStr, docStr];
    })
  ];

  const wsBatch = XLSX.utils.aoa_to_sheet(batchData);
  
  // Larguras das colunas
  wsBatch['!cols'] = [
    { wch: 14 }, // Valor
    { wch: 32 }, // Chave
    { wch: 14 }, // Tipo
    { wch: 36 }, // Nome
    { wch: 20 }, // Documento
  ];

  // Garantir que todos os campos mantenham a formatação exata como texto/string
  // impedindo remoção de zeros à esquerda (ex: 077.246.843-59) ou alteração do decimal (2800.00)
  for (let r = 1; r <= rows.length; r++) {
    const row = rows[r - 1];
    const type = normalizePixKeyType(row.tipo);
    const valStr = Number(row.valor || 0).toFixed(2);
    const keyStr = formatPixKey(row.chave, type);
    const nameStr = String(row.nome || '').trim();
    const docStr = formatDocument(row.documento);

    const cellValor = XLSX.utils.encode_cell({ r, c: 0 });
    wsBatch[cellValor] = { t: 's', v: valStr, w: valStr };

    const cellChave = XLSX.utils.encode_cell({ r, c: 1 });
    wsBatch[cellChave] = { t: 's', v: keyStr, w: keyStr };

    const cellTipo = XLSX.utils.encode_cell({ r, c: 2 });
    wsBatch[cellTipo] = { t: 's', v: type, w: type };

    const cellNome = XLSX.utils.encode_cell({ r, c: 3 });
    wsBatch[cellNome] = { t: 's', v: nameStr, w: nameStr };

    const cellDoc = XLSX.utils.encode_cell({ r, c: 4 });
    wsBatch[cellDoc] = { t: 's', v: docStr, w: docStr };
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
    ...rows.map(r => {
      const type = normalizePixKeyType(r.tipo);
      return [
        r.nome,
        formatDocument(r.documento),
        type,
        formatPixKey(r.chave, type),
        Number(r.valor || 0).toFixed(2),
        formatBRDate(r.data),
        r.equipe || '',
        r.motivo || 'Adiantamento'
      ];
    }),
    [],
    [
      'TOTAL GERAL A TRANSFERIR',
      '',
      '',
      '',
      Number(totalAmount).toFixed(2),
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
 * EXPORTAÇÃO PADRONIZADA DE LOTE PIX EM FORMATO CSV (PARA BANCOS OU SISTEMAS QUE REQUEREM CSV)
 * Formato padrão: Valor, Chave, Tipo, Nome, Documento
 * Suporta delimitador ',' (padrão RFC/bancos) ou ';' (padrão regional Excel Brasil)
 */
export function exportBatchPaymentToCSV({
  rows,
  fileName,
  delimiter = ',',
}: {
  rows: BatchPaymentRow[];
  fileName: string;
  delimiter?: ',' | ';';
}) {
  const headers = ['Valor', 'Chave', 'Tipo', 'Nome', 'Documento'];

  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines: string[] = [
    headers.map(escapeCell).join(delimiter),
    ...rows.map(r => {
      const type = normalizePixKeyType(r.tipo);
      const valStr = Number(r.valor || 0).toFixed(2);
      const keyStr = formatPixKey(r.chave, type);
      const nameStr = String(r.nome || '').trim();
      const docStr = formatDocument(r.documento);
      return [valStr, keyStr, type, nameStr, docStr].map(escapeCell).join(delimiter);
    })
  ];

  // \uFEFF adiciona o BOM UTF-8 para garantir abertura perfeita com acentuação no Excel e em leitores bancários
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanFileName = fileName.toLowerCase().endsWith('.csv') ? fileName : `${fileName.replace(/\.xlsx$/i, '')}.csv`;
  link.setAttribute('download', cleanFileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

export function exportEmployeeAdvancesToCSV({
  advances,
  employees,
  teams,
  delimiter = ',',
}: {
  advances: EmployeeAdvance[];
  employees: Employee[];
  teams: Team[];
  delimiter?: ',' | ';';
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

  const fileName = `Lote_PIX_Pendentes_Funcionarios_${new Date().toISOString().split('T')[0]}.csv`;
  exportBatchPaymentToCSV({
    rows,
    fileName,
    delimiter,
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

export function exportPromoterAdvancesToCSV({
  advances,
  promoters,
  delimiter = ',',
}: {
  advances: Advance[];
  promoters: Promoter[];
  delimiter?: ',' | ';';
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

  const fileName = `Lote_PIX_Pendentes_Promotores_${new Date().toISOString().split('T')[0]}.csv`;
  exportBatchPaymentToCSV({
    rows,
    fileName,
    delimiter,
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


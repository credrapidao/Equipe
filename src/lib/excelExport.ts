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
  format = 'xlsx',
}: {
  monthName: string;
  monthNumber: number;
  year: number;
  items: ExportClosingItem[];
  teams: Team[];
  teamName?: string;
  format?: 'xlsx' | 'xls';
}) {
  const wb = XLSX.utils.book_new();

  // Apenas funcionários ativos com valor a receber > 0
  const activePayableItems = items.filter(
    item => item.employee.active && (item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary) > 0
  );

  // Cabeçalhos em minúsculas (valor, chave, tipo, nome, documento) para compatibilidade perfeita com leitores PHP/stdClass
  const batchHeaders = ['valor', 'chave', 'tipo', 'nome', 'documento'];
  const batchData: string[][] = [
    batchHeaders,
    ...activePayableItems.map(item => {
      const emp = item.employee;
      const netSal = item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary;
      const type = normalizePixKeyType(emp.pixKeyType);
      const valStr = Number(netSal || 0).toFixed(2);
      const keyStr = formatPixKey(emp.pixKey, type);
      const nameStr = String(emp.name || '').trim();
      const docStr = formatDocument(emp.document);
      return [valStr, keyStr, type, nameStr, docStr];
    })
  ];

  const wsBatch = XLSX.utils.aoa_to_sheet(batchData);
  wsBatch['!cols'] = [
    { wch: 14 }, // valor
    { wch: 32 }, // chave
    { wch: 14 }, // tipo
    { wch: 36 }, // nome
    { wch: 20 }, // documento
  ];

  // Forçar células como string para manter formato 2200.00 e zeros à esquerda
  for (let r = 1; r <= activePayableItems.length; r++) {
    const item = activePayableItems[r - 1];
    const emp = item.employee;
    const netSal = item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary;
    const type = normalizePixKeyType(emp.pixKeyType);
    const valStr = Number(netSal || 0).toFixed(2);
    const keyStr = formatPixKey(emp.pixKey, type);
    const nameStr = String(emp.name || '').trim();
    const docStr = formatDocument(emp.document);

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

  // Apenas 1 única aba "Sheet1", sem aba secundária que quebre importadores PHP/bancários
  XLSX.utils.book_append_sheet(wb, wsBatch, 'Sheet1');

  // Trigger File Download
  const safeTeam = teamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const finalExt = format === 'xls' ? '.xls' : '.xlsx';
  const fileName = `Lote_PIX_Fechamento_${safeTeam}_${year}_${String(monthNumber).padStart(2, '0')}${finalExt}`;
  XLSX.writeFile(wb, fileName, { bookType: format === 'xls' ? 'biff8' : 'xlsx' });
}

/**
 * EXPORTAÇÃO DETALHADA DE FECHAMENTO (PARA AUDITORIA INTERNA DA EMPRESA)
 */
export function exportEmployeeDetailedReportToExcel({
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
      formatDocument(emp.document),
      normalizePixKeyType(emp.pixKeyType),
      formatPixKey(emp.pixKey, emp.pixKeyType),
      Number(emp.baseSalary || 0).toFixed(2),
      Number(propSal || 0).toFixed(2),
      Number(absDisc || 0).toFixed(2),
      Number(advTot || 0).toFixed(2),
      Number(netSal || 0).toFixed(2),
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
    Number(sumBase).toFixed(2),
    Number(sumProp).toFixed(2),
    Number(sumFaltas).toFixed(2),
    Number(sumAdiant).toFixed(2),
    Number(sumNet).toFixed(2),
    '',
    ''
  ]);

  const wsDetailed = XLSX.utils.aoa_to_sheet(detailedRows);
  wsDetailed['!cols'] = getColumnWidths(detailedRows.slice(3));
  XLSX.utils.book_append_sheet(wb, wsDetailed, 'Fechamento Detalhado');

  const safeTeam = teamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const fileName = `Relatorio_Detalhado_Folha_${safeTeam}_${year}_${String(monthNumber).padStart(2, '0')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportEmployeeClosingToCSV({
  monthName,
  monthNumber,
  year,
  items,
  teams,
  teamName = 'Geral',
  delimiter = ',',
}: {
  monthName: string;
  monthNumber: number;
  year: number;
  items: ExportClosingItem[];
  teams: Team[];
  teamName?: string;
  delimiter?: ',' | ';';
}) {
  const activePayableItems = items.filter(
    item => item.employee.active && (item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary) > 0
  );

  const rows: BatchPaymentRow[] = activePayableItems.map(item => {
    const emp = item.employee;
    const netSal = item.displayNetSalary !== undefined ? item.displayNetSalary : item.netSalary;
    return {
      valor: Number(netSal || 0),
      chave: emp.pixKey || '',
      tipo: emp.pixKeyType || 'CPF',
      nome: emp.name,
      documento: emp.document || '',
    };
  });

  const safeTeam = teamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const fileName = `Lote_PIX_Fechamento_${safeTeam}_${year}_${String(monthNumber).padStart(2, '0')}.csv`;
  exportBatchPaymentToCSV({
    rows,
    fileName,
    delimiter,
  });
}

/**
 * EXPORTAÇÃO PADRONIZADA DE LOTE PIX PARA INTERNET BANKING (CORA, INTER, ITAÚ, STONE, ETC.)
 * Layout exato:
 * Colunas na linha 1: valor | chave | tipo | nome | documento
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

/**
 * Formata cada coluna do lote PIX rigorosamente de acordo com o padrão do sistema bancário:
 * Exemplo real fornecido:
 * Valor: 100.50
 * Chave: pixdehermes@gmail.com
 * Tipo: email (minúsculo: cpf, cnpj, email, telefone, aleatoria)
 * Nome: fortuna negocios
 * Documento: 48194114000146 (apenas dígitos, sem pontos, barras ou traços)
 */
export function formatBatchColValue(
  r: BatchPaymentRow,
  colId: 'valor' | 'chave' | 'tipo' | 'nome' | 'documento'
): string {
  const rawType = String(r.tipo || 'cpf').trim().toLowerCase();
  let normType = 'cpf';
  if (rawType.includes('email') || rawType.includes('mail')) normType = 'email';
  else if (rawType.includes('phone') || rawType.includes('tel') || rawType.includes('cel')) normType = 'telefone';
  else if (rawType.includes('cnpj')) normType = 'cnpj';
  else if (rawType.includes('rand') || rawType.includes('aleat') || rawType.includes('evp')) normType = 'aleatoria';
  else normType = 'cpf';

  switch (colId) {
    case 'valor':
      return Number(r.valor || 0).toFixed(2);
    case 'chave': {
      const key = String(r.chave || '').trim();
      if (normType === 'email') return key.toLowerCase();
      if (normType === 'cpf' || normType === 'cnpj' || normType === 'telefone') {
        let digits = key.replace(/\D/g, '');
        if (normType === 'telefone' && digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
          digits = digits.slice(2);
        }
        return digits || key;
      }
      return key;
    }
    case 'tipo':
      return normType; // minúsculo: 'email', 'cpf', 'telefone', 'cnpj', 'aleatoria'
    case 'nome':
      return String(r.nome || '').trim();
    case 'documento': {
      // Documento estritamente números puros (ex: 48194114000146)
      const digits = String(r.documento || '').replace(/\D/g, '');
      return digits || String(r.documento || '').trim();
    }
    default:
      return '';
  }
}

export function exportBatchPaymentToExcel({
  rows,
  fileName,
  title = 'Lote PIX de Pagamentos Pendentes',
  format = 'xlsx',
  sheetName = 'Sheet1',
  customHeaders,
  columnOrder = ['nome', 'documento', 'chave', 'tipo', 'valor'],
}: {
  rows: BatchPaymentRow[];
  fileName: string;
  title?: string;
  format?: 'xlsx' | 'xls';
  sheetName?: string;
  customHeaders?: string[];
  columnOrder?: Array<'valor' | 'chave' | 'tipo' | 'nome' | 'documento'>;
}) {
  const wb = XLSX.utils.book_new();

  // Cabeçalhos oficiais correspondentes à tela do sistema bancário: RECEBEDOR | DOCUMENTO | CHAVE PIX | TIPO | VALOR
  const batchHeaders = customHeaders && customHeaders.length === columnOrder.length 
    ? customHeaders 
    : ['RECEBEDOR', 'DOCUMENTO', 'CHAVE PIX', 'TIPO', 'VALOR'];
  
  const getColValue = (r: BatchPaymentRow, colId: 'valor' | 'chave' | 'tipo' | 'nome' | 'documento') => {
    return formatBatchColValue(r, colId);
  };

  const batchData: string[][] = [
    batchHeaders,
    ...rows.map(r => columnOrder.map(colId => getColValue(r, colId)))
  ];

  const wsBatch = XLSX.utils.aoa_to_sheet(batchData);
  
  // Larguras das colunas
  wsBatch['!cols'] = columnOrder.map(colId => {
    if (colId === 'chave') return { wch: 32 };
    if (colId === 'nome') return { wch: 36 };
    if (colId === 'documento') return { wch: 20 };
    return { wch: 14 };
  });

  // Forçar células como string para manter formato 2200.00 e zeros à esquerda
  for (let r = 1; r <= rows.length; r++) {
    const row = rows[r - 1];
    for (let c = 0; c < columnOrder.length; c++) {
      const colId = columnOrder[c];
      const valStr = getColValue(row, colId);
      const cellRef = XLSX.utils.encode_cell({ r, c });
      wsBatch[cellRef] = { t: 's', v: valStr, w: valStr };
    }
  }

  // IMPORTANTE: apenas 1 única aba limpa, sem abas secundárias
  XLSX.utils.book_append_sheet(wb, wsBatch, sheetName || 'Sheet1');

  const finalExt = format === 'xls' ? '.xls' : '.xlsx';
  const cleanName = fileName.replace(/\.(xlsx|xls)$/i, '') + finalExt;
  XLSX.writeFile(wb, cleanName, { bookType: format === 'xls' ? 'biff8' : 'xlsx' });
}

/**
 * EXPORTAÇÃO PADRONIZADA DE LOTE PIX EM FORMATO CSV (PARA BANCOS OU SISTEMAS QUE REQUEREM CSV)
 * Formato padrão: RECEBEDOR, DOCUMENTO, CHAVE PIX, TIPO, VALOR
 * Suporta delimitador ',' (padrão RFC/bancos) ou ';' (padrão regional Excel Brasil)
 */
export function exportBatchPaymentToCSV({
  rows,
  fileName,
  delimiter = ',',
  customHeaders,
  columnOrder = ['nome', 'documento', 'chave', 'tipo', 'valor'],
}: {
  rows: BatchPaymentRow[];
  fileName: string;
  delimiter?: ',' | ';';
  customHeaders?: string[];
  columnOrder?: Array<'valor' | 'chave' | 'tipo' | 'nome' | 'documento'>;
}) {
  const headers = customHeaders && customHeaders.length === columnOrder.length
    ? customHeaders
    : ['RECEBEDOR', 'DOCUMENTO', 'CHAVE PIX', 'TIPO', 'VALOR'];

  const getColValue = (r: BatchPaymentRow, colId: 'valor' | 'chave' | 'tipo' | 'nome' | 'documento') => {
    return formatBatchColValue(r, colId);
  };



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
    ...rows.map(r => columnOrder.map(colId => escapeCell(getColValue(r, colId))).join(delimiter))
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
  format = 'xlsx',
}: {
  advances: EmployeeAdvance[];
  employees: Employee[];
  teams: Team[];
  title?: string;
  format?: 'xlsx' | 'xls';
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

  const finalExt = format === 'xls' ? '.xls' : '.xlsx';
  const fileName = `Lote_PIX_Pendentes_Funcionarios_${new Date().toISOString().split('T')[0]}${finalExt}`;
  exportBatchPaymentToExcel({
    rows,
    fileName,
    title,
    format,
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
  format = 'xlsx',
}: {
  advances: Advance[];
  promoters: Promoter[];
  title?: string;
  format?: 'xlsx' | 'xls';
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

  const finalExt = format === 'xls' ? '.xls' : '.xlsx';
  const fileName = `Lote_PIX_Pendentes_Promotores_${new Date().toISOString().split('T')[0]}${finalExt}`;
  exportBatchPaymentToExcel({
    rows,
    fileName,
    title,
    format,
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
      Number(emp.baseSalary || 0).toFixed(2),
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
    Number(totalSalaries || 0).toFixed(2),
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


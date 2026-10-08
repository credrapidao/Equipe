import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, FileText, Settings2, Check, X, Download, Eye, RotateCcw } from 'lucide-react';
import { BatchPaymentRow, exportBatchPaymentToExcel, exportBatchPaymentToCSV, formatBatchColValue } from '../lib/excelExport';

export interface ColumnConfig {
  id: 'valor' | 'chave' | 'tipo' | 'nome' | 'documento';
  label: string;
  headerName: string;
}

const STORAGE_KEY = 'pix_batch_export_config_v2';

export const DEFAULT_PRESETS: { id: string; name: string; description: string; columns: ColumnConfig[] }[] = [
  {
    id: 'bank_screen_upper',
    name: 'Padrão da Tela do Banco (RECEBEDOR, DOCUMENTO...)',
    description: 'RECEBEDOR | DOCUMENTO | CHAVE PIX | TIPO | VALOR (exatamente como na sua tela)',
    columns: [
      { id: 'nome', label: 'Nome do Recebedor', headerName: 'RECEBEDOR' },
      { id: 'documento', label: 'CPF / CNPJ', headerName: 'DOCUMENTO' },
      { id: 'chave', label: 'Chave PIX', headerName: 'CHAVE PIX' },
      { id: 'tipo', label: 'Tipo da Chave', headerName: 'TIPO' },
      { id: 'valor', label: 'Valor a Pagar', headerName: 'VALOR' },
    ],
  },
  {
    id: 'bank_screen_title',
    name: 'Padrão Banco (Recebedor, Documento...)',
    description: 'Recebedor | Documento | Chave Pix | Tipo | Valor (iniciais maiúsculas)',
    columns: [
      { id: 'nome', label: 'Nome do Recebedor', headerName: 'Recebedor' },
      { id: 'documento', label: 'CPF / CNPJ', headerName: 'Documento' },
      { id: 'chave', label: 'Chave PIX', headerName: 'Chave Pix' },
      { id: 'tipo', label: 'Tipo da Chave', headerName: 'Tipo' },
      { id: 'valor', label: 'Valor a Pagar', headerName: 'Valor' },
    ],
  },
  {
    id: 'official_model',
    name: 'Modelo Anterior (Valor, Chave, Tipo...)',
    description: 'Valor | Chave | Tipo | Nome | Documento',
    columns: [
      { id: 'valor', label: 'Valor a Pagar', headerName: 'Valor' },
      { id: 'chave', label: 'Chave PIX', headerName: 'Chave' },
      { id: 'tipo', label: 'Tipo da Chave', headerName: 'Tipo' },
      { id: 'nome', label: 'Nome do Favorecido', headerName: 'Nome' },
      { id: 'documento', label: 'CPF / CNPJ', headerName: 'Documento' },
    ],
  },
  {
    id: 'php_lowercase',
    name: 'Padrão Minúsculo (recebedor, documento...)',
    description: 'recebedor | documento | chave | tipo | valor',
    columns: [
      { id: 'nome', label: 'Nome do Recebedor', headerName: 'recebedor' },
      { id: 'documento', label: 'CPF / CNPJ', headerName: 'documento' },
      { id: 'chave', label: 'Chave PIX', headerName: 'chave' },
      { id: 'tipo', label: 'Tipo da Chave', headerName: 'tipo' },
      { id: 'valor', label: 'Valor a Pagar', headerName: 'valor' },
    ],
  },
];

interface BatchExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: BatchPaymentRow[];
  defaultFileName: string;
  title?: string;
}

export function BatchExportModal({
  isOpen,
  onClose,
  rows,
  defaultFileName,
  title = 'Exportar Lote PIX',
}: BatchExportModalProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('bank_screen_upper');
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_PRESETS[0].columns);
  const [fileFormat, setFileFormat] = useState<'xlsx' | 'xls' | 'csv'>('xls');
  const [csvDelimiter, setCsvDelimiter] = useState<',' | ';'>(';');
  const [sheetName, setSheetName] = useState<string>('Sheet1');

  // Load saved preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.presetId) setSelectedPresetId(parsed.presetId);
        if (parsed.columns && Array.isArray(parsed.columns)) setColumns(parsed.columns);
        if (parsed.fileFormat) setFileFormat(parsed.fileFormat);
        if (parsed.csvDelimiter) setCsvDelimiter(parsed.csvDelimiter);
        if (parsed.sheetName) setSheetName(parsed.sheetName);
      }
    } catch {
      // Ignore
    }
  }, []);

  if (!isOpen) return null;

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = DEFAULT_PRESETS.find(p => p.id === presetId);
    if (found) {
      setColumns(found.columns.map(c => ({ ...c })));
    }
  };

  const handleColumnHeaderChange = (index: number, newHeader: string) => {
    setSelectedPresetId('custom');
    setColumns(prev => {
      const next = [...prev];
      next[index] = { ...next[index], headerName: newHeader };
      return next;
    });
  };

  const handleResetToDefault = () => {
    handleSelectPreset('bank_screen_upper');
    setFileFormat('xls');
    setCsvDelimiter(';');
    setSheetName('Sheet1');
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleExport = () => {
    // Save preferences
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          presetId: selectedPresetId,
          columns,
          fileFormat,
          csvDelimiter,
          sheetName,
        })
      );
    } catch {
      // Ignore
    }

    const cleanBaseName = defaultFileName.replace(/\.(xlsx|xls|csv)$/i, '');
    const finalFileName = `${cleanBaseName}.${fileFormat}`;

    if (fileFormat === 'csv') {
      exportBatchPaymentToCSV({
        rows,
        fileName: finalFileName,
        delimiter: csvDelimiter,
        customHeaders: columns.map(c => c.headerName),
        columnOrder: columns.map(c => c.id),
      });
    } else {
      exportBatchPaymentToExcel({
        rows,
        fileName: finalFileName,
        title,
        format: fileFormat,
        sheetName: sheetName || 'Sheet1',
        customHeaders: columns.map(c => c.headerName),
        columnOrder: columns.map(c => c.id),
      });
    }

    onClose();
  };

  // Preview data (first 3 rows) using the exact formatBatchColValue
  const previewRows = rows.slice(0, 3).map(r => {
    return columns.map(col => formatBatchColValue(r, col.id));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Settings2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-zinc-900">{title}</h2>
              <p className="text-xs text-zinc-500">
                Ajuste os nomes das colunas e formato exigidos pelo seu sistema de pagamentos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Preset Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                Modelos de Cabeçalho Prontos:
              </label>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[11px] text-zinc-500 hover:text-zinc-800 flex items-center gap-1 font-semibold transition-colors"
              >
                <RotateCcw size={11} /> Redefinir Padrão
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEFAULT_PRESETS.map(preset => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`flex flex-col text-left p-2.5 rounded-xl border text-xs transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{preset.name}</span>
                      {isSelected && <Check size={14} className="text-emerald-600" />}
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editable Columns Table */}
          <div className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-50/50">
            <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-100 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700">
                Nomes exatos das colunas (Linha 1 da Planilha)
              </span>
              <span className="text-[10px] text-zinc-500">
                Edite se o seu sistema exigir outro nome de campo
              </span>
            </div>
            <div className="p-3 space-y-2">
              {columns.map((col, idx) => (
                <div key={col.id} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-zinc-200 shadow-2xs">
                  <span className="text-xs font-bold text-zinc-400 w-6 text-center">#{idx + 1}</span>
                  <div className="flex-1">
                    <span className="text-xs font-medium text-zinc-700">{col.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 w-48">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Cabeçalho:</span>
                    <input
                      type="text"
                      value={col.headerName}
                      onChange={e => handleColumnHeaderChange(idx, e.target.value)}
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-zinc-50 border border-zinc-300 rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-zinc-900"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Format & Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Format Selection */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                Formato do Arquivo:
              </label>
              <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setFileFormat('xlsx')}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                    fileFormat === 'xlsx'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <FileSpreadsheet size={13} />
                  <span>.XLSX</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFileFormat('xls')}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                    fileFormat === 'xls'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                  title="Excel clássico BIFF8 (para sistemas legados)"
                >
                  <FileSpreadsheet size={13} />
                  <span>.XLS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFileFormat('csv')}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                    fileFormat === 'csv'
                      ? 'bg-white text-teal-700 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <FileText size={13} />
                  <span>.CSV</span>
                </button>
              </div>
            </div>

            {/* Sub options depending on format */}
            <div>
              {fileFormat === 'csv' ? (
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                    Separador CSV:
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 cursor-pointer bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg flex-1">
                      <input
                        type="radio"
                        name="csvDelim"
                        checked={csvDelimiter === ';'}
                        onChange={() => setCsvDelimiter(';')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Ponto e Vírgula (;)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 cursor-pointer bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg flex-1">
                      <input
                        type="radio"
                        name="csvDelim"
                        checked={csvDelimiter === ','}
                        onChange={() => setCsvDelimiter(',')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Vírgula (,)</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                    Nome da Aba da Planilha:
                  </label>
                  <input
                    type="text"
                    value={sheetName}
                    onChange={e => setSheetName(e.target.value)}
                    placeholder="Sheet1"
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-zinc-900"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Live Table Preview */}
          <div className="rounded-xl border border-zinc-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-200 bg-zinc-100 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                <Eye size={13} className="text-emerald-600" /> Prévia Exata do Arquivo ({rows.length} registros)
              </span>
              <span className="text-[10px] text-zinc-500">
                Valores formatados como 2200.00
              </span>
            </div>
            <div className="overflow-x-auto max-h-40">
              <table className="w-full text-xs text-left border-collapse font-mono">
                <thead>
                  <tr className="bg-zinc-200/70 border-b border-zinc-300 text-zinc-800 font-bold">
                    {columns.map(col => (
                      <th key={col.id} className="px-3 py-1.5 border-r border-zinc-300 last:border-r-0">
                        {col.headerName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {previewRows.map((pRow, rIdx) => (
                    <tr key={rIdx} className="hover:bg-zinc-50">
                      {pRow.map((val, cIdx) => (
                        <td key={cIdx} className="px-3 py-1 border-r border-zinc-100 last:border-r-0 text-zinc-700 whitespace-nowrap">
                          {val || <span className="text-zinc-300 italic">vazio</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 bg-zinc-50">
          <div className="text-xs text-zinc-500">
            Total a exportar: <strong className="text-zinc-800">{rows.length} pagamento(s)</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors shadow-2xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={rows.length === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download size={14} />
              <span>Baixar Arquivo ({fileFormat.toUpperCase()})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

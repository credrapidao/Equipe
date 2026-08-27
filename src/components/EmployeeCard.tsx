import React, { useState } from 'react';
import { User, Phone, Edit, CheckCircle2, XCircle, Coins, Key, Copy, Check, Calendar, Eye, EyeOff, Shield } from 'lucide-react';
import { Employee } from '../types';
import { SecurityMasker } from '../lib/security';

interface EmployeeCardProps {
  key?: string;
  employee: Employee;
  onEdit: (employee: Employee) => void;
}

export function EmployeeCard({ employee, onEdit }: EmployeeCardProps) {
  const [copied, setCopied] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatBRDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  const displayDocument = showSensitive ? employee.document : SecurityMasker.maskCPF(employee.document);
  const displayPix = showSensitive ? employee.pixKey : SecurityMasker.maskPixKey(employee.pixKey, employee.pixKeyType);
  const displayPhone = showSensitive ? employee.phoneNumber : SecurityMasker.maskPhone(employee.phoneNumber);
  const displaySalary = showSensitive ? formatCurrency(employee.baseSalary) : 'R$ •••••••';

  const handleCopy = () => {
    let text = `NOME: ${employee.name}`;
    if (employee.role) text += `\nFUNÇÃO: ${employee.role}`;
    if (employee.level) text += `\nNÍVEL: ${employee.level}`;
    text += `\nCPF: ${employee.document}\nPIX (${employee.pixKeyType}): ${employee.pixKey}\nSALÁRIO: ${formatCurrency(employee.baseSalary)}`;
    if (employee.admissionDate) {
      text += `\nADMISSÃO: ${formatBRDate(employee.admissionDate)}`;
    }
    if (employee.dismissalDate) {
      text += `\nDEMISSÃO: ${formatBRDate(employee.dismissalDate)}`;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`group relative rounded-2xl border p-5 transition-all duration-300 bg-white ${
      employee.active 
        ? 'border-zinc-100 hover:border-zinc-200 hover:shadow-xl hover:shadow-zinc-100/50' 
        : 'border-zinc-100 bg-zinc-50/50 opacity-75'
    }`}>
      {/* Action Buttons */}
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <button 
          onClick={() => setShowSensitive(!showSensitive)}
          className={`p-2 rounded-xl transition-all duration-200 ${
            showSensitive ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-50 text-zinc-400 hover:text-zinc-700'
          }`}
          title={showSensitive ? "Ocultar dados confidenciais (LGPD)" : "Revelar dados confidenciais"}
        >
          {showSensitive ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button 
          onClick={handleCopy}
          className={`p-2 rounded-xl transition-all duration-200 opacity-0 group-hover:opacity-100 ${
            copied ? 'bg-green-50 text-green-600' : 'bg-zinc-50 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
          title="Copiar dados do funcionário"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <button 
          onClick={() => onEdit(employee)}
          className="p-2 rounded-xl bg-zinc-50 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200 opacity-0 group-hover:opacity-100"
          title="Editar Funcionário"
        >
          <Edit size={16} />
        </button>
      </div>

      {/* Main Details */}
      <div className="flex items-start gap-3.5">
        <div className={`p-3 rounded-xl ${
          employee.active ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-400'
        }`}>
          <User size={20} />
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-zinc-950 tracking-tight text-sm leading-tight pr-6 group-hover:text-indigo-600 transition-colors">
            {employee.name}
          </h4>
          {(employee.role || employee.level) && (
            <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold text-indigo-700">
              {employee.role && <span>{employee.role}</span>}
              {employee.role && employee.level && <span className="text-zinc-300">•</span>}
              {employee.level && (
                <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-extrabold">
                  {employee.level}
                </span>
              )}
            </div>
          )}
          <p className="text-xs font-semibold text-zinc-400 tracking-wider uppercase tabular-nums">
            CPF: {displayDocument}
          </p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 text-xs font-medium text-zinc-500">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Salário Mensal</span>
          <div className="flex items-center gap-1 font-bold text-zinc-900">
            <Coins size={12} className="text-zinc-400" />
            {displaySalary}
          </div>
        </div>

        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Chave Pix</span>
          <div className="flex items-center gap-1 font-semibold text-zinc-800 truncate" title={`${employee.pixKeyType}: ${displayPix}`}>
            <Key size={12} className="text-indigo-400 shrink-0" />
            <span className="truncate tabular-nums">{displayPix}</span>
          </div>
        </div>

        {(employee.admissionDate || employee.dismissalDate) && (
          <div className="col-span-2 space-y-1 border-t border-zinc-50 pt-2 flex items-center justify-between text-[11px]">
            {employee.admissionDate && (
              <span className="flex items-center gap-1 text-zinc-600 font-medium">
                <Calendar size={12} className="text-indigo-500" />
                <span className="text-[10px] uppercase font-bold text-zinc-400">Admissão:</span> {formatBRDate(employee.admissionDate)}
              </span>
            )}
            {employee.dismissalDate && (
              <span className="flex items-center gap-1 text-red-600 font-medium ml-auto">
                <Calendar size={12} className="text-red-400" />
                <span className="text-[10px] uppercase font-bold text-red-400">Demissão:</span> {formatBRDate(employee.dismissalDate)}
              </span>
            )}
          </div>
        )}

        {employee.phoneNumber && (
          <div className="col-span-2 space-y-0.5 border-t border-zinc-50 pt-2 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Celular</span>
            <span className="text-zinc-700 flex items-center gap-1 font-bold tabular-nums">
              <Phone size={12} className="text-zinc-400" />
              {displayPhone}
            </span>
          </div>
        )}
      </div>

      {/* Footer / Status */}
      <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {employee.active ? (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider border border-green-100">
              <CheckCircle2 size={10} />
              Ativo
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-wider border border-zinc-200">
              <XCircle size={10} />
              Inativo
            </div>
          )}

          {employee.team === 'both' ? (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wider border border-purple-100">
              ⚡🚀 50% Flash / 50% Rapidão
            </div>
          ) : employee.team === 'rapidao' ? (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
              🚀 Rapidão
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
              ⚡ Flash
            </div>
          )}
        </div>
        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter flex items-center gap-1">
          <Shield size={10} className="text-indigo-500" />
          id: {employee.id.slice(-6)}
        </div>
      </div>
    </div>
  );
}

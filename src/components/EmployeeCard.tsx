import React from 'react';
import { User, Phone, Edit, CheckCircle2, XCircle, Coins, Key } from 'lucide-react';
import { Employee } from '../types';

interface EmployeeCardProps {
  key?: string;
  employee: Employee;
  onEdit: (employee: Employee) => void;
}

export function EmployeeCard({ employee, onEdit }: EmployeeCardProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className={`group relative rounded-2xl border p-5 transition-all duration-300 bg-white ${
      employee.active 
        ? 'border-zinc-100 hover:border-zinc-200 hover:shadow-xl hover:shadow-zinc-100/50' 
        : 'border-zinc-100 bg-zinc-50/50 opacity-75'
    }`}>
      {/* Edit Trigger */}
      <button 
        onClick={() => onEdit(employee)}
        className="absolute top-4 right-4 p-2 rounded-xl bg-zinc-50 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
        title="Editar Funcionário"
      >
        <Edit size={16} />
      </button>

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
          <p className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
            CPF: {employee.document}
          </p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 text-xs font-medium text-zinc-500">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Salário Mensal</span>
          <div className="flex items-center gap-1 font-bold text-zinc-900">
            <Coins size={12} className="text-zinc-400" />
            {formatCurrency(employee.baseSalary)}
          </div>
        </div>

        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Chave Pix</span>
          <div className="flex items-center gap-1 font-semibold text-zinc-800 truncate" title={`${employee.pixKeyType}: ${employee.pixKey}`}>
            <Key size={12} className="text-indigo-400 shrink-0" />
            <span className="truncate">{employee.pixKey}</span>
          </div>
        </div>

        {employee.phoneNumber && (
          <div className="col-span-2 space-y-0.5 border-t border-zinc-50 pt-2 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Celular</span>
            <span className="text-zinc-700 flex items-center gap-1 font-bold">
              <Phone size={12} className="text-zinc-400" />
              {employee.phoneNumber}
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

          {employee.team === 'rapidao' ? (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
              🚀 Rapidão
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
              ⚡ Flash
            </div>
          )}
        </div>
        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
          id: {employee.id.slice(-6)}
        </div>
      </div>
    </div>
  );
}

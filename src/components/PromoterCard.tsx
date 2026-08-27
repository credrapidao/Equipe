/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Phone, Edit2, Key, CheckCircle2, XCircle, Eye, EyeOff, Shield } from 'lucide-react';
import { Promoter } from '../types';
import { SecurityMasker } from '../lib/security';

interface PromoterCardProps {
  key?: string;
  promoter: Promoter;
  onEdit: (p: Promoter) => void;
  onToggleStatus?: () => void;
  readOnly?: boolean;
}

export default function PromoterCard({ promoter, onEdit, onToggleStatus, readOnly }: PromoterCardProps) {
  const [showSensitive, setShowSensitive] = useState(false);

  const displayDocument = showSensitive ? promoter.document : SecurityMasker.maskCPF(promoter.document);
  const displayPix = showSensitive ? promoter.pixKey : SecurityMasker.maskPixKey(promoter.pixKey, promoter.pixKeyType);
  const displayPhone = showSensitive ? promoter.phoneNumber : SecurityMasker.maskPhone(promoter.phoneNumber);

  return (
    <div className={`bg-white p-5 rounded-2xl border shadow-sm transition-all group ${promoter.active ? 'border-zinc-200 hover:border-zinc-300' : 'border-zinc-100 opacity-75'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold shadow-sm transition-colors ${
            promoter.active 
              ? 'bg-brand-surface text-brand-lime group-hover:bg-brand-lime group-hover:text-brand-dark' 
              : 'bg-zinc-100 text-zinc-400'
          }`}>
            {promoter.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className={`font-bold leading-tight ${promoter.active ? 'text-zinc-900' : 'text-zinc-500'}`}>{promoter.name}</h3>
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider tabular-nums">{displayDocument}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSensitive(!showSensitive)}
            className={`p-2 rounded-lg transition-all ${showSensitive ? 'text-indigo-600 bg-indigo-50' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
            title={showSensitive ? "Ocultar dados sensíveis (LGPD)" : "Revelar dados sensíveis"}
          >
            {showSensitive ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          {!readOnly && (
            <>
              {onToggleStatus && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onToggleStatus(); }}
                  title={promoter.active ? "Desativar Promotor" : "Ativar Promotor"}
                  className={`p-2 rounded-lg transition-all ${
                    promoter.active 
                      ? 'text-zinc-300 hover:text-red-500 hover:bg-red-50' 
                      : 'text-brand-lime hover:bg-brand-surface'
                  }`}
                >
                  {promoter.active ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                </button>
              )}
              <button 
                onClick={() => onEdit(promoter)}
                className="p-2 text-zinc-400 hover:text-brand-dark hover:bg-brand-lime/10 rounded-lg transition-all"
                title="Editar Promotor"
              >
                <Edit2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Key size={14} className="text-zinc-400" />
          <span className="font-medium">{promoter.pixKeyType}:</span>
          <span className="text-zinc-900 tabular-nums">{displayPix}</span>
        </div>
        {promoter.phoneNumber && (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Phone size={14} className="text-zinc-400" />
            <span className="tabular-nums">{displayPhone}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {promoter.active ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider">
              <CheckCircle2 size={10} />
              Ativo
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider">
              <XCircle size={10} />
              Inativo
            </div>
          )}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            promoter.team === 'rapidao' 
              ? 'bg-amber-50 text-amber-700 border border-amber-100' 
              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
          }`}>
            {promoter.team === 'rapidao' ? '🚀 Rapidão' : '⚡ Flash'}
          </div>
        </div>
        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter flex items-center gap-1">
          <Shield size={10} className="text-emerald-500" />
          id: {promoter.id.slice(-6)}
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Promoter, OperationType, Team, DEFAULT_TEAMS } from '../types';
import { handleFirestoreError } from '../lib/utils';
import { useTeams } from '../lib/teams';

interface PromoterModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPromoter: Promoter | null;
  teams?: Team[];
}

export default function PromoterModal({ isOpen, onClose, editingPromoter, teams: propTeams }: PromoterModalProps) {
  const { teams: hookTeams } = useTeams();
  const teamsList = propTeams && propTeams.length > 0 ? propTeams : (hookTeams && hookTeams.length > 0 ? hookTeams : DEFAULT_TEAMS);

  const [formData, setFormData] = useState({
    name: '',
    document: '',
    pixKey: '',
    pixKeyType: 'CPF' as Promoter['pixKeyType'],
    phoneNumber: '',
    defaultDailyRate: 100,
    active: true,
    team: 'flash' as string,
    isSupervisor: false,
    supervisorBonus: 30,
    supervisorTeam: 'flash'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingPromoter) {
      const isKnownSupervisor = 
        Boolean(editingPromoter.isSupervisor) || 
        editingPromoter.name.toLowerCase().includes('rita de cassia') || 
        editingPromoter.name.toLowerCase().includes('terezinha monteiro');

      setFormData({
        name: editingPromoter.name,
        document: editingPromoter.document,
        pixKey: editingPromoter.pixKey,
        pixKeyType: editingPromoter.pixKeyType,
        phoneNumber: editingPromoter.phoneNumber || '',
        defaultDailyRate: editingPromoter.defaultDailyRate || (isKnownSupervisor ? 130 : 100),
        active: editingPromoter.active,
        team: editingPromoter.team || 'flash',
        isSupervisor: isKnownSupervisor,
        supervisorBonus: editingPromoter.supervisorBonus ?? 30,
        supervisorTeam: editingPromoter.supervisorTeam || editingPromoter.team || 'flash'
      });
    } else {
      setFormData({
        name: '',
        document: '',
        pixKey: '',
        pixKeyType: 'CPF',
        phoneNumber: '',
        defaultDailyRate: 100,
        active: true,
        team: 'flash',
        isSupervisor: false,
        supervisorBonus: 30,
        supervisorTeam: 'flash'
      });
    }
  }, [editingPromoter, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Check if document already exists
      const q = query(
        collection(db, 'promoters'),
        where('document', '==', formData.document)
      );
      const snapshot = await getDocs(q);
      
      const duplicate = snapshot.docs.find(doc => doc.id !== editingPromoter?.id);
      
      if (duplicate) {
        throw new Error('Já existe um promotor cadastrado com este CPF/RG.');
      }

      if (editingPromoter) {
        await updateDoc(doc(db, 'promoters', editingPromoter.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'promoters'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar promotor');
      handleFirestoreError(err, editingPromoter ? OperationType.UPDATE : OperationType.CREATE, 'promoters');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
            {editingPromoter ? 'Editar Promotor' : 'Novo Promotor'}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-zinc-400 houver:bg-zinc-100 hover:text-zinc-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 font-medium">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nome Completo</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={e => {
                  const val = e.target.value;
                  const isRitaOrTerezinha = 
                    val.toLowerCase().includes('rita de cassia') || 
                    val.toLowerCase().includes('terezinha monteiro');
                  
                  if (isRitaOrTerezinha && !formData.isSupervisor) {
                    setFormData(prev => ({
                      ...prev,
                      name: val,
                      isSupervisor: true,
                      supervisorBonus: 30,
                      defaultDailyRate: 130,
                      team: val.toLowerCase().includes('rita de cassia') ? 'rapidao' : prev.team,
                      supervisorTeam: val.toLowerCase().includes('rita de cassia') ? 'rapidao' : prev.team
                    }));
                  } else {
                    setFormData(prev => ({ ...prev, name: val }));
                  }
                }}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all"
                placeholder="Ex: Rita de Cássia Pereira"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Documento (CPF/RG)</label>
                <input 
                  required
                  type="text" 
                  value={formData.document}
                  onChange={e => setFormData({...formData, document: e.target.value})}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all"
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">WhatsApp / Telefone</label>
                <input 
                  type="text" 
                  value={formData.phoneNumber}
                  onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Tipo de Chave Pix</label>
                <select 
                  required
                  value={formData.pixKeyType}
                  onChange={e => setFormData({...formData, pixKeyType: e.target.value as Promoter['pixKeyType']})}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all"
                >
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="Email">Email</option>
                  <option value="Phone">Telefone</option>
                  <option value="Random">Chave Aleatória</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Chave Pix</label>
                <input 
                  required
                  type="text" 
                  value={formData.pixKey}
                  onChange={e => setFormData({...formData, pixKey: e.target.value})}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all"
                  placeholder="Digite a chave pix"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Valor da Diária Padrão <span className="text-zinc-400 font-normal lowercase">(R$ 20,00/h × 5h)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">R$</span>
                  <input 
                    required
                    type="number" 
                    value={formData.defaultDailyRate}
                    onChange={e => setFormData({...formData, defaultDailyRate: Number(e.target.value)})}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all font-bold"
                    placeholder="100"
                  />
                </div>
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="active"
                    checked={formData.active}
                    onChange={e => setFormData({...formData, active: e.target.checked})}
                    className="h-5 w-5 rounded border-zinc-300 text-brand-dark focus:ring-brand-lime"
                  />
                  <label htmlFor="active" className="text-sm font-medium text-zinc-700">Promotor Ativo</label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Equipe / Time</label>
                <select 
                  required
                  value={formData.team}
                  onChange={e => {
                    const newTeam = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      team: newTeam,
                      supervisorTeam: prev.isSupervisor ? newTeam : prev.supervisorTeam
                    }));
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all font-bold"
                >
                  {teamsList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.icon || '👥'} {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Configuração de Supervisores em Equipe e Bônus Diário */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3.5 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl leading-none mt-0.5">⭐</span>
                  <div>
                    <label htmlFor="isSupervisor" className="text-sm font-extrabold text-zinc-900 cursor-pointer flex items-center gap-1.5">
                      Supervisor(a) de Equipe
                    </label>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Define esta pessoa como supervisora e ativa o bônus diário nos registros de presença e relatórios.
                    </p>
                  </div>
                </div>
                <input 
                  type="checkbox" 
                  id="isSupervisor"
                  checked={formData.isSupervisor}
                  onChange={e => {
                    const checked = e.target.checked;
                    const bonus = formData.supervisorBonus || 30;
                    setFormData(prev => ({
                      ...prev,
                      isSupervisor: checked,
                      defaultDailyRate: checked ? 100 + bonus : (prev.defaultDailyRate === 130 ? 100 : prev.defaultDailyRate)
                    }));
                  }}
                  className="h-5 w-5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 cursor-pointer mt-0.5"
                />
              </div>

              {formData.isSupervisor && (
                <div className="space-y-3 pt-3 border-t border-amber-200/80">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                        Bônus Diário de Supervisão
                        <span className="text-zinc-500 font-normal lowercase">(R$/dia)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-xs">R$</span>
                        <input 
                          type="number" 
                          min="0"
                          step="1"
                          value={formData.supervisorBonus}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setFormData(prev => ({ 
                              ...prev, 
                              supervisorBonus: val,
                              defaultDailyRate: 100 + val
                            }));
                          }}
                          className="w-full rounded-xl border border-amber-300 bg-white pl-9 pr-3 py-2 text-sm font-bold text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                          placeholder="30"
                        />
                      </div>
                      <p className="text-[11px] text-amber-700">
                        Rita e Terezinha: R$ 30,00/dia. Na Start ou outros times, defina quanto será o bônus.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-amber-900">
                        Equipe Supervisionada
                      </label>
                      <select 
                        value={formData.supervisorTeam || formData.team}
                        onChange={e => setFormData({ ...formData, supervisorTeam: e.target.value })}
                        className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        {teamsList.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.icon || '👥'} {t.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-amber-700">
                        Equipe que fica sob a supervisão desta liderança.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-100/70 border border-amber-200 text-xs text-amber-950 font-medium">
                    <span>💡</span>
                    <span>
                      Diária com supervisão: <strong>R$ {(100 + Number(formData.supervisorBonus || 0)).toFixed(2)}</strong> (R$ 100,00 base + R$ {Number(formData.supervisorBonus || 0).toFixed(2)} bônus diário).
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900 transition-all hover:bg-zinc-200"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-3 text-sm font-semibold text-brand-lime transition-all hover:bg-brand-surface disabled:opacity-50 shadow-lg shadow-brand-lime/5"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-lime/20 border-t-brand-lime" />
              ) : (
                <>
                  <Save size={18} />
                  Salvar
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

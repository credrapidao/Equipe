/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Promoter, OperationType } from '../types';
import { handleFirestoreError } from '../lib/utils';

interface PromoterModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPromoter: Promoter | null;
}

export default function PromoterModal({ isOpen, onClose, editingPromoter }: PromoterModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    document: '',
    pixKey: '',
    pixKeyType: 'CPF' as Promoter['pixKeyType'],
    phoneNumber: '',
    defaultDailyRate: 100,
    active: true,
    team: 'flash' as 'flash' | 'rapidao'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingPromoter) {
      setFormData({
        name: editingPromoter.name,
        document: editingPromoter.document,
        pixKey: editingPromoter.pixKey,
        pixKeyType: editingPromoter.pixKeyType,
        phoneNumber: editingPromoter.phoneNumber || '',
        defaultDailyRate: editingPromoter.defaultDailyRate || 100,
        active: editingPromoter.active,
        team: editingPromoter.team || 'flash'
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
        team: 'flash'
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
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all"
                placeholder="Ex: João Silva"
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
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Valor da Diária Padrão</label>
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
                  onChange={e => setFormData({...formData, team: e.target.value as 'flash' | 'rapidao'})}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all font-bold"
                >
                  <option value="flash">⚡ Time Flash</option>
                  <option value="rapidao">🚀 Time Rapidão</option>
                </select>
              </div>
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

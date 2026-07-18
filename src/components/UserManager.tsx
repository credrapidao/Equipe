import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  Eye, 
  EyeOff, 
  Shield, 
  ShieldCheck, 
  UserPlus, 
  Users,
  Lock
} from 'lucide-react';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  getDocs,
  where
} from 'firebase/firestore';
import { AppUser } from '../types';

interface UserManagerProps {
  readOnly?: boolean;
}

export default function UserManager({ readOnly }: UserManagerProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  
  // Form state
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    displayName: '',
    role: 'viewer' as AppUser['role'],
    team: 'all' as AppUser['team']
  });
  
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch users in real-time
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AppUser));
      setUsers(data);
    }, (err) => {
      console.error('Error listening to users:', err);
    });

    return () => unsubscribe();
  }, []);

  // Set form when editing
  useEffect(() => {
    if (editingUser) {
      setFormData({
        username: editingUser.username,
        password: editingUser.password || '',
        displayName: editingUser.displayName || '',
        role: editingUser.role,
        team: editingUser.team
      });
    } else {
      setFormData({
        username: '',
        password: '',
        displayName: '',
        role: 'viewer',
        team: 'all'
      });
    }
    setError(null);
    setShowFormPassword(false);
  }, [editingUser, isModalOpen]);

  const filteredUsers = users.filter(u => {
    const query = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(query) ||
      u.displayName.toLowerCase().includes(query)
    );
  });

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    const usernameClean = formData.username.trim().toLowerCase();
    const displayNameClean = formData.displayName.trim();
    const passwordClean = formData.password.trim();

    if (!usernameClean || !displayNameClean || !passwordClean) {
      setError('Por favor, preencha todos os campos obrigatórios (Usuário, Senha e Nome).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Check for duplicate username (excluding the current user being edited)
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', usernameClean));
      const snapshot = await getDocs(q);
      
      const isDuplicate = snapshot.docs.some(doc => {
        if (editingUser && doc.id === editingUser.id) return false;
        return true;
      });

      if (isDuplicate) {
        setError('Este nome de usuário já está sendo utilizado por outro cadastro.');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        username: usernameClean,
        displayName: displayNameClean,
        password: passwordClean,
        role: formData.role,
        team: formData.team,
        updatedAt: serverTimestamp()
      };

      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.id), payload);
      } else {
        await addDoc(collection(db, 'users'), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      setIsModalOpen(false);
      setEditingUser(null);
    } catch (err: any) {
      console.error('Error saving user:', err);
      setError(err.message || 'Erro ao salvar o usuário. Verifique as permissões.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (readOnly) return;
    if (confirm('Tem certeza que deseja remover este usuário? Ele perderá acesso ao sistema.')) {
      try {
        await deleteDoc(doc(db, 'users', userId));
      } catch (err) {
        console.error('Error deleting user:', err);
        alert('Erro ao excluir usuário.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm w-full">
        <div className="relative w-full sm:w-85">
          <input
            type="text"
            placeholder="Buscar por usuário ou nome..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm font-medium"
          />
          <Search size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
        </div>

        {!readOnly && (
          <button
            onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10 active:scale-95"
          >
            <UserPlus size={16} />
            Adicionar Usuário
          </button>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/75 border-b border-zinc-100 text-zinc-400 font-extrabold text-[10px] tracking-widest uppercase">
                <th className="px-5 py-4">Nome de Exibição</th>
                <th className="px-5 py-4">Usuário de Acesso</th>
                <th className="px-5 py-4">Senha</th>
                <th className="px-5 py-4">Nível de Permissão</th>
                <th className="px-5 py-4">Acesso a Time</th>
                {!readOnly && <th className="px-5 py-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs text-zinc-600">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 5 : 6} className="text-center py-10 text-zinc-400 font-bold">
                    Nenhum usuário customizado cadastrado.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-zinc-50/40 transition-colors">
                    <td className="px-5 py-4 font-bold text-zinc-900">{u.displayName}</td>
                    <td className="px-5 py-4 font-mono font-medium text-zinc-600">{u.username}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 font-mono">
                        <span>{showPasswordMap[u.id] ? u.password : '••••••••'}</span>
                        <button 
                          onClick={() => togglePasswordVisibility(u.id)}
                          className="text-zinc-400 hover:text-zinc-950 p-1 rounded-md transition-colors"
                          title={showPasswordMap[u.id] ? "Ocultar senha" : "Exibir senha"}
                        >
                          {showPasswordMap[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        u.role === 'admin' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {u.role === 'admin' ? <ShieldCheck size={10} /> : <Shield size={10} />}
                        {u.role === 'admin' ? 'Administrador' : 'Somente Leitura'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wide ${
                        u.team === 'flash' 
                          ? 'bg-indigo-50 text-indigo-700' 
                          : u.team === 'rapidao' 
                          ? 'bg-amber-50 text-amber-700' 
                          : 'bg-zinc-100 text-zinc-700'
                      }`}>
                        {u.team === 'flash' && '⚡ Time Flash'}
                        {u.team === 'rapidao' && '🚀 Time Rapidão'}
                        {u.team === 'all' && '👥 Todos os Times'}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => { setEditingUser(u); setIsModalOpen(true); }}
                            className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Editar Usuário"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Remover Usuário"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)} />
          
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md transform overflow-hidden rounded-3xl bg-white p-6 text-left align-middle shadow-2xl transition-all border border-zinc-100">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <h3 className="text-lg font-extrabold text-zinc-900 tracking-tight flex items-center gap-2">
                  <Lock className="text-indigo-600" size={20} />
                  {editingUser ? 'Editar Usuário' : 'Novo Usuário de Acesso'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl text-xs font-semibold flex items-start gap-2">
                  <div className="mt-0.5">⚠️</div>
                  <p>{error}</p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSave} className="mt-4 space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1">
                    Nome Completo / Exibição *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={formData.displayName}
                    onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1">
                    Usuário de Acesso *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingUser}
                    placeholder="Ex: joao.silva (letras minúsculas)"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm font-mono font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1">
                    Senha de Acesso *
                  </label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      required
                      placeholder="Mínimo de 4 caracteres"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm font-mono font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showFormPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1">
                      Nível de Permissão
                    </label>
                    <select
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value as AppUser['role'] })}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-xs font-semibold text-zinc-700"
                    >
                      <option value="viewer">Somente Leitura</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1">
                      Acesso a Time
                    </label>
                    <select
                      value={formData.team}
                      onChange={e => setFormData({ ...formData, team: e.target.value as AppUser['team'] })}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-xs font-semibold text-zinc-700"
                    >
                      <option value="all">Todos os Times</option>
                      <option value="flash">Time Flash</option>
                      <option value="rapidao">Time Rapidão</option>
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10 active:scale-95 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {isSubmitting ? 'Salvando...' : 'Salvar Usuário'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { db } from './firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  query,
  orderBy 
} from 'firebase/firestore';
import { Team, DEFAULT_TEAMS, Employee, Promoter } from '../types';

export const TEAM_COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string; ring: string }> = {
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    badge: 'bg-indigo-600 text-white',
    ring: 'focus:ring-indigo-500',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    badge: 'bg-amber-500 text-white',
    ring: 'focus:ring-amber-500',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    badge: 'bg-emerald-600 text-white',
    ring: 'focus:ring-emerald-500',
  },
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badge: 'bg-blue-600 text-white',
    ring: 'focus:ring-blue-500',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    badge: 'bg-purple-600 text-white',
    ring: 'focus:ring-purple-500',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    badge: 'bg-rose-600 text-white',
    ring: 'focus:ring-rose-500',
  },
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    badge: 'bg-teal-600 text-white',
    ring: 'focus:ring-teal-500',
  },
  orange: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    badge: 'bg-orange-500 text-white',
    ring: 'focus:ring-orange-500',
  },
};

export function getTeamColorStyle(colorName?: string) {
  const key = (colorName || 'indigo').toLowerCase();
  return TEAM_COLOR_MAP[key] || TEAM_COLOR_MAP['indigo'];
}

export function getTeamDisplay(teamId: string | undefined, teamsList: Team[]) {
  if (!teamId || teamId === 'flash') {
    const flash = teamsList.find(t => t.id === 'flash');
    return {
      id: 'flash',
      name: flash?.name || 'Time Flash',
      icon: flash?.icon || '⚡',
      color: flash?.color || 'indigo',
    };
  }
  if (teamId === 'rapidao') {
    const rap = teamsList.find(t => t.id === 'rapidao');
    return {
      id: 'rapidao',
      name: rap?.name || 'Time Rapidão',
      icon: rap?.icon || '🚀',
      color: rap?.color || 'amber',
    };
  }
  if (teamId === 'both') {
    return {
      id: 'both',
      name: 'Ambas as Equipes (50/50)',
      icon: '⚡🚀',
      color: 'purple',
    };
  }

  const found = teamsList.find(t => t.id === teamId);
  if (found) {
    return {
      id: found.id,
      name: found.name,
      icon: found.icon || '👥',
      color: found.color || 'blue',
    };
  }

  return {
    id: teamId,
    name: teamId,
    icon: '👥',
    color: 'indigo',
  };
}

// Hook to subscribe to teams in Firestore with default fallback
export function useTeams() {
  const [teams, setTeams] = useState<Team[]>(DEFAULT_TEAMS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const teamsCol = collection(db, 'teams');
    const unsubscribe = onSnapshot(teamsCol, (snapshot) => {
      if (snapshot.empty) {
        // Empty in Firestore, use default teams
        setTeams(DEFAULT_TEAMS);
        setLoading(false);
        return;
      }

      const list: Team[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Team));

      // Ensure flash and rapidao always exist
      const hasFlash = list.some(t => t.id === 'flash');
      const hasRapidao = list.some(t => t.id === 'rapidao');
      const merged: Team[] = [...list];

      if (!hasFlash) {
        merged.unshift(DEFAULT_TEAMS[0]);
      }
      if (!hasRapidao) {
        // insert rapidao right after flash or at index 1
        const flashIdx = merged.findIndex(t => t.id === 'flash');
        merged.splice(flashIdx + 1, 0, DEFAULT_TEAMS[1]);
      }

      setTeams(merged);
      setLoading(false);
    }, (err) => {
      console.error('Erro ao escutar equipes:', err);
      setTeams(DEFAULT_TEAMS);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { teams, loading };
}

// Function to create a new team in Firestore
export async function createTeamInFirestore(name: string, icon: string = '👥', color: string = 'indigo'): Promise<Team> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('O nome da equipe é obrigatório.');
  }

  // Generate a URL/ID safe slug
  const baseSlug = cleanName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const id = baseSlug || `team-${Date.now()}`;

  const newTeam: Team = {
    id,
    name: cleanName,
    icon: icon || '👥',
    color: color || 'indigo',
    isDefault: false,
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'teams', id), newTeam, { merge: true });
  return newTeam;
}

// Function to transfer an employee to another team
export async function transferEmployeeTeam(employeeId: string, targetTeamId: string) {
  if (!employeeId) throw new Error('ID do funcionário não informado');
  if (!targetTeamId) throw new Error('Selecione a equipe de destino');

  const employeeRef = doc(db, 'employees', employeeId);
  await updateDoc(employeeRef, {
    team: targetTeamId,
    updatedAt: new Date().toISOString(),
  });
}

// Function to delete a custom team
export async function deleteTeamFromFirestore(teamId: string) {
  if (teamId === 'flash' || teamId === 'rapidao') {
    throw new Error('Não é permitido excluir as equipes padrão do sistema.');
  }
  await deleteDoc(doc(db, 'teams', teamId));
}

export const deleteCustomTeam = deleteTeamFromFirestore;

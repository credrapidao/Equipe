/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Promoter {
  id: string;
  name: string;
  document: string;
  pixKey: string;
  pixKeyType: 'CPF' | 'CNPJ' | 'Email' | 'Phone' | 'Random';
  phoneNumber?: string;
  defaultDailyRate: number;
  active: boolean;
  team?: 'flash' | 'rapidao';
  createdAt?: string;
  updatedAt?: string;
}

export interface Employee {
  id: string;
  name: string;
  document: string;
  pixKey: string;
  pixKeyType: 'CPF' | 'CNPJ' | 'Email' | 'Phone' | 'Random';
  phoneNumber?: string;
  baseSalary: number;
  active: boolean;
  team?: 'flash' | 'rapidao';
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeAbsence {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  discount: number;
  reason?: string;
  recordedAt: string;
}

export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  status: 'pending' | 'paid';
  notes?: string;
  recordedAt: string;
}

export interface Attendance {
  id: string;
  promoterId: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'half-day';
  paymentStatus: 'pending' | 'paid';
  dailyRate: number;
  recordedAt: string;
}

export interface Advance {
  id: string;
  promoterId: string;
  promoterName?: string;
  amount: number;
  date: string;
  status: 'pending' | 'paid';
  notes?: string;
}

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  displayName: string;
  role: 'admin' | 'viewer';
  team: 'all' | 'flash' | 'rapidao';
  createdAt?: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

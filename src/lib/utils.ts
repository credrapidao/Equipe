/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from './firebase';
import { OperationType, FirestoreErrorInfo } from '../types';

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error as { code?: string })?.code;

  // Ignore transient offline/unavailable messages as Firestore handles reconnects automatically
  if (errCode === 'unavailable') {
    console.warn(`Firestore is temporarily operating in offline mode for ${operationType} on ${path}.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', errInfo);
}

// Fuso horário oficial: Horário de Brasília / São Paulo (UTC-3)
export const TIMEZONE = 'America/Sao_Paulo';

/**
 * Retorna a data no fuso horário de São Paulo no formato padrão YYYY-MM-DD
 */
export function formatDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Retorna data e hora formatadas em pt-BR no fuso horário de São Paulo
 */
export function formatDateTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(date);
}

/**
 * Retorna apenas o horário formatado (HH:mm:ss) no fuso horário de São Paulo
 */
export function formatTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

/**
 * Retorna a data no formato legível brasileiro (DD/MM/YYYY) no fuso de São Paulo
 */
export function formatBrazilianDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

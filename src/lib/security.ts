/**
 * @file security.ts
 * Enterprise Cyber Security & Cryptography Engine
 * Standards: NIST SP 800-38D (AES-GCM 256), PBKDF2 RFC 2898, SHA-256 FIPS 180-4
 */

// 1. DATA MASKING UTILITIES (LGPD / Privacy Protection)
export const SecurityMasker = {
  /**
   * Masks a Brazilian CPF (e.g., 123.456.789-00 -> ***.456.789-**)
   */
  maskCPF: (cpf?: string): string => {
    if (!cpf) return '';
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) {
      if (cpf.length <= 4) return '***';
      return `${cpf.slice(0, 2)}***${cpf.slice(-2)}`;
    }
    return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
  },

  /**
   * Masks a Phone number (e.g., (11) 98765-4321 -> (11) 9****-4321)
   */
  maskPhone: (phone?: string): string => {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) return '(**) *****-****';
    const ddd = clean.slice(0, 2);
    const lastDigits = clean.slice(-4);
    return `(${ddd}) 9****-${lastDigits}`;
  },

  /**
   * Masks a PIX key based on its category
   */
  maskPixKey: (key?: string, type?: string): string => {
    if (!key) return '';
    const clean = key.trim();
    if (type === 'CPF') return SecurityMasker.maskCPF(clean);
    if (type === 'Phone') return SecurityMasker.maskPhone(clean);
    if (type === 'Email') {
      const parts = clean.split('@');
      if (parts.length !== 2) return '***@***.com';
      const name = parts[0];
      const domain = parts[1];
      const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : '***';
      return `${maskedName}@${domain}`;
    }
    // Random / CNPJ / Generic
    if (clean.length <= 8) return '********';
    return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
  },

  /**
   * Masks monetary values for confidential screens
   */
  maskCurrency: (val: number | string): string => {
    return 'R$ ••••••';
  }
};

// 2. WEB CRYPTO API AES-GCM 256-BIT ENGINE
const CRYPTO_SALT = new TextEncoder().encode('CredRapidao_AES_GCM_2026_Secured_Salt');

export class CryptoEngine {
  /**
   * Derives a 256-bit AES-GCM key from a passphrase using PBKDF2
   */
  private static async deriveKey(passphrase: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: CRYPTO_SALT,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts plaintext using AES-GCM 256-bit
   * Returns base64 formatted ciphertext with prepended IV
   */
  public static async encrypt(text: string, secretKey: string = 'MasterCredSec2026!'): Promise<string> {
    try {
      const key = await this.deriveKey(secretKey);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encodedText = new TextEncoder().encode(text);

      const ciphertext = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encodedText
      );

      // Combine IV + ciphertext
      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(ciphertext), iv.length);

      // Convert to Base64 string
      let binary = '';
      const bytes = new Uint8Array(combined);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return `ENC::${btoa(binary)}`;
    } catch (err) {
      console.error('Encryption Failure:', err);
      throw new Error('Falha no processo de criptografia criptográfica.');
    }
  }

  /**
   * Decrypts an AES-GCM 256-bit ciphertext
   */
  public static async decrypt(cipherPayload: string, secretKey: string = 'MasterCredSec2026!'): Promise<string> {
    try {
      if (!cipherPayload.startsWith('ENC::')) {
        return cipherPayload; // unencrypted plain text fallback
      }
      const rawBase64 = cipherPayload.replace('ENC::', '');
      const binary = atob(rawBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const iv = bytes.slice(0, 12);
      const data = bytes.slice(12);
      const key = await this.deriveKey(secretKey);

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        data
      );

      return new TextDecoder().decode(decrypted);
    } catch (err) {
      console.error('Decryption Failure:', err);
      return '[Conteúdo Criptografado - Chave Inválida]';
    }
  }

  /**
   * Calculates SHA-256 digital hash of arbitrary text for tamper detection
   */
  public static async calculateSHA256(text: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// 3. XSS & PAYLOAD SANITIZER
export const SecuritySanitizer = {
  sanitizeText: (input?: string): string => {
    if (!input) return '';
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  stripHTML: (input?: string): string => {
    if (!input) return '';
    return input.replace(/<[^>]*>?/gm, '').trim();
  }
};

// 4. ADMIN MASTER PASSWORD SECURITY ENGINE
const ADMIN_HASH_KEY = 'rapidao_admin_sec_hash_v2';
const DEFAULT_INITIAL_ADMIN_PASS = 'admin123';

export const AdminSecurity = {
  /**
   * Hashes a password string with SHA-256
   */
  hashPassword: async (password: string): Promise<string> => {
    return CryptoEngine.calculateSHA256(`ADMIN_SALT_2026_${password}_SEC`);
  },

  /**
   * Stores the new Admin Master Password hash in local secure storage
   */
  saveLocalAdminHash: async (password: string): Promise<void> => {
    const hash = await AdminSecurity.hashPassword(password);
    localStorage.setItem(ADMIN_HASH_KEY, hash);
  },

  /**
   * Verifies if a given password matches the current admin credentials
   */
  verifyAdminPassword: async (inputPass: string, firestorePass?: string): Promise<boolean> => {
    const cleanInput = inputPass.trim();
    if (!cleanInput) return false;

    // 1. If firestore user document exists with a custom password
    if (firestorePass) {
      return firestorePass === cleanInput;
    }

    // 2. Check local secure hash
    const savedHash = localStorage.getItem(ADMIN_HASH_KEY);
    if (savedHash) {
      const inputHash = await AdminSecurity.hashPassword(cleanInput);
      return savedHash === inputHash;
    }

    // 3. Fallback to initial default only if never changed
    return cleanInput === DEFAULT_INITIAL_ADMIN_PASS;
  },

  /**
   * Checks whether the admin password has been customized
   */
  hasCustomPassword: (): boolean => {
    return !!localStorage.getItem(ADMIN_HASH_KEY);
  }
};


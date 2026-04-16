import { adminDb, adminAuth } from './firebase-admin';

// Compatibility helpers for the rest of the app
export const db = adminDb;
export const auth = adminAuth;
export const toObj = (doc: any) => ({ id: doc.id, ...doc.data() });

export function initDb() {
  console.log('Firestore Admin initialized');
}

// Re-export common types/helpers if needed, but routes should use adminDb methods
export { adminDb, adminAuth };

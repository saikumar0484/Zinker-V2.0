import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('⚠️ Could not read firebase-applet-config.json');
}

const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const databaseId = process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    credential = admin.credential.cert(serviceAccount);
    console.log('✅ Loaded Firebase Service Account Key from environment');
  } catch (e: any) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', e.message);
    credential = admin.credential.applicationDefault();
  }
} else {
  console.warn('⚠️ No FIREBASE_SERVICE_ACCOUNT_KEY found. Falling back to Application Default Credentials.');
  credential = admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  try {
    if (!projectId) {
      throw new Error('Missing FIREBASE_PROJECT_ID or projectId in config');
    }
    admin.initializeApp({
      credential,
      projectId: projectId,
    });
    console.log('✅ Firebase Admin initialized for project:', projectId);
  } catch (e: any) {
    console.error('❌ Failed to initialize Firebase Admin:', e.message);
  }
}

export const adminAuth = admin.auth();
export const adminDb = databaseId ? getFirestore(databaseId) : getFirestore();

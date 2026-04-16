import { adminDb } from './src/server/firebase-admin.ts';

async function test() {
  console.log('Testing Firestore connection...');
  try {
    const snap = await adminDb.collection('users').limit(1).get();
    console.log('✅ Success! Found', snap.size, 'users');
  } catch (err: any) {
    console.error('❌ Failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
}

test();

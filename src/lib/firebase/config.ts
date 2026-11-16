import type { FirebaseOptions } from 'firebase/app';

/**
 * Firebase web app config. These values identify the project and are public by
 * design; access is enforced by Security Rules and Authentication settings.
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyD2qrwrs_ilsCqrm9_iAT2aPa_GTCIzoHA',
  authDomain: 'faara-hum.firebaseapp.com',
  projectId: 'faara-hum',
  storageBucket: 'faara-hum.firebasestorage.app',
  messagingSenderId: '416706785843',
  appId: '1:416706785843:web:2d294632851e5747482946',
  measurementId: 'G-5ZSNSMPVDD',
};

/**
 * While true, phone sign-in skips reCAPTCHA and only the test numbers configured in
 * Firebase Console (Authentication → Sign-in method → Phone) work; no SMS is sent.
 * Real numbers will go through a Nigerian SMS provider via Cloud Functions before launch.
 */
export const PHONE_AUTH_TEST_NUMBERS_ONLY = true;

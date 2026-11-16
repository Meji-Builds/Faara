import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

import { firebaseConfig } from './config';

/** The default Firebase app, initialised once (safe across fast refresh). */
export const firebaseApp: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

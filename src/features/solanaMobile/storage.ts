import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ConnectedWallet } from './types';

const keyFor = (uid: string) => `faara.solanaWallet.v1.${uid}`;

export async function loadConnectedWallet(uid: string): Promise<ConnectedWallet | null> {
  try {
    const saved = await AsyncStorage.getItem(keyFor(uid));
    return saved ? (JSON.parse(saved) as ConnectedWallet) : null;
  } catch {
    return null;
  }
}

export async function saveConnectedWallet(uid: string, wallet: ConnectedWallet | null) {
  if (wallet) await AsyncStorage.setItem(keyFor(uid), JSON.stringify(wallet));
  else await AsyncStorage.removeItem(keyFor(uid));
}

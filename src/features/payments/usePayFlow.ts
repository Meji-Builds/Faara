import type { Keypair } from '@solana/web3.js';
import { useCallback, useState } from 'react';

import type { SettleHumResponse } from '@shared/hum';

import { settleHum } from '@/features/hum';
import { friendlyError } from '@/lib/errors';
import { sendUsdc, solanaErrorMessage, useApproval } from '@/features/wallet';
import { apiErrorMessage, ApiRequestError } from '@/lib/api/client';

export interface PaymentToSettle {
  paymentId: string;
  currency: 'NGN' | 'USDC';
  /** Amount in minor units (kobo / cents). */
  amountMinor: number;
  /** Recipient's Solana address (USDC only). */
  recipientWallet: string | null;
  /** Shown in the biometric prompt, e.g. "Pay ₦12,500 to Tolu Adebayo". */
  approvalReason: string;
}

export type PayStage = 'review' | 'pin' | 'paying';

export interface Settlement extends SettleHumResponse {
  elapsedMs: number;
}

/**
 * Approve (fingerprint or PIN) and pay: USDC is signed on the phone and sent on-chain,
 * naira moves on the ledger; then the server settles the payment.
 */
export function usePayFlow(
  payment: PaymentToSettle | null,
  onSettled: (settlement: Settlement) => void,
) {
  const { biometricsEnabled, approveWithBiometrics, approveWithPin } = useApproval();
  const [stage, setStage] = useState<PayStage>('review');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(
    async (signer: Keypair) => {
      if (!payment) return;
      setStage('paying');
      setError(null);
      const startedAt = Date.now();
      try {
        let signature: string | undefined;
        if (payment.currency === 'USDC') {
          if (!payment.recipientWallet) throw new Error('Recipient has no dollar wallet');
          signature = await sendUsdc(signer, payment.recipientWallet, payment.amountMinor);
        }
        const result = await settleHum(payment.paymentId, signature);
        onSettled({ ...result, elapsedMs: Date.now() - startedAt });
      } catch (cause) {
        setError(
          cause instanceof ApiRequestError ? apiErrorMessage(cause) : solanaErrorMessage(cause),
        );
        setStage('review');
      }
    },
    [payment, onSettled],
  );

  const confirmWithFingerprint = useCallback(async () => {
    if (!payment) return;
    setError(null);
    try {
      const signer = await approveWithBiometrics(payment.approvalReason);
      if (signer) await pay(signer);
      else setStage('pin');
    } catch {
      setStage('pin');
    }
  }, [payment, approveWithBiometrics, pay]);

  const confirmWithPin = useCallback(async () => {
    setError(null);
    try {
      const signer = await approveWithPin(pin);
      setPin('');
      await pay(signer);
    } catch (cause) {
      setPin('');
      setError(friendlyError(cause, 'Couldn’t check your PIN. Try again.'));
    }
  }, [approveWithPin, pin, pay]);

  return {
    stage,
    setStage,
    pin,
    setPin,
    error,
    setError,
    biometricsEnabled,
    confirmWithFingerprint,
    confirmWithPin,
  };
}

export type PayFlow = ReturnType<typeof usePayFlow>;

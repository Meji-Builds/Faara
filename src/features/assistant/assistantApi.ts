import type {
  AgentLogEntry,
  AssistantIntent,
  AssistantLanguage,
  ImageType,
  MoneyRule,
  PaymentCheck,
  RuleDraft,
  ScamCheck,
} from '@shared/ai';

import { postJson } from '@/lib/api/client';

export function askAssistant(text: string, language: AssistantLanguage) {
  return postJson<AssistantIntent>('/api/ai/intent', { text, language });
}

export function checkPayment(username: string, amountKobo: number, note: string) {
  return postJson<PaymentCheck>('/api/ai/check', { username, amountKobo, note });
}

export function checkForScam(
  text: string,
  image: { mediaType: ImageType; data: string } | null,
  language: AssistantLanguage,
) {
  return postJson<ScamCheck>('/api/ai/scam', { text, image, language });
}

export function draftRule(text: string, language: AssistantLanguage) {
  return postJson<{ draft: RuleDraft | null; question: string }>('/api/ai/draft', {
    text,
    language,
  });
}

export function getRules() {
  return postJson<{ rules: MoneyRule[]; log: AgentLogEntry[] }>('/api/ai/rules', {});
}

export function saveRule(draft: RuleDraft) {
  return postJson<MoneyRule>('/api/ai/save', draft);
}

export function removeRule(id: string) {
  return postJson<{ removed: string }>('/api/ai/remove', { id });
}

export function runMoneyAgent() {
  return postJson<{ actions: AgentLogEntry[] }>('/api/ai/run', {});
}

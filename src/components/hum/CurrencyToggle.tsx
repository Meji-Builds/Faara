import { TextTabs } from '@/components/ui';
import type { Currency } from '@/lib/money';

const OPTIONS: readonly Currency[] = ['NGN', 'USDC'];

interface CurrencyToggleProps {
  value: Currency;
  onChange: (currency: Currency) => void;
}

export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  return <TextTabs options={OPTIONS} value={value} onChange={onChange} />;
}

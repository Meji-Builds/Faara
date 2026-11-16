import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { IconButton } from './IconButton';

interface BackButtonProps {
  /** Custom handler; defaults to navigating back. */
  onPress?: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <IconButton
      accessibilityLabel="Go back"
      icon={<ChevronLeft size={20} color={colors.text} strokeWidth={2} />}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
    />
  );
}

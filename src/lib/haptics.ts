import * as Haptics from 'expo-haptics';

const ignore = () => undefined;

/** Small physical cues for key moments. Silent where the device has no vibration motor. */
export const haptics = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(ignore),
};

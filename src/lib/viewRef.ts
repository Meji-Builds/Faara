import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

/** Ref to a mounted native `View` (e.g. for capturing it as an image). */
export type ViewRef = RefObject<ComponentRef<typeof View> | null>;

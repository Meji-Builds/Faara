import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export interface SamplesEvent {
  /** Base64-encoded 16-bit little-endian mono PCM. */
  pcm: string;
  sampleRate: number;
}

export interface CaptureInfo {
  sampleRate: number;
  /** Android audio source in use: "unprocessed" or "voice_recognition". */
  source: string;
}

interface FaaraAudioNativeModule {
  getNativeSampleRate(): number;
  startCapture(): Promise<CaptureInfo>;
  stopCapture(): Promise<void>;
  startPlayback(
    pcmBase64: string,
    sampleRate: number,
    loop: boolean,
    volume: number,
  ): Promise<void>;
  stopPlayback(): Promise<void>;
  addListener(eventName: 'onSamples', listener: (event: SamplesEvent) => void): EventSubscription;
}

/**
 * The native module, or null when it isn't in the current binary
 * (Expo Go, web, iOS, or a build made before the module was added).
 */
export const FaaraAudio = requireOptionalNativeModule<FaaraAudioNativeModule>('FaaraAudio');

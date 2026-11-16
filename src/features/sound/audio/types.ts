export interface CaptureSession {
  /** Rate of the samples delivered to the callback. */
  sampleRate: number;
  /** Human-readable description of the input path, for diagnostics. */
  description: string;
  stop(): Promise<void>;
}

export interface PlaybackOptions {
  /** Repeat the buffer seamlessly until stopped. */
  loop: boolean;
  /** 0–1, relative to the device's current volume. */
  volume: number;
}

/** Platform-neutral raw audio I/O used by the sound channel. */
export interface AudioEngine {
  /** False when this platform/binary cannot do raw audio (e.g. Expo Go or iOS for now). */
  readonly available: boolean;
  readonly unavailableReason?: string;
  requestMicrophonePermission(): Promise<boolean>;
  startCapture(onSamples: (samples: Float32Array) => void): Promise<CaptureSession>;
  /** Sample rate that playback buffers should be rendered at. */
  playbackSampleRate(): Promise<number>;
  startPlayback(samples: Float32Array, sampleRate: number, options: PlaybackOptions): Promise<void>;
  stopPlayback(): Promise<void>;
}

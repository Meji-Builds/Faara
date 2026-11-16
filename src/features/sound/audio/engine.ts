import { FaaraAudio } from '@modules/faara-audio';
import { PermissionsAndroid, Platform } from 'react-native';

import { floatToPcm16Base64, pcm16Base64ToFloat } from './pcm';
import type { AudioEngine } from './types';

function unavailable(reason: string): AudioEngine {
  const fail = () => Promise.reject(new Error(reason));
  return {
    available: false,
    unavailableReason: reason,
    prepare: () => undefined,
    requestMicrophonePermission: async () => false,
    startCapture: fail,
    playbackSampleRate: fail,
    startPlayback: fail,
    stopPlayback: async () => undefined,
  };
}

/** Android implementation backed by the FaaraAudio native module. */
function createAndroidEngine(): AudioEngine {
  const native = FaaraAudio;
  if (!native) {
    return unavailable(
      'This build does not include the sound module. Install a new build from EAS.',
    );
  }
  return {
    available: true,
    prepare: () => undefined,

    async requestMicrophonePermission() {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone access',
        message: 'Faara listens for a short, inaudible hum to receive payments from phones nearby.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      return result === PermissionsAndroid.RESULTS.GRANTED;
    },

    async startCapture(onSamples) {
      const subscription = native.addListener('onSamples', (event) =>
        onSamples(pcm16Base64ToFloat(event.pcm)),
      );
      try {
        const info = await native.startCapture();
        return {
          sampleRate: info.sampleRate,
          description: `Android ${info.source} @ ${info.sampleRate} Hz`,
          stop: async () => {
            subscription.remove();
            await native.stopCapture();
          },
        };
      } catch (error) {
        subscription.remove();
        throw error;
      }
    },

    async playbackSampleRate() {
      return native.getNativeSampleRate();
    },

    async startPlayback(samples, sampleRate, { loop, volume }) {
      await native.startPlayback(floatToPcm16Base64(samples), sampleRate, loop, volume);
    },

    async stopPlayback() {
      await native.stopPlayback();
    },
  };
}

export const audioEngine: AudioEngine =
  Platform.OS === 'android'
    ? createAndroidEngine()
    : unavailable('The sound channel is Android-first; iOS support comes later.');

import type { AudioEngine, CaptureSession } from './types';

/** Collects 128-frame render quanta into larger chunks before posting to the main thread. */
const CAPTURE_WORKLET = `
class FaaraCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.length = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.length++] = channel[i];
        if (this.length === this.buffer.length) {
          this.port.postMessage(this.buffer.slice(0));
          this.length = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('faara-capture', FaaraCapture);
`;

let context: AudioContext | null = null;
let workletLoaded: Promise<void> | null = null;
let playback: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

/** Creates the shared context and starts resuming it; safe to call from a tap handler. */
function ensureContext(): AudioContext {
  if (!context) context = new AudioContext({ latencyHint: 'interactive' });
  if (context.state === 'suspended') context.resume().catch(() => undefined);
  return context;
}

/** Shared context, created and resumed on first use (must follow a user gesture on mobile). */
async function getContext(): Promise<AudioContext> {
  const ctx = ensureContext();
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.AudioContext === 'function' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

async function openMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      // Voice processing would filter out or distort 18–20 kHz tones.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
}

async function attachCapture(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  onSamples: (samples: Float32Array) => void,
): Promise<() => void> {
  if (ctx.audioWorklet) {
    workletLoaded ??= (async () => {
      const url = URL.createObjectURL(
        new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }),
      );
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
    await workletLoaded;
    const node = new AudioWorkletNode(ctx, 'faara-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    node.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
    // A silent path to the destination keeps the node processing in every browser.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(ctx.destination);
    return () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      mute.disconnect();
    };
  }

  // Fallback for browsers without AudioWorklet.
  const processor = ctx.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = (event) =>
    onSamples(new Float32Array(event.inputBuffer.getChannelData(0)));
  source.connect(processor).connect(ctx.destination);
  return () => {
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
  };
}

export const audioEngine: AudioEngine = supported()
  ? {
      available: true,

      prepare() {
        ensureContext();
      },

      async requestMicrophonePermission() {
        try {
          const stream = await openMicrophone();
          stream.getTracks().forEach((track) => track.stop());
          return true;
        } catch {
          return false;
        }
      },

      async startCapture(onSamples): Promise<CaptureSession> {
        const ctx = await getContext();
        const stream = await openMicrophone();
        const source = ctx.createMediaStreamSource(stream);
        const detach = await attachCapture(ctx, source, onSamples);
        const settings = stream.getAudioTracks()[0]?.getSettings();
        const processing =
          settings?.echoCancellation || settings?.noiseSuppression || settings?.autoGainControl;
        return {
          sampleRate: ctx.sampleRate,
          description: `Browser mic @ ${ctx.sampleRate} Hz${processing ? ' (voice processing on)' : ''}`,
          stop: async () => {
            detach();
            stream.getTracks().forEach((track) => track.stop());
          },
        };
      },

      async playbackSampleRate() {
        return (await getContext()).sampleRate;
      },

      async startPlayback(samples, sampleRate, { loop, volume }) {
        const ctx = await getContext();
        this.stopPlayback();
        const buffer = ctx.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain).connect(ctx.destination);
        source.start();
        playback = { source, gain };
      },

      async stopPlayback() {
        if (!playback) return;
        try {
          playback.source.stop();
        } catch {
          // Already stopped.
        }
        playback.source.disconnect();
        playback.gain.disconnect();
        playback = null;
      },
    }
  : {
      available: false,
      unavailableReason: 'This browser does not support microphone access.',
      prepare: () => undefined,
      requestMicrophonePermission: async () => false,
      startCapture: () => Promise.reject(new Error('Unsupported browser')),
      playbackSampleRate: () => Promise.reject(new Error('Unsupported browser')),
      startPlayback: () => Promise.reject(new Error('Unsupported browser')),
      stopPlayback: async () => undefined,
    };

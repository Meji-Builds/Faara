package expo.modules.faaraaudio

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val SAMPLES_EVENT = "onSamples"

/** Samples per event: ~43 ms at 48 kHz. Small enough for low latency, large enough to limit bridge traffic. */
private const val CHUNK_SAMPLES = 2048

private val PREFERRED_SAMPLE_RATES = intArrayOf(48_000, 44_100)

class MicrophonePermissionException :
  CodedException("Microphone permission has not been granted")

class AudioInitException(message: String) : CodedException(message)

/**
 * Raw PCM audio I/O for the sound channel.
 *
 * Expo's standard audio APIs record to files; the modem needs live samples with
 * no voice processing (AGC, noise suppression, echo cancellation would destroy
 * 18–20 kHz tones), and gap-free looped playback of a generated frame.
 *
 * Samples cross the bridge as base64-encoded 16-bit little-endian PCM.
 */
class FaaraAudioModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val lock = Any()
  private var recorder: AudioRecord? = null
  private var captureThread: Thread? = null
  @Volatile private var capturing = false
  private var track: AudioTrack? = null

  override fun definition() = ModuleDefinition {
    Name("FaaraAudio")

    Events(SAMPLES_EVENT)

    /** Output sample rate the device mixes at natively (usually 48000). */
    Function("getNativeSampleRate") {
      val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      manager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 48_000
    }

    /** Starts streaming microphone samples via `onSamples` events. Resolves with the actual sample rate. */
    AsyncFunction("startCapture") {
      synchronized(lock) {
        stopCaptureLocked()
        val (record, sampleRate) = createRecorder()
        record.startRecording()
        if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
          record.release()
          throw AudioInitException("Microphone could not start recording")
        }
        recorder = record
        capturing = true
        captureThread = Thread({ captureLoop(record, sampleRate) }, "FaaraAudioCapture").apply {
          priority = Thread.MAX_PRIORITY
          start()
        }
        mapOf("sampleRate" to sampleRate, "source" to sourceName(record.audioSource))
      }
    }

    AsyncFunction("stopCapture") {
      synchronized(lock) { stopCaptureLocked() }
    }

    /**
     * Plays 16-bit mono PCM. With `loop`, the buffer repeats seamlessly until stopped.
     * `volume` is 0–1 and scales the track, not the system volume.
     */
    AsyncFunction("startPlayback") { pcmBase64: String, sampleRate: Int, loop: Boolean, volume: Double ->
      synchronized(lock) {
        stopPlaybackLocked()
        val samples = decodePcm(pcmBase64)
        if (samples.isEmpty()) throw AudioInitException("Nothing to play")

        val newTrack = AudioTrack.Builder()
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(sampleRate)
              .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
              .build()
          )
          .setTransferMode(AudioTrack.MODE_STATIC)
          .setBufferSizeInBytes(samples.size * 2)
          .build()

        if (newTrack.state != AudioTrack.STATE_NO_STATIC_DATA && newTrack.state != AudioTrack.STATE_INITIALIZED) {
          newTrack.release()
          throw AudioInitException("Speaker could not be initialised")
        }
        newTrack.write(samples, 0, samples.size)
        if (loop) newTrack.setLoopPoints(0, samples.size, -1)
        newTrack.setVolume(volume.coerceIn(0.0, 1.0).toFloat())
        newTrack.play()
        track = newTrack
      }
    }

    AsyncFunction("stopPlayback") {
      synchronized(lock) { stopPlaybackLocked() }
    }

    OnDestroy {
      synchronized(lock) {
        stopCaptureLocked()
        stopPlaybackLocked()
      }
    }
  }

  @SuppressLint("MissingPermission") // Checked explicitly below.
  private fun createRecorder(): Pair<AudioRecord, Int> {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      throw MicrophonePermissionException()
    }
    val source = preferredAudioSource()
    for (sampleRate in PREFERRED_SAMPLE_RATES) {
      val minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      if (minBuffer <= 0) continue
      val bufferBytes = maxOf(minBuffer * 2, CHUNK_SAMPLES * 2 * 4)
      val record = AudioRecord(source, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferBytes)
      if (record.state == AudioRecord.STATE_INITIALIZED) return record to sampleRate
      record.release()
    }
    throw AudioInitException("No supported microphone configuration")
  }

  /**
   * UNPROCESSED bypasses all voice processing where the device supports it.
   * VOICE_RECOGNITION is the fallback: by contract it disables AGC and noise suppression.
   */
  private fun preferredAudioSource(): Int {
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val unprocessed = manager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED)
    return if (unprocessed == "true") MediaRecorder.AudioSource.UNPROCESSED else MediaRecorder.AudioSource.VOICE_RECOGNITION
  }

  private fun sourceName(source: Int): String = when (source) {
    MediaRecorder.AudioSource.UNPROCESSED -> "unprocessed"
    MediaRecorder.AudioSource.VOICE_RECOGNITION -> "voice_recognition"
    else -> "other"
  }

  private fun captureLoop(record: AudioRecord, sampleRate: Int) {
    val shorts = ShortArray(CHUNK_SAMPLES)
    val bytes = ByteBuffer.allocate(CHUNK_SAMPLES * 2).order(ByteOrder.LITTLE_ENDIAN)
    while (capturing) {
      val read = record.read(shorts, 0, shorts.size)
      if (read <= 0) {
        if (read < 0) break // device error; stop quietly
        continue
      }
      bytes.clear()
      bytes.asShortBuffer().put(shorts, 0, read)
      val encoded = Base64.encodeToString(bytes.array(), 0, read * 2, Base64.NO_WRAP)
      sendEvent(SAMPLES_EVENT, mapOf("pcm" to encoded, "sampleRate" to sampleRate))
    }
  }

  private fun stopCaptureLocked() {
    capturing = false
    captureThread?.join(500)
    captureThread = null
    recorder?.let {
      try {
        it.stop()
      } catch (ignored: IllegalStateException) {
        // Already stopped.
      }
      it.release()
    }
    recorder = null
  }

  private fun stopPlaybackLocked() {
    track?.let {
      try {
        it.stop()
      } catch (ignored: IllegalStateException) {
        // Never started.
      }
      it.release()
    }
    track = null
  }

  private fun decodePcm(base64: String): ShortArray {
    val bytes = Base64.decode(base64, Base64.DEFAULT)
    val shorts = ShortArray(bytes.size / 2)
    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts)
    return shorts
  }
}

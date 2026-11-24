package expo.modules.faarable

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

private const val TOKEN_EVENT = "onPayload"
private const val NEARBY_EVENT = "onOfflineNearby"
private const val OFFER_READ_EVENT = "onOfflineOfferRead"
private const val PAYMENT_EVENT = "onOfflinePayment"

/** 16-bit service UUID used to tag Faara hum advertisements. */
private val SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("0000FAA7-0000-1000-8000-00805F9B34FB")

class BluetoothUnavailableException(message: String) : CodedException(message)

/**
 * Broadcasts and scans hum codes over Bluetooth LE, and (through [OfflineLink]) connects two
 * phones directly so a payment can pass between them with no network.
 *
 * The sender advertises the service UUID plus 8 bytes of service data (version + packed
 * code) at ultra-low transmit power, which keeps the useful range short. The receiver scans
 * for the service UUID and reports each payload with its RSSI. Permissions are requested
 * from JavaScript before calling these functions.
 */
class FaaraBleModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val adapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private val lock = Any()
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var scanner: BluetoothLeScanner? = null
  private var scanCallback: ScanCallback? = null

  /** Offline payments run their Bluetooth steps here, one at a time, off the UI thread. */
  private val offlineQueue = Executors.newSingleThreadExecutor()
  private val offline by lazy {
    OfflineLink(
      context,
      { adapter },
      object : OfflineLinkEvents {
        override fun nearby(deviceId: String, rssi: Int) =
          sendEvent(NEARBY_EVENT, mapOf("deviceId" to deviceId, "rssi" to rssi))

        override fun offerRead(deviceId: String) =
          sendEvent(OFFER_READ_EVENT, mapOf("deviceId" to deviceId))

        override fun paymentReceived(deviceId: String, payload: ByteArray) =
          sendEvent(
            PAYMENT_EVENT,
            mapOf("deviceId" to deviceId, "payload" to Base64.encodeToString(payload, Base64.NO_WRAP)),
          )
      },
    )
  }

  /** Runs a Bluetooth step on the offline queue and settles the promise with its result. */
  private fun offlineStep(promise: Promise, work: () -> Any?) {
    offlineQueue.execute {
      try {
        val value = work()
        promise.resolve(if (value is Unit) null else value)
      } catch (error: Exception) {
        promise.reject(BluetoothUnavailableException(error.message ?: "Bluetooth failed"))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("FaaraBle")

    Events(TOKEN_EVENT, NEARBY_EVENT, OFFER_READ_EVENT, PAYMENT_EVENT)

    /** Receiver: serve this offer (base64) to nearby payers and advertise. */
    AsyncFunction("startOfflineReceiving") { offerBase64: String, promise: Promise ->
      offlineQueue.execute {
        try {
          offline.startReceiving(Base64.decode(offerBase64, Base64.DEFAULT)) { error ->
            if (error == null) promise.resolve(null)
            else promise.reject(BluetoothUnavailableException(error.message ?: "Bluetooth failed"))
          }
        } catch (error: Exception) {
          promise.reject(BluetoothUnavailableException(error.message ?: "Bluetooth failed"))
        }
      }
    }

    /** Receiver: tell a payer what happened to their payment (base64). */
    AsyncFunction("answerOffline") { deviceId: String, resultBase64: String ->
      offline.answer(deviceId, Base64.decode(resultBase64, Base64.DEFAULT))
    }

    AsyncFunction("stopOfflineReceiving") { promise: Promise ->
      offlineStep(promise) { offline.stopReceiving() }
    }

    /** Payer: look for phones ready to receive; sightings arrive as onOfflineNearby. */
    AsyncFunction("startOfflineLooking") { promise: Promise ->
      offlineStep(promise) { offline.startLooking() }
    }

    AsyncFunction("stopOfflineLooking") { promise: Promise ->
      offlineStep(promise) { offline.stopLooking() }
    }

    /** Payer: connect to a phone and return its offer (base64). */
    AsyncFunction("connectOffline") { deviceId: String, promise: Promise ->
      offlineStep(promise) {
        Base64.encodeToString(offline.connectAndReadOffer(deviceId), Base64.NO_WRAP)
      }
    }

    /** Payer: send the payment (base64) and return the receiver's answer (base64). */
    AsyncFunction("sendOfflinePayment") { paymentBase64: String, promise: Promise ->
      offlineStep(promise) {
        val answer = offline.sendPayment(Base64.decode(paymentBase64, Base64.DEFAULT))
        Base64.encodeToString(answer, Base64.NO_WRAP)
      }
    }

    AsyncFunction("disconnectOffline") { promise: Promise ->
      offlineStep(promise) { offline.disconnect() }
    }

    /** "unsupported", "off" or "on". */
    Function("getState") {
      val current = adapter
      when {
        current == null -> "unsupported"
        !current.isEnabled -> "off"
        else -> "on"
      }
    }

    Function("canAdvertise") {
      adapter?.isMultipleAdvertisementSupported == true
    }

    AsyncFunction("startAdvertising") { payloadBase64: String, promise: Promise ->
      startAdvertising(Base64.decode(payloadBase64, Base64.DEFAULT), promise)
    }

    AsyncFunction("stopAdvertising") {
      synchronized(lock) { stopAdvertisingLocked() }
    }

    AsyncFunction("startScanning") {
      startScanning()
    }

    AsyncFunction("stopScanning") {
      synchronized(lock) { stopScanningLocked() }
    }

    OnDestroy {
      synchronized(lock) {
        stopAdvertisingLocked()
        stopScanningLocked()
      }
      offline.stopAll()
      offlineQueue.shutdown()
    }
  }

  private fun requireEnabledAdapter(): BluetoothAdapter {
    val current = adapter ?: throw BluetoothUnavailableException("This phone has no Bluetooth")
    if (!current.isEnabled) throw BluetoothUnavailableException("Bluetooth is turned off")
    return current
  }

  @SuppressLint("MissingPermission") // Requested from JavaScript before this is called.
  private fun startAdvertising(payload: ByteArray, promise: Promise) {
    synchronized(lock) {
      stopAdvertisingLocked()
      val current = requireEnabledAdapter()
      val leAdvertiser = current.bluetoothLeAdvertiser
        ?: throw BluetoothUnavailableException("This phone can't broadcast over Bluetooth LE")

      val settings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_ULTRA_LOW)
        .setConnectable(false)
        .setTimeout(0)
        .build()

      val data = AdvertiseData.Builder()
        .setIncludeDeviceName(false)
        .setIncludeTxPowerLevel(false)
        .addServiceUuid(SERVICE_UUID)
        .addServiceData(SERVICE_UUID, payload)
        .build()

      val callback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
          promise.resolve()
        }

        override fun onStartFailure(errorCode: Int) {
          promise.reject(BluetoothUnavailableException("Bluetooth broadcast failed (code $errorCode)"))
        }
      }
      advertiser = leAdvertiser
      advertiseCallback = callback
      leAdvertiser.startAdvertising(settings, data, callback)
    }
  }

  @SuppressLint("MissingPermission") // Requested from JavaScript before this is called.
  private fun startScanning() {
    synchronized(lock) {
      stopScanningLocked()
      val current = requireEnabledAdapter()
      val leScanner = current.bluetoothLeScanner
        ?: throw BluetoothUnavailableException("This phone can't scan over Bluetooth LE")

      val filters = listOf(ScanFilter.Builder().setServiceUuid(SERVICE_UUID).build())
      val settings = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .build()

      val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          report(result)
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
          results.forEach { report(it) }
        }
      }
      scanner = leScanner
      scanCallback = callback
      leScanner.startScan(filters, settings, callback)
    }
  }

  private fun report(result: ScanResult) {
    val payload = result.scanRecord?.getServiceData(SERVICE_UUID) ?: return
    sendEvent(
      TOKEN_EVENT,
      mapOf(
        "payload" to Base64.encodeToString(payload, Base64.NO_WRAP),
        "rssi" to result.rssi,
      ),
    )
  }

  @SuppressLint("MissingPermission")
  private fun stopAdvertisingLocked() {
    val callback = advertiseCallback ?: return
    try {
      advertiser?.stopAdvertising(callback)
    } catch (ignored: IllegalStateException) {
      // Bluetooth was turned off; nothing to stop.
    } catch (ignored: SecurityException) {
      // Permission revoked while advertising.
    }
    advertiser = null
    advertiseCallback = null
  }

  @SuppressLint("MissingPermission")
  private fun stopScanningLocked() {
    val callback = scanCallback ?: return
    try {
      scanner?.stopScan(callback)
    } catch (ignored: IllegalStateException) {
      // Bluetooth was turned off; nothing to stop.
    } catch (ignored: SecurityException) {
      // Permission revoked while scanning.
    }
    scanner = null
    scanCallback = null
  }
}

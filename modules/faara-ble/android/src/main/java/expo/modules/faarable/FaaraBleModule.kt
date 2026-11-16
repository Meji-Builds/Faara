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

private const val TOKEN_EVENT = "onPayload"

/** 16-bit service UUID used to tag Faara hum advertisements. */
private val SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("0000FAA7-0000-1000-8000-00805F9B34FB")

class BluetoothUnavailableException(message: String) : CodedException(message)

/**
 * Broadcasts and scans hum codes over Bluetooth LE.
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

  override fun definition() = ModuleDefinition {
    Name("FaaraBle")

    Events(TOKEN_EVENT)

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

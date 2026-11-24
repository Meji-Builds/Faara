package expo.modules.faarable

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Service a phone ready to receive offline advertises and serves. */
val OFFLINE_SERVICE: UUID = UUID.fromString("f4a70001-6d2b-4b8e-9a1f-0c5a7e3d2b10")
/** Read: the receiver's offer (who they are and a fresh nonce). */
private val OFFER_CHAR: UUID = UUID.fromString("f4a70002-6d2b-4b8e-9a1f-0c5a7e3d2b10")
/** Write: the payer's signed payment, in numbered frames. */
private val PAYMENT_CHAR: UUID = UUID.fromString("f4a70003-6d2b-4b8e-9a1f-0c5a7e3d2b10")
/** Read: the receiver's answer to that payment; empty until it has checked it. */
private val RESULT_CHAR: UUID = UUID.fromString("f4a70004-6d2b-4b8e-9a1f-0c5a7e3d2b10")

private const val FRAME_HEADER = 5
private const val FRAME_VERSION: Byte = 1
private const val MAX_MESSAGE = 4096
private const val STEP_TIMEOUT_S = 8L
private const val RESULT_TIMEOUT_MS = 10_000L

class OfflineLinkException(message: String) : Exception(message)

/** Events the link reports back to JavaScript. */
interface OfflineLinkEvents {
  fun nearby(deviceId: String, rssi: Int)
  fun offerRead(deviceId: String)
  fun paymentReceived(deviceId: String, payload: ByteArray)
}

/**
 * The phone-to-phone connection used to pay with no network.
 *
 * The receiver runs a small GATT server and advertises it at low power. The payer scans for
 * it, connects to the closest phone, reads the offer, writes the signed payment in frames,
 * then reads back the receiver's answer. Nothing here trusts what it carries: both sides
 * check every signature in JavaScript, and a payment is only good for the person it names.
 */
@SuppressLint("MissingPermission") // Permissions are requested from JavaScript first.
class OfflineLink(
  private val context: Context,
  private val adapter: () -> BluetoothAdapter?,
  private val events: OfflineLinkEvents,
) {
  private val lock = Any()

  // Receiver side.
  private var server: BluetoothGattServer? = null
  private var advertiseCallback: AdvertiseCallback? = null
  @Volatile private var offer: ByteArray = ByteArray(0)
  private val inbound = ConcurrentHashMap<String, Inbound>()
  private val results = ConcurrentHashMap<String, ByteArray>()

  // Payer side.
  private var scanCallback: ScanCallback? = null
  private val seen = ConcurrentHashMap<String, BluetoothDevice>()
  private var client: Client? = null

  private class Inbound(val total: Int) {
    val parts = arrayOfNulls<ByteArray>(total)
  }

  private fun manager() = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager

  private fun enabledAdapter(): BluetoothAdapter {
    val current = adapter() ?: throw OfflineLinkException("This phone has no Bluetooth")
    if (!current.isEnabled) throw OfflineLinkException("Bluetooth is turned off")
    return current
  }

  // ---------------------------------------------------------------- receiver

  /** Serves `offerBytes` and advertises; calling again just replaces the offer. */
  fun startReceiving(offerBytes: ByteArray, onStarted: (Throwable?) -> Unit) {
    synchronized(lock) {
      offer = offerBytes
      if (server != null && advertiseCallback != null) {
        onStarted(null)
        return
      }
      val current = enabledAdapter()
      val advertiser = current.bluetoothLeAdvertiser
        ?: throw OfflineLinkException("This phone can't broadcast over Bluetooth LE")
      val gattServer = manager()?.openGattServer(context, serverCallback)
        ?: throw OfflineLinkException("Bluetooth isn't ready")
      val service = BluetoothGattService(OFFLINE_SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY)
      service.addCharacteristic(
        BluetoothGattCharacteristic(
          OFFER_CHAR,
          BluetoothGattCharacteristic.PROPERTY_READ,
          BluetoothGattCharacteristic.PERMISSION_READ,
        ),
      )
      service.addCharacteristic(
        BluetoothGattCharacteristic(
          PAYMENT_CHAR,
          BluetoothGattCharacteristic.PROPERTY_WRITE,
          BluetoothGattCharacteristic.PERMISSION_WRITE,
        ),
      )
      service.addCharacteristic(
        BluetoothGattCharacteristic(
          RESULT_CHAR,
          BluetoothGattCharacteristic.PROPERTY_READ,
          BluetoothGattCharacteristic.PERMISSION_READ,
        ),
      )
      gattServer.addService(service)
      server = gattServer

      val settings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        // Low power keeps the reach to a few metres; the payer also picks the strongest signal.
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_LOW)
        .setConnectable(true)
        .setTimeout(0)
        .build()
      val data = AdvertiseData.Builder()
        .setIncludeDeviceName(false)
        .setIncludeTxPowerLevel(false)
        .addServiceUuid(ParcelUuid(OFFLINE_SERVICE))
        .build()
      val callback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) = onStarted(null)
        override fun onStartFailure(errorCode: Int) =
          onStarted(OfflineLinkException("Bluetooth broadcast failed (code $errorCode)"))
      }
      advertiseCallback = callback
      advertiser.startAdvertising(settings, data, callback)
    }
  }

  /** Gives a connected payer the receiver's answer to their payment. */
  fun answer(deviceId: String, result: ByteArray) {
    results[deviceId] = result
  }

  fun stopReceiving() {
    synchronized(lock) {
      advertiseCallback?.let { callback ->
        try {
          adapter()?.bluetoothLeAdvertiser?.stopAdvertising(callback)
        } catch (ignored: RuntimeException) {
          // Bluetooth turned off or permission revoked: nothing left to stop.
        }
      }
      advertiseCallback = null
      try {
        server?.close()
      } catch (ignored: RuntimeException) {
        // Already closed by the system.
      }
      server = null
      inbound.clear()
      results.clear()
    }
  }

  private val serverCallback = object : BluetoothGattServerCallback() {
    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        inbound.remove(device.address)
      }
    }

    override fun onCharacteristicReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic,
    ) {
      val value = when (characteristic.uuid) {
        OFFER_CHAR -> offer
        RESULT_CHAR -> results[device.address] ?: ByteArray(0)
        else -> null
      }
      val gattServer = server ?: return
      if (value == null || offset > value.size) {
        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
        return
      }
      // Long values are read in pieces; serve from the offset asked for.
      gattServer.sendResponse(
        device,
        requestId,
        BluetoothGatt.GATT_SUCCESS,
        offset,
        value.copyOfRange(offset, value.size),
      )
      if (characteristic.uuid == OFFER_CHAR && offset == 0) events.offerRead(device.address)
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray?,
    ) {
      val gattServer = server ?: return
      val ok = characteristic.uuid == PAYMENT_CHAR && !preparedWrite && value != null &&
        acceptFrame(device.address, value)
      if (responseNeeded) {
        gattServer.sendResponse(
          device,
          requestId,
          if (ok) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_FAILURE,
          offset,
          null,
        )
      }
    }
  }

  /** Frame: version, index (2 bytes), total (2 bytes), then data. */
  private fun acceptFrame(deviceId: String, frame: ByteArray): Boolean {
    if (frame.size <= FRAME_HEADER || frame[0] != FRAME_VERSION) return false
    val index = ((frame[1].toInt() and 0xff) shl 8) or (frame[2].toInt() and 0xff)
    val total = ((frame[3].toInt() and 0xff) shl 8) or (frame[4].toInt() and 0xff)
    if (total == 0 || index >= total || total * (frame.size - FRAME_HEADER) > MAX_MESSAGE * 2) {
      return false
    }
    if (index == 0) {
      inbound[deviceId] = Inbound(total)
      results.remove(deviceId)
    }
    val message = inbound[deviceId] ?: return false
    if (message.total != total) return false
    message.parts[index] = frame.copyOfRange(FRAME_HEADER, frame.size)
    if (message.parts.all { it != null }) {
      inbound.remove(deviceId)
      val payload = message.parts.fold(ByteArray(0)) { acc, part -> acc + part!! }
      if (payload.size <= MAX_MESSAGE) events.paymentReceived(deviceId, payload)
    }
    return true
  }

  // ---------------------------------------------------------------- payer

  /** Looks for nearby phones ready to receive; each sighting goes to `events.nearby`. */
  fun startLooking() {
    synchronized(lock) {
      stopLookingLocked()
      val scanner = enabledAdapter().bluetoothLeScanner
        ?: throw OfflineLinkException("This phone can't scan over Bluetooth LE")
      val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = report(result)
        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach { report(it) }
      }
      scanCallback = callback
      scanner.startScan(
        listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(OFFLINE_SERVICE)).build()),
        ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
        callback,
      )
    }
  }

  private fun report(result: ScanResult) {
    seen[result.device.address] = result.device
    events.nearby(result.device.address, result.rssi)
  }

  fun stopLooking() = synchronized(lock) { stopLookingLocked() }

  private fun stopLookingLocked() {
    val callback = scanCallback ?: return
    try {
      adapter()?.bluetoothLeScanner?.stopScan(callback)
    } catch (ignored: RuntimeException) {
      // Bluetooth turned off or permission revoked.
    }
    scanCallback = null
  }

  /** Connects to a phone seen while looking and reads its offer. The link stays open. */
  fun connectAndReadOffer(deviceId: String): ByteArray {
    stopLooking()
    disconnect()
    val device = seen[deviceId] ?: enabledAdapter().getRemoteDevice(deviceId)
    val link = Client(device)
    client = link
    link.connect()
    return link.read(OFFER_CHAR)
  }

  /** Sends the payment over the open link and waits for the receiver's answer. */
  fun sendPayment(payload: ByteArray): ByteArray {
    val link = client ?: throw OfflineLinkException("Not connected to the other phone")
    if (!link.connected) link.connect()
    val chunk = (link.mtu - 3 - FRAME_HEADER).coerceAtLeast(15)
    val total = (payload.size + chunk - 1) / chunk
    if (total == 0 || total > 0xffff) throw OfflineLinkException("Payment is the wrong size")
    for (index in 0 until total) {
      val part = payload.copyOfRange(index * chunk, minOf(payload.size, (index + 1) * chunk))
      val frame = byteArrayOf(
        FRAME_VERSION,
        (index shr 8).toByte(),
        index.toByte(),
        (total shr 8).toByte(),
        total.toByte(),
      ) + part
      link.write(PAYMENT_CHAR, frame)
    }
    val deadline = System.currentTimeMillis() + RESULT_TIMEOUT_MS
    while (System.currentTimeMillis() < deadline) {
      val answer = link.read(RESULT_CHAR)
      if (answer.isNotEmpty()) return answer
      Thread.sleep(250)
    }
    throw OfflineLinkException("The other phone didn't answer")
  }

  fun disconnect() {
    client?.close()
    client = null
  }

  fun stopAll() {
    stopLooking()
    disconnect()
    stopReceiving()
  }

  /** One GATT client connection, driven one step at a time. */
  private inner class Client(private val device: BluetoothDevice) {
    private var gatt: BluetoothGatt? = null
    @Volatile var connected = false
    @Volatile var mtu = 23
    private var step: CountDownLatch? = null
    private val outcome = AtomicReference<Any?>(null)

    private val callback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
        connected = newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS
        if (connected) {
          if (!g.requestMtu(247)) g.discoverServices()
        } else {
          finish(OfflineLinkException("Lost the connection to the other phone"))
        }
      }

      override fun onMtuChanged(g: BluetoothGatt, newMtu: Int, status: Int) {
        if (status == BluetoothGatt.GATT_SUCCESS) mtu = newMtu
        g.discoverServices()
      }

      override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
        finish(
          if (status == BluetoothGatt.GATT_SUCCESS && g.getService(OFFLINE_SERVICE) != null) {
            true
          } else {
            OfflineLinkException("That phone isn't ready to receive")
          },
        )
      }

      // Android 13 and newer.
      override fun onCharacteristicRead(
        g: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
        status: Int,
      ) {
        finish(if (status == BluetoothGatt.GATT_SUCCESS) value else OfflineLinkException("Read failed"))
      }

      // Android 12 and older.
      @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
      override fun onCharacteristicRead(
        g: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        status: Int,
      ) {
        if (Build.VERSION.SDK_INT >= 33) return
        val value = characteristic.value ?: ByteArray(0)
        finish(if (status == BluetoothGatt.GATT_SUCCESS) value else OfflineLinkException("Read failed"))
      }

      override fun onCharacteristicWrite(
        g: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        status: Int,
      ) {
        finish(if (status == BluetoothGatt.GATT_SUCCESS) true else OfflineLinkException("Send failed"))
      }
    }

    private fun finish(value: Any) {
      outcome.set(value)
      step?.countDown()
    }

    private fun <T> await(start: () -> Boolean): T {
      val latch = CountDownLatch(1)
      outcome.set(null)
      step = latch
      if (!start()) throw OfflineLinkException("Bluetooth is busy. Try again.")
      if (!latch.await(STEP_TIMEOUT_S, TimeUnit.SECONDS)) {
        throw OfflineLinkException("The other phone took too long to answer")
      }
      val value = outcome.get()
      if (value is Throwable) throw value
      @Suppress("UNCHECKED_CAST")
      return value as T
    }

    fun connect() {
      gatt?.close()
      await<Boolean> {
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        gatt != null
      }
    }

    private fun characteristic(id: UUID): BluetoothGattCharacteristic =
      gatt?.getService(OFFLINE_SERVICE)?.getCharacteristic(id)
        ?: throw OfflineLinkException("That phone isn't ready to receive")

    fun read(id: UUID): ByteArray {
      val target = characteristic(id)
      return await { gatt?.readCharacteristic(target) == true }
    }

    @Suppress("DEPRECATION")
    fun write(id: UUID, value: ByteArray) {
      val target = characteristic(id)
      await<Boolean> {
        val g = gatt ?: return@await false
        if (Build.VERSION.SDK_INT >= 33) {
          g.writeCharacteristic(target, value, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) ==
            BluetoothGatt.GATT_SUCCESS
        } else {
          target.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
          target.value = value
          g.writeCharacteristic(target)
        }
      }
    }

    fun close() {
      connected = false
      try {
        gatt?.disconnect()
        gatt?.close()
      } catch (ignored: RuntimeException) {
        // Already gone.
      }
      gatt = null
    }
  }
}

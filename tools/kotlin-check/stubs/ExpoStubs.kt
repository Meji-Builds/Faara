// Compile-only stand-ins mirroring the Expo Modules API signatures used by Faara's modules.
@file:Suppress("unused", "UNUSED_PARAMETER")

package expo.modules.kotlin

import expo.modules.kotlin.exception.CodedException

interface Promise {
  fun resolve(value: Any?)
  fun resolve() = resolve(null)
  fun resolve(result: Int) = resolve(result as Any?)
  fun resolve(result: Boolean) = resolve(result as Any?)
  fun resolve(result: String) = resolve(result as Any?)
  fun resolve(result: Map<String, Any?>) = resolve(result as Any?)
  fun reject(code: String?, message: String?, cause: Throwable?)
  fun reject(exception: CodedException) = reject("E", exception.message, exception)
}

class AppContext {
  val reactContext: android.content.Context? = null
}

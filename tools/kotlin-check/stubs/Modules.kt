@file:Suppress("unused", "UNUSED_PARAMETER", "FunctionName")

package expo.modules.kotlin.modules

import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise

class ModuleDefinitionData

class AsyncFunctionComponent

abstract class Module {
  val appContext: AppContext = AppContext()
  abstract fun definition(): ModuleDefinitionData
  fun sendEvent(name: String, body: Map<String, Any?>) {}
}

class ModuleDefinitionBuilder {
  fun Name(name: String) {}
  fun Events(vararg events: String) {}

  @JvmName("FunctionWithoutArgs")
  inline fun Function(name: String, crossinline body: () -> Any?) {}

  inline fun <reified R> Function(name: String, crossinline body: () -> R) {}
  inline fun <reified R, reified P0> Function(name: String, crossinline body: (p0: P0) -> R) {}

  @JvmName("AsyncFunctionWithoutArgs")
  inline fun AsyncFunction(name: String, crossinline body: () -> Any?): AsyncFunctionComponent =
    AsyncFunctionComponent()

  inline fun <reified R> AsyncFunction(name: String, crossinline body: () -> R): AsyncFunctionComponent =
    AsyncFunctionComponent()

  inline fun <reified R, reified P0> AsyncFunction(name: String, crossinline body: (p0: P0) -> R): AsyncFunctionComponent =
    AsyncFunctionComponent()

  inline fun <reified R, reified P0, reified P1> AsyncFunction(
    name: String,
    crossinline body: (p0: P0, p1: P1) -> R,
  ): AsyncFunctionComponent = AsyncFunctionComponent()

  @JvmName("AsyncFunctionWithPromise")
  inline fun <reified R, reified P0> AsyncFunction(
    name: String,
    crossinline body: (p0: P0, p1: Promise) -> R,
  ): AsyncFunctionComponent = AsyncFunctionComponent()

  inline fun <reified R, reified P0, reified P1, reified P2> AsyncFunction(
    name: String,
    crossinline body: (p0: P0, p1: P1, p2: P2) -> R,
  ): AsyncFunctionComponent = AsyncFunctionComponent()

  @JvmName("AsyncFunctionWithPromise")
  inline fun <reified R, reified P0, reified P1> AsyncFunction(
    name: String,
    crossinline body: (p0: P0, p1: P1, p2: Promise) -> R,
  ): AsyncFunctionComponent = AsyncFunctionComponent()

  inline fun <reified R, reified P0, reified P1, reified P2, reified P3> AsyncFunction(
    name: String,
    crossinline body: (p0: P0, p1: P1, p2: P2, p3: P3) -> R,
  ): AsyncFunctionComponent = AsyncFunctionComponent()

  fun OnDestroy(body: () -> Unit) {}
}

inline fun Module.ModuleDefinition(block: ModuleDefinitionBuilder.() -> Unit): ModuleDefinitionData {
  ModuleDefinitionBuilder().block()
  return ModuleDefinitionData()
}

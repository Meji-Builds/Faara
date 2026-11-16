#!/usr/bin/env bash
# Type-checks the local native modules' Kotlin against the Android framework without the
# Android SDK: compiles them with kotlinc against Robolectric's android-all jar and small
# stand-ins for the Expo Modules API (stubs/). Catches Android API misuse before an EAS build.
#
# Usage: tools/kotlin-check/check.sh   (downloads ~250 MB into .cache/kotlin-check on first run)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="$ROOT/.cache/kotlin-check"
MAVEN="https://repo.maven.apache.org/maven2"
KOTLIN="2.1.21"
mkdir -p "$CACHE/lib"

fetch() {
  local path="$1" file="$CACHE/lib/$(basename "$1")"
  [[ -s "$file" ]] && return
  for attempt in 1 2 3 4; do
    curl -sSfL -o "$file" "$MAVEN/$path" && return
    sleep $((attempt * 5))
  done
  echo "Failed to download $path" >&2
  exit 1
}

fetch "org/jetbrains/kotlin/kotlin-compiler-embeddable/$KOTLIN/kotlin-compiler-embeddable-$KOTLIN.jar"
fetch "org/jetbrains/kotlin/kotlin-stdlib/$KOTLIN/kotlin-stdlib-$KOTLIN.jar"
fetch "org/jetbrains/kotlin/kotlin-script-runtime/$KOTLIN/kotlin-script-runtime-$KOTLIN.jar"
fetch "org/jetbrains/kotlin/kotlin-daemon-embeddable/$KOTLIN/kotlin-daemon-embeddable-$KOTLIN.jar"
fetch "org/jetbrains/kotlin/kotlin-reflect/1.6.10/kotlin-reflect-1.6.10.jar"
fetch "org/jetbrains/intellij/deps/trove4j/1.0.20200330/trove4j-1.0.20200330.jar"
fetch "org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.8.0/kotlinx-coroutines-core-jvm-1.8.0.jar"
fetch "org/jetbrains/annotations/13.0/annotations-13.0.jar"
fetch "org/robolectric/android-all/15-robolectric-14663667/android-all-15-robolectric-14663667.jar"

COMPILER_CP="$(find "$CACHE/lib" -name '*.jar' ! -name 'android-all-*' | tr '\n' ':')"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

mapfile -t SOURCES < <(find "$ROOT/modules" -path '*/android/src/main/*' -name '*.kt')
java -Xmx2g -cp "$COMPILER_CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
  -no-stdlib -no-reflect -jvm-target 17 -d "$OUT" \
  -cp "$CACHE/lib/android-all-15-robolectric-14663667.jar:$CACHE/lib/kotlin-stdlib-$KOTLIN.jar" \
  "$ROOT"/tools/kotlin-check/stubs/*.kt "${SOURCES[@]}"
echo "Kotlin check passed for ${#SOURCES[@]} file(s)."

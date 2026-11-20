// App entry: install polyfills before Expo Router loads any route.
import './src/polyfills';
import './src/crashReporting';
import 'expo-router/entry';

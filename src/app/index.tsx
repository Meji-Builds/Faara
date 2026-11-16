import { Redirect } from 'expo-router';

/**
 * Entry route. Until authentication lands (milestone 2), always start at Welcome.
 */
export default function Index() {
  return <Redirect href="/welcome" />;
}

// Must be the very first import so crypto.getRandomValues is polyfilled globally
import 'react-native-get-random-values';
// Register background task at module load — must happen before any async code
import './src/services/backgroundSync';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

import { registerRootComponent } from 'expo';

import App from './src/App';
// Registers the ride-tracking background task; it has to exist before the app renders
import './src/rides';

registerRootComponent(App);

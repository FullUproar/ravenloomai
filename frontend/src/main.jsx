import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';


import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider
} from '@apollo/client';

// Detect if running in Capacitor native app or emulator
const isNativeApp = window.location.protocol === 'capacitor:' ||
                    window.location.protocol === 'ionic:' ||
                    window.location.hostname === '10.0.2.2'; // Android emulator

// For native app local dev, use emulator's special localhost IP
const apiUri = isNativeApp
  ? 'http://10.0.2.2:4013/graphql' // Native app uses emulator localhost for local dev
  : process.env.NODE_ENV === 'production'
    ? '/api/graphql'  // Web PWA uses relative path
    : 'http://localhost:4013/graphql'; // Web dev uses local backend

// Debug: Log the API URI
console.log('🪶 RavenLoom API URI:', apiUri);
console.log('🪶 Window location:', window.location.href);
console.log('🪶 Is Native App:', isNativeApp);

const client = new ApolloClient({
  uri: apiUri,
  cache: new InMemoryCache({
    typePolicies: {
      Conversation: {
        fields: {
          messages: {
            merge(existing = [], incoming) {
              return incoming; // Replace with new messages
            }
          }
        }
      }
    }
  })
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ApolloProvider client={client}>
        <App apolloClient={client} />
      </ApolloProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for PWA capabilities
// TEMPORARILY DISABLED - uncomment when service worker is needed
/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}
*/

// Unregister any existing service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      console.log('Service worker unregistered');
    }
  });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import InviteAccept from './InviteAccept.jsx';
import './styles.css';

import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  createHttpLink
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Detect if running in Capacitor native app or emulator
const isNativeApp = window.location.protocol === 'capacitor:' ||
                    window.location.protocol === 'ionic:' ||
                    window.location.hostname === '10.0.2.2';

// API URI configuration
const apiUri = isNativeApp
  ? 'http://10.0.2.2:4000/graphql'
  : process.env.NODE_ENV === 'production'
    ? '/api/graphql'
    : 'http://localhost:4000/graphql';

console.log('🪶 RavenLoom API URI:', apiUri);

// HTTP link for GraphQL
const httpLink = createHttpLink({
  uri: apiUri,
});

// Auth link to add user ID header
const authLink = setContext((_, { headers }) => {
  // Get user ID from localStorage (set on login)
  const userId = localStorage.getItem('userId');
  return {
    headers: {
      ...headers,
      'x-user-id': userId || '',
    }
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache({
    typePolicies: {
      Channel: {
        fields: {
          messages: {
            merge(existing = [], incoming) {
              return incoming;
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
        <Routes>
          <Route path="/invite/:token" element={<InviteAccept apolloClient={client} />} />
          <Route path="/team/:teamId/channel/:channelId" element={<App apolloClient={client} />} />
          <Route path="/team/:teamId" element={<App apolloClient={client} />} />
          <Route path="*" element={<App apolloClient={client} />} />
        </Routes>
      </ApolloProvider>
    </BrowserRouter>
  </React.StrictMode>
);

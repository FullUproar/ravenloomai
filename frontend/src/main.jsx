import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';


import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider
} from '@apollo/client';

const client = new ApolloClient({
  uri: process.env.NODE_ENV === 'production'
    ? '/api/graphql'  // Uses same domain in production (Vercel)
    : 'http://localhost:4013/graphql', // Local backend server
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
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  </React.StrictMode>
);

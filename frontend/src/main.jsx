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
    : 'http://localhost:3000/api/graphql', // Vercel dev server
  cache: new InMemoryCache()
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  </React.StrictMode>
);

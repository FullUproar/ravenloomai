import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase authDomain must always be the Firebase-provided domain
// This is where the OAuth callback handlers (/__/auth/*) are hosted
// It works across all domains (localhost, ravenloom.ai, etc.) because
// Firebase handles the redirect internally
const firebaseConfig = {
    apiKey: "AIzaSyBhgspBIOWtsdYCdIidOf7s9t0ZZoSS8LY",
    authDomain: "ravenloom-c964d.firebaseapp.com",
    projectId: "ravenloom-c964d",
    storageBucket: "ravenloom-c964d.firebasestorage.app",
    messagingSenderId: "2999880743",
    appId: "1:2999880743:web:e0fd9569c8c4e2d75d9202",
    measurementId: "G-LW971MJ6CE"
  };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

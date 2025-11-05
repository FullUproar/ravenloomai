import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Determine authDomain based on current host
// For production (ravenloom.ai), use the custom domain
// For localhost, use the Firebase domain (works in incognito mode)
const isProduction = window.location.hostname === 'ravenloom.ai' ||
                     window.location.hostname.includes('vercel.app');
const authDomain = isProduction
  ? 'ravenloom.ai'
  : 'ravenloom-c964d.firebaseapp.com';

console.log('🔥 Firebase authDomain:', authDomain, 'for hostname:', window.location.hostname);

const firebaseConfig = {
    apiKey: "AIzaSyBhgspBIOWtsdYCdIidOf7s9t0ZZoSS8LY",
    authDomain: authDomain,
    projectId: "ravenloom-c964d",
    storageBucket: "ravenloom-c964d.firebasestorage.app",
    messagingSenderId: "2999880743",
    appId: "1:2999880743:web:e0fd9569c8c4e2d75d9202",
    measurementId: "G-LW971MJ6CE"
  };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

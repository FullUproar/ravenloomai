import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyBhgspBIOWtsdYCdIidOf7s9t0ZZoSS8LY",
    authDomain: "ravenloom.ai",
    projectId: "ravenloom-c964d",
    storageBucket: "ravenloom-c964d.firebasestorage.app",
    messagingSenderId: "2999880743",
    appId: "1:2999880743:web:e0fd9569c8c4e2d75d9202",
    measurementId: "G-LW971MJ6CE"
  };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

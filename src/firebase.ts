import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBtsC_4jAhCI7YJd8J-SiTYg9t7WH6Mvm8",
  authDomain: "graphic-pattern-482103-m6.firebaseapp.com",
  projectId: "graphic-pattern-482103-m6",
  storageBucket: "graphic-pattern-482103-m6.firebasestorage.app",
  messagingSenderId: "525030358816",
  appId: "1:525030358816:web:31f20398d053bee7c3a145",
  measurementId: "G-B7XB9K7X2N"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

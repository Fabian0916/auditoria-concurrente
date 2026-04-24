// src/firebase.js
// ⚠️ REEMPLAZA estos valores con los de tu proyecto Firebase
// Los encuentras en: Firebase Console → Tu proyecto → ⚙ Configuración → Tus apps → SDK

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBo0_c8UAmkX-CCgEzW-MN5JwKrjGlaN-4",
  authDomain: "auditoria-concurrente.firebaseapp.com",
  databaseURL: "https://auditoria-concurrente-default-rtdb.firebaseio.com",
  projectId: "auditoria-concurrente",
  storageBucket: "auditoria-concurrente.firebasestorage.app",
  messagingSenderId: "388080781555",
  appId: "1:388080781555:web:c75d60da16552fba510f86"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

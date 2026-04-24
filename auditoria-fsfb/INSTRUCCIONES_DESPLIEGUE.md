# 🚀 Guía de Despliegue — Monitor de Auditoría Concurrente FSFB

## Qué vas a obtener
Una URL pública (ej. `auditoria-fsfb.vercel.app`) que cualquier auditora
puede abrir desde su computador o celular. Los datos se sincronizan en
tiempo real entre todos los dispositivos.

---

## PASO 1 — Crear la base de datos en Firebase (5 min)

1. Ve a https://console.firebase.google.com
2. Inicia sesión con una cuenta Google institucional
3. Clic en **"Crear un proyecto"** → nombre: `auditoria-fsfb` → continuar
4. Desactiva Google Analytics → **Crear proyecto**
5. En el menú izquierdo: **Compilación → Realtime Database**
6. Clic **"Crear base de datos"**
   - Ubicación: `us-central1`
   - Modo: **Iniciar en modo de prueba** → Habilitar
7. En el menú izquierdo: **Configuración del proyecto (⚙)** → pestaña **"Tus apps"**
8. Clic en el ícono `</>` (Web) → nombre: `auditoria-fsfb` → **Registrar app**
9. Copia el bloque `firebaseConfig` que aparece — lo necesitas en el Paso 3

---

## PASO 2 — Subir el código a GitHub (5 min)

1. Ve a https://github.com y crea una cuenta si no tienes
2. Clic en **"New repository"** → nombre: `auditoria-fsfb` → **Create**
3. En tu computador, instala Git si no lo tienes: https://git-scm.com
4. Abre una terminal en la carpeta `auditoria-fsfb` y ejecuta:

```bash
git init
git add .
git commit -m "Monitor auditoría FSFB"
git remote add origin https://github.com/TU_USUARIO/auditoria-fsfb.git
git push -u origin main
```

---

## PASO 3 — Conectar Firebase con el código

Abre el archivo `src/firebase.js` y reemplaza los valores con los de tu
proyecto Firebase copiados en el Paso 1:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",           // ← tu valor real
  authDomain: "auditoria-fsfb.firebaseapp.com",
  databaseURL: "https://auditoria-fsfb-default-rtdb.firebaseio.com",
  projectId: "auditoria-fsfb",
  storageBucket: "auditoria-fsfb.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

Guarda el archivo y vuelve a hacer push:
```bash
git add src/firebase.js
git commit -m "Conectar Firebase"
git push
```

---

## PASO 4 — Publicar en Vercel (5 min)

1. Ve a https://vercel.com → **Sign up with GitHub**
2. Clic en **"Add New Project"**
3. Importa el repositorio `auditoria-fsfb`
4. Configuración automática detecta React → clic **Deploy**
5. En 2 minutos obtienes tu URL, ejemplo:
   **`https://auditoria-fsfb.vercel.app`**

---

## Compartir con las auditoras

Envía la URL por correo o WhatsApp. Cada auditora la abre en su
navegador — no necesita instalar nada ni crear cuenta.

### Roles sugeridos:
- **Auditoras**: Abren la URL y usan el dashboard para registrar
- **Jefe de auditoría**: Abre la misma URL, usa **Exportar Excel**
  para generar el reporte al final del día

---

## Costos
- Firebase: **Gratis** (plan Spark, suficiente para este uso)
- Vercel: **Gratis** (plan Hobby, ilimitado para apps internas)

---

## ¿Necesitas ayuda?
Si en algún paso te quedas atascado, comparte el error con Claude
y te ayudo a resolverlo.

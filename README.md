# autoControl

Control vehicular para México — web + iOS (Capacitor).

## Stack

- **Next.js 16** + Tailwind (UI minimal)
- **Firebase** Auth, Firestore, Storage, Cloud Functions
- **Capacitor** — notificaciones locales, push (FCM), calendario Apple
- **OpenAI** — clasificación y extracción de documentos

## Setup

### 1. Variables de entorno

Copia `.env.local.example` a `.env.local` (ya incluye config de `autos-fa58f`).

### 2. Instalar dependencias

```bash
npm install
cd functions && npm install && cd ..
```

### 3. Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase use autos-fa58f
```

### 4. Desplegar reglas

```bash
firebase deploy --only firestore:rules,storage
```

### 5. Cloud Functions

Configura el secreto de OpenAI (reemplaza el placeholder si ya existe):

```bash
printf 'sk-tu-api-key' | firebase functions:secrets:set OPENAI_API_KEY --force
```

Despliega:

```bash
cd functions && npm run build && cd ..
firebase deploy --only functions
```

### 6. Desarrollo web

```bash
npm run dev
```

### 7. iOS (Capacitor)

```bash
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

## Escaneo de tarjeta de circulación

Al agregar un vehículo puedes subir foto o PDF de la tarjeta de circulación. La Cloud Function `extractVehicleCard` usa PDF parse + OpenAI Vision para llenar placa, marca y estado. Las fechas se capturan manualmente.

## Escaneo de tarjeta de circulación

Al agregar un vehículo puedes subir foto o PDF de la tarjeta de circulación. La Cloud Function `extractVehicleCard` usa PDF parse + OpenAI Vision para llenar placa, marca y estado. Las fechas se capturan manualmente.

## Funcionalidades

- CRUD vehículos con fechas de verificación, tenencia y servicio
- Escaneo de tarjeta de circulación al agregar vehículo
- Escaneo de tarjeta de circulación al agregar vehículo
- Reglas MX (CDMX, Edomex) por terminación de placa
- Subida única de documentos → IA clasifica y extrae datos
- Notificaciones in-app + email Gmail + locales iOS
- Calendario Apple opcional
- Push remoto vía FCM (requiere Apple Developer)

## Estructura

```
src/
  app/           # Next.js pages
  components/    # UI minimal
  config/        # Schemas documentos
  lib/           # Firebase, vehículos, notificaciones
functions/       # Cloud Functions (processDocument, dailyAlerts)
firestore.rules
storage.rules
capacitor.config.ts
```

## Seed reglas MX

Tras login, llama la función callable `seedMxRules` desde la consola Firebase o agrega un botón admin.

# 📱 Plan de Desarrollo: MOVOPos Mobile App (React Native + Expo)

## 🎯 Objetivo
Crear una aplicación móvil nativa para Android (con posibilidad de expandir a iOS) que replique **exactamente** todas las funcionalidades del web app actual, con soporte offline crítico y uso completo de hardware móvil.

---

## 📊 Resumen Ejecutivo

- **Plataforma inicial**: Android
- **Framework**: React Native + Expo (Managed Workflow)
- **Backend**: Mismo backend actual (Next.js API Routes + Prisma)
- **Timeline**: Desarrollo rápido con IA (2-3 meses)
- **Modo offline**: Crítico - sincronización completa
- **Hardware**: Cámara, Bluetooth, códigos de barras, NFC
- **Autenticación**: Clerk + Biometría local

---

## 🏗️ FASE 1: Setup del Proyecto (Semana 1)

### 1.1 Inicialización
- [ ] Crear proyecto Expo con TypeScript: 
px create-expo-app movopos-mobile --template
- [ ] Configurar estructura de carpetas similar al web:
  `
  movopos-mobile/
  ├── app/                  # Expo Router (navegación)
  ├── components/           # Componentes reutilizables
  ├── lib/                  # Utilidades, hooks, servicios
  ├── stores/               # Estado global (Zustand)
  ├── types/                # TypeScript types
  └── assets/               # Imágenes, fuentes
  `

### 1.2 Dependencias Core
`json
{
  "@clerk/clerk-expo": "latest",
  "@react-navigation/native": "^6.x",
  "expo-sqlite": "~13.x",
  "expo-secure-store": "~13.x",
  "expo-camera": "~15.x",
  "expo-barcode-scanner": "~13.x",
  "expo-print": "~13.x",
  "expo-local-authentication": "~14.x",
  "react-native-ble-plx": "^3.x",
  "zustand": "^4.x",
  "axios": "^1.x",
  "date-fns": "^3.x"
}
`

### 1.3 Configuración
- [ ] Configurar Clerk para React Native
- [ ] Setup SQLite local para modo offline
- [ ] Configurar variables de entorno (app.config.js)
- [ ] Configurar permisos en app.json (camera, bluetooth, etc)

---


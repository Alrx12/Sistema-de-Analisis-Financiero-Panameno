# Setup Mac Mini M1 — SAFPRO Mobile

## Lo que el Mac Mini M1 puede y no puede hacer

### ✅ SÍ puede (para tu trabajo)
- Correr **Xcode 16** sin problema — el M1 corre Xcode perfectamente
- **Simulador de iOS** nativo y rápido (mucho más que en Intel)
- **React Native / Expo** con hot reload en segundos
- **Docker** (con imágenes Apple Silicon)
- Compilar el **frontend web** de SAFPRO (npm run build)
- Correr el **backend Python** directamente
- Conectar **2 monitores simultáneamente**:
  - Monitor 1 → puerto HDMI integrado (hasta 4K@60Hz)
  - Monitor 2 → Thunderbolt/USB-C (con adaptador o dock)
- Usar tu **Targus DOCK423A** (ver sección abajo)

### ❌ NO puede
- Correr **3 monitores o más** de forma nativa (límite hardware M1 base)
- Publicar en **App Store sin cuenta Apple Developer** ($99/año — necesitarás crearla cuando estés listo para publicar)
- **Actualizar RAM o SSD** — están soldados, lo que compraste es lo que tendrás siempre
- Correr apps **iOS reales en el simulador** si requieren hardware específico (cámara ARKit avanzada, etc.)

---

## Tu Dock: Targus DOCK423A con Mac Mini M1

### ¿Funciona?
**Sí, pero necesita un paso extra.**

El DOCK423A tiene 2 salidas HDMI desde un solo USB-C. Para lograr esto desde un solo cable, el dock usa tecnología **DisplayLink**. En Apple Silicon (M1) esto requiere instalar el driver.

### Setup del dock (una sola vez)
1. Conectar el dock al puerto Thunderbolt del Mac Mini
2. Descargar **DisplayLink Manager** en: https://www.synaptics.com/products/displaylink-graphics/downloads/macos
3. Instalar y abrir DisplayLink Manager
4. macOS pedirá permiso de "Grabación de pantalla" → ir a **System Settings → Privacy & Security → Screen Recording** → activar DisplayLink Manager
5. Reiniciar DisplayLink Manager
6. Los dos monitores del dock deberían activarse

### Configuración recomendada de monitores
```
Monitor principal   → HDMI directo del Mac Mini  (1 de los 2 Thunderbolt no se usa)
Monitor secundario  → Dock DOCK423A → HDMI 1      (vía Thunderbolt + DisplayLink)
```

**Nota:** El Mac Mini M1 tiene exactamente 2 puertos Thunderbolt. Si conectas el dock en uno, el otro queda libre para cargador de laptop u otros periféricos.

---

## Paso 1: Setup inicial del Mac Mini (día 1)

### Primer arranque
1. Encender el Mac Mini (botón en la parte trasera inferior)
2. Seguir el asistente de configuración (idioma, Apple ID, etc.)
3. **Importante:** Crear cuenta local si no tienes Apple ID aún — puedes agregarlo después

### Instalar herramientas de desarrollo

Abre **Terminal** (Spotlight → busca "Terminal") y ejecuta en orden:

```bash
# 1. Instalar Homebrew (gestor de paquetes para macOS)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Agregar Homebrew al PATH (M1 lo instala en /opt/homebrew)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# 3. Instalar Node.js (versión LTS)
brew install node

# 4. Verificar versiones
node --version   # debe mostrar v20.x o superior
npm --version

# 5. Instalar Git (viene pre-instalado pero Homebrew tiene versión más reciente)
brew install git

# 6. Instalar Python 3 (para el backend de SAFPRO)
brew install python@3.11

# 7. Instalar herramientas Expo
npm install -g expo-cli eas-cli

# 8. Instalar herramientas opcionales pero útiles
brew install --cask visual-studio-code   # VS Code con soporte M1 nativo
brew install --cask iterm2               # Terminal mejorado
```

### Instalar Xcode
1. Abrir **App Store** en el Mac Mini
2. Buscar "Xcode" → Instalar (es grande, ~12GB, paciencia)
3. Una vez instalado, abrir Xcode → aceptar licencia → instalar componentes adicionales
4. Verificar en Terminal: `xcode-select --install`

---

## Paso 2: Clonar SAFPRO y configurar el proyecto mobile

```bash
# Clonar el repositorio
git clone https://github.com/TU_USUARIO/safpro.git
cd safpro

# Instalar dependencias del mobile
cd mobile
npm install

# Copiar el archivo de entorno
cp .env.example .env
# Editar .env si quieres apuntar a tu backend local
# Por defecto ya apunta a https://safpro.us (producción)

# Arrancar Expo en modo desarrollo
npx expo start
```

Cuando Expo esté corriendo, presiona `i` para abrir el **iOS Simulator**.

---

## Paso 3: Probar en simulador de iOS

```bash
# Desde la carpeta mobile/, con Expo corriendo:
# Presionar 'i' → abre iPhone Simulator automáticamente
# Presionar 'a' → abre Android Emulator (necesita Android Studio instalado)

# Para abrir un simulador específico:
npx expo start --ios
```

El simulador de iOS en M1 es ARM nativo — corre mucho más rápido que en Macs Intel.

---

## Paso 4: Cuando estés listo para publicar en App Store

```bash
# 1. Crear cuenta Apple Developer en developer.apple.com ($99/año)

# 2. Crear proyecto en Expo Application Services
eas build:configure

# 3. Actualizar app.json con tu Bundle ID y EAS Project ID

# 4. Build de producción para iOS
eas build --platform ios

# 5. Submit al App Store
eas submit --platform ios
```

---

## Estructura de archivos creada

```
safpro/
├── packages/
│   ├── types/          ← Tipos TypeScript compartidos web+mobile
│   │   ├── package.json
│   │   └── index.ts
│   ├── api/            ← Cliente axios compartido
│   │   ├── package.json
│   │   ├── client.ts   ← Inicialización del cliente (baseURL + token)
│   │   ├── auth.ts
│   │   ├── analysis.ts
│   │   ├── files.ts
│   │   ├── users.ts
│   │   └── index.ts
│   ├── stores/         ← Zustand store compartido
│   │   ├── package.json
│   │   ├── authStore.ts
│   │   └── index.ts
│   └── categories/     ← Categorías de presupuesto compartidas
│       ├── package.json
│       └── index.ts
├── mobile/             ← App React Native + Expo
│   ├── package.json
│   ├── app.json        ← Config Expo (bundle ID, splash, plugins)
│   ├── tsconfig.json
│   ├── babel.config.js
│   ├── tailwind.config.js
│   ├── .env.example
│   └── app/            ← Expo Router (file-based routing)
│       ├── _layout.tsx          ← Root layout (init API, QueryClient)
│       ├── index.tsx            ← Redirect auth/main
│       ├── (auth)/
│       │   ├── _layout.tsx
│       │   ├── login.tsx        ✅ Completo
│       │   ├── register.tsx     🔜 Próximo
│       │   └── forgot-password.tsx 🔜 Próximo
│       └── (tabs)/
│           ├── _layout.tsx      ✅ Tab bar navegación
│           ├── dashboard.tsx    ✅ KPIs + top merchants
│           ├── upload.tsx       ✅ Document picker + polling
│           ├── analysis.tsx     ✅ Lista de snapshots
│           ├── budget.tsx       ✅ 50/30/20
│           └── account.tsx      ✅ Perfil + logout
├── frontend/           ← App web (sin cambios)
└── backend/            ← API FastAPI (sin cambios)
```

---

## Próximas pantallas a implementar (Fase 2)

- `(auth)/register.tsx` — registro de cuenta
- `(auth)/forgot-password.tsx` — recuperar contraseña
- `(tabs)/analysis/[id].tsx` — detalle de un snapshot
- Notificaciones push cuando termina un job (expo-notifications)
- Pantalla de entrenamiento masivo

---

## Preguntas frecuentes sobre el Mac Mini M1

**¿Puedo desarrollar para Android también?**
Sí. Instala Android Studio (versión Apple Silicon), configura un AVD (emulador), y presiona `a` en Expo. Expo Go en dispositivo Android físico también funciona.

**¿El Mac Mini M1 calienta mucho?**
No — el chip M1 es muy eficiente. Con desarrollo normal (Xcode + Simulator + VS Code) el ventilador casi no se escucha.

**¿Puedo usar el Mac Mini para el backend también?**
Sí. Python 3.11 corre nativo en M1. PostgreSQL y Redis tienen versiones Apple Silicon. Podrías replicar el entorno completo de SAFPRO localmente.

**¿Necesito 8GB o 16GB de RAM?**
8GB es suficiente para empezar. Si vas a correr Xcode + Simulator + VS Code + Docker al mismo tiempo, 16GB es más cómodo. Para SAFPRO mobile con el setup que tenemos, 8GB funciona bien.

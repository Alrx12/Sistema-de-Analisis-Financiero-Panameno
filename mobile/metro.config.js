const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname

const config = getDefaultConfig(projectRoot)

// Permitir que Metro vea los paquetes locales
config.watchFolders = [projectRoot]

// Resolver: busca módulos en node_modules del proyecto
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
]

// Extensiones de fuente (incluye .ts/.tsx para paquetes locales sin compilar)
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  "ts",
  "tsx",
]

// NativeWind desactivado — ningún componente usa className=
// Para reactivar: npm i nativewind && envolver con withNativeWind
module.exports = config

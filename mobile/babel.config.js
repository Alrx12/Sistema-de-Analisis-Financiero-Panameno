module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      // NativeWind v4 — se configura aquí, no como plugin separado
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: [
      // Reanimated siempre debe ir último
      "react-native-reanimated/plugin",
    ],
  }
}

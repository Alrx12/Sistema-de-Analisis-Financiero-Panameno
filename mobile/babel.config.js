module.exports = function (api) {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // NativeWind — Tailwind para React Native
      "nativewind/babel",
      // Reanimated siempre debe ir último
      "react-native-reanimated/plugin",
    ],
  }
}

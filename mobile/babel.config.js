module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      // NativeWind v4 — se configura aquí, no como plugin separado
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: [
      // Resuelve @safpro/* a los módulos locales en ./packages/
      // Esto elimina la necesidad de dependencias file: en package.json
      [
        "module-resolver",
        {
          root: ["./"],
          extensions: [".ts", ".tsx", ".js", ".jsx"],
          alias: {
            "@safpro/api": "./packages/api",
            "@safpro/types": "./packages/types",
            "@safpro/stores": "./packages/stores",
            "@safpro/categories": "./packages/categories",
          },
        },
      ],
      // Reanimated siempre debe ir último
      "react-native-reanimated/plugin",
    ],
  }
}

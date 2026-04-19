module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      // babel-preset-expo sin jsxImportSource de NativeWind
      // (NativeWind no se usa activamente en ningún componente —
      //  si en el futuro se usa, descomentar jsxImportSource: "nativewind")
      "babel-preset-expo",
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
      // react-native-reanimated/plugin va aquí si se reintegra Reanimated
    ],
  }
}

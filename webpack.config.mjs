import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commonConfig = {
  entry: {
    index: "./src/index.ts",
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  externals: {
    "node:events": "commonjs events",
    "node:crypto": "commonjs crypto",
    "async_hooks": "commonjs async_hooks",
  },
  mode: "none",
};

const esmConfig = {
  ...commonConfig,
  output: {
    path: resolve(__dirname, "dist"),
    filename: "index.esm.js",
    libraryTarget: "module",
  },
  experiments: {
    outputModule: true,
  },
};

const cjsConfig = {
  ...commonConfig,
  output: {
    path: resolve(__dirname, "dist"),
    filename: "index.cjs.js",
    libraryTarget: "commonjs2",
  },
  mode: "none",
};

export default [esmConfig, cjsConfig];

import { resolve } from 'path'
import eslint from 'vite-plugin-eslint';
import { defineConfig } from 'vite';



export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/angular-websocket.js'),
            name: 'angular-websocket.js',
            formats: ["umd"],

        },
        minify: false,
        cssMinify: false,
        target: "es6",
        rollupOptions: {
            external: [
                "angular"
            ],
            output: {
                entryFileNames: "[name].js",
                globals: {
                    angular: "angular"
                }
            }
        }
    },
    plugins: [
        eslint({
            exclude: ['**/node_modules/**', 'dist/**']
        }
        )
    ]
})
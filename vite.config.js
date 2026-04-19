import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

export default {
    plugins: [viteSingleFile()],
    server: {
        watch: {
            usePolling: true,
        },
    },
}

import esbuild from 'esbuild'

export async function bundleBrowserApp(): Promise<string> {
    const result = await esbuild.build({
        entryPoints: ['src/web/entry.ts'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        sourcemap: false,
        target: ['es2020'],
    })

    const js = result.outputFiles?.[0]?.text
    if (!js) throw new Error('Failed to bundle browser app')
    return js
}

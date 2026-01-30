import { glob } from 'glob'

export async function discoverManifests(rootDir: string): Promise<string[]> {
    const normalizedRoot = rootDir.replace(/\\/g, '/')

    const patterns = [
        `${normalizedRoot}/**/architecture.json`,
        `${normalizedRoot}/**/*.architecture.json`, // TODO: Don't know if I want to keep that one long term...
    ]

    const files = await glob(patterns, {
        nodir: true,
        dot: false,
        ignore: ['**/node_modules/**', '**/dist/**'],
    })

    return files.sort()
}

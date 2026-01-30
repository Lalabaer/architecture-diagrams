import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function readJsonFile<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
}

export async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true })
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
    await ensureDir(path.dirname(filePath))
    await writeFile(filePath, content, 'utf-8')
}

import { readFile } from 'node:fs/promises'

import type { Manifest } from '../graph/types.js'
import { validateManifest } from '../validate/validateManifest.js'

export function isEmptyManifestFileContent(raw: string): boolean {
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
        return true
    }

    try {
        const parsed: unknown = JSON.parse(trimmed)
        return (
            typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length === 0
        )
    } catch {
        return false
    }
}

export type LoadManifestOutcome =
    | { status: 'ok'; manifest: Manifest }
    | { status: 'empty' }
    | { status: 'error'; error: string }

export async function loadManifest(filePath: string): Promise<LoadManifestOutcome> {
    let raw: string

    try {
        raw = await readFile(filePath, 'utf-8')
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { status: 'error', error: message }
    }

    if (isEmptyManifestFileContent(raw)) {
        return { status: 'empty' }
    }

    let parsed: unknown

    try {
        parsed = JSON.parse(raw)
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { status: 'error', error: `Invalid JSON: ${message}` }
    }

    const validation = await validateManifest(parsed)
    if (!validation.ok) {
        return { status: 'error', error: validation.error }
    }

    return { status: 'ok', manifest: validation.manifest }
}

export type LoadManifestsResult = {
    manifests: Manifest[]
    skippedEmpty: string[]
    failed: Array<{ file: string; error: string }>
}

export async function loadManifests(files: string[]): Promise<LoadManifestsResult> {
    const manifests: Manifest[] = []
    const skippedEmpty: string[] = []
    const failed: Array<{ file: string; error: string }> = []

    for (const file of files) {
        const outcome = await loadManifest(file)

        if (outcome.status === 'ok') {
            manifests.push(outcome.manifest)
        } else if (outcome.status === 'empty') {
            skippedEmpty.push(file)
        } else {
            failed.push({ file, error: outcome.error })
        }
    }

    return { manifests, skippedEmpty, failed }
}

export async function loadAndValidateManifest(filePath: string): Promise<Manifest> {
    const outcome = await loadManifest(filePath)

    if (outcome.status === 'empty') {
        throw new Error(`Manifest file is empty: ${filePath}`)
    }

    if (outcome.status === 'error') {
        throw new Error(`Failed to load ${filePath}:\n${outcome.error}`)
    }

    return outcome.manifest
}

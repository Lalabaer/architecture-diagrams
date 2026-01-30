import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = path.resolve('examples', 'basic')

function manifest(entity, dependencies = []) {
    const m = { schema_version: '1.0', entity }

    if (dependencies.length) {
        m.dependencies = dependencies
    }

    return m
}

function dep(kind, id, relationship, purpose, extra = {}) {
    const d = { target: { kind, id }, ...extra }

    if (relationship) {
        d.relationship = relationship
    }
    if (purpose) {
        d.purpose = purpose
    }

    return d
}

async function writeJson(filename, obj) {
    const fullPath = path.join(OUT_DIR, filename)
    const json = JSON.stringify(obj, null, 2) + '\n'
    await writeFile(fullPath, json, 'utf-8')
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true })

    // 01) Minimal system
    await writeJson(
        '01-minimal.architecture.json',
        manifest({
            id: 'example-minimal-system',
            kind: 'system',
            name: 'Example Minimal System',
            owner_team: 'platform',
        }),
    )

    // 02) System + datastore
    await writeJson(
        '02-playlist-service-with-db.architecture.json',
        manifest(
            {
                id: 'playlist-service',
                kind: 'system',
                name: 'Playlist Service',
                owner_team: 'music-platform',
                business_critical: true,
            },
            [
                dep('datastore', 'playlist-db', 'data_write', 'Persist playlists'),
                dep('datastore', 'playlist-db', 'data_read', 'Load playlists'),
            ],
        ),
    )

    // Also define the datastore itself as a manifest so it appears as a node too
    await writeJson(
        '02-playlist-db.architecture.json',
        manifest({
            id: 'playlist-db',
            kind: 'datastore',
            name: 'Playlist DB',
            owner_team: 'music-platform',
        }),
    )

    // 03) System -> System (sync call)
    await writeJson(
        '03-playback-service-to-catalog.architecture.json',
        manifest(
            {
                id: 'playback-service',
                kind: 'system',
                name: 'Playback Service',
                owner_team: 'player',
                business_critical: true,
            },
            [
                dep('system', 'catalog-service', 'sync_call', 'Fetch track metadata for playback'),
                dep('system', 'auth-service', 'sync_call', 'Validate user session/token'),
            ],
        ),
    )

    // define catalog + auth systems (so architecture view has nice complete nodes)
    await writeJson(
        '03-catalog-service.architecture.json',
        manifest(
            {
                id: 'catalog-service',
                kind: 'system',
                name: 'Catalog Service',
                owner_team: 'music-platform',
                business_critical: true,
            },
            [dep('datastore', 'catalog-db', 'data_read', 'Fetch track/album metadata')],
        ),
    )

    await writeJson(
        '03-catalog-db.architecture.json',
        manifest({
            id: 'catalog-db',
            kind: 'datastore',
            name: 'Catalog DB',
            owner_team: 'music-platform',
        }),
    )

    await writeJson(
        '03-auth-service.architecture.json',
        manifest(
            {
                id: 'auth-service',
                kind: 'system',
                name: 'Auth Service',
                owner_team: 'identity',
                business_critical: true,
            },
            [
                dep('datastore', 'user-db', 'data_read', 'Read users/sessions'),
                dep('datastore', 'user-db', 'data_write', 'Write sessions/refresh tokens'),
            ],
        ),
    )

    await writeJson(
        '03-user-db.architecture.json',
        manifest({
            id: 'user-db',
            kind: 'datastore',
            name: 'User DB',
            owner_team: 'identity',
        }),
    )

    // 04) Library
    await writeJson(
        '04-client-sdk-library.architecture.json',
        manifest({
            id: 'client-sdk',
            kind: 'library',
            name: 'Client SDK',
            owner_team: 'developer-platform',
        }),
    )

    // 05) Tool
    await writeJson(
        '05-ci-tool.architecture.json',
        manifest(
            {
                id: 'release-tooling',
                kind: 'tool',
                name: 'Release Tooling',
                owner_team: 'developer-platform',
            },
            [dep('library', 'client-sdk', 'compile_time', 'Uses SDK types/helpers during build')],
        ),
    )

    // 06) Async event example
    await writeJson(
        '06-listening-events-consumer.architecture.json',
        manifest(
            {
                id: 'listening-events-consumer',
                kind: 'system',
                name: 'Listening Events Consumer',
                owner_team: 'data-platform',
            },
            [
                dep('datastore', 'event-stream', 'data_read', 'Consumes play events from event stream', {
                    sla_impact: 'AFTER_30_MIN',
                    critical: true,
                }),
            ],
        ),
    )

    await writeJson(
        '06-event-stream.architecture.json',
        manifest({
            id: 'event-stream',
            kind: 'datastore',
            name: 'Event Stream',
            owner_team: 'platform',
        }),
    )

    // 07) Regions example
    await writeJson(
        '07-search-service-regions.architecture.json',
        manifest(
            {
                id: 'search-service',
                kind: 'system',
                name: 'Search Service',
                owner_team: 'discovery',
                regions: ['EU', 'US'],
            },
            [dep('datastore', 'search-index', 'data_read', 'Query indexed catalog data', { regions: ['EU', 'US'] })],
        ),
    )

    await writeJson(
        '07-search-index.architecture.json',
        manifest({
            id: 'search-index',
            kind: 'datastore',
            name: 'Search Index',
            owner_team: 'discovery',
            regions: ['EU', 'US'],
        }),
    )

    // 08) SLA / critical rule example (IMMEDIATE => critical true)
    await writeJson(
        '08-recommendations-service-critical.architecture.json',
        manifest(
            {
                id: 'recommendations-service',
                kind: 'system',
                name: 'Recommendations Service',
                owner_team: 'personalization',
                business_critical: true,
            },
            [
                dep('datastore', 'features-store', 'data_read', 'Reads user features for real-time recs', {
                    sla_impact: 'IMMEDIATE',
                    critical: true,
                }),
            ],
        ),
    )

    await writeJson(
        '08-features-store.architecture.json',
        manifest({
            id: 'features-store',
            kind: 'datastore',
            name: 'Features Store',
            owner_team: 'data-platform',
        }),
    )

    console.log(`Wrote basic examples to: ${OUT_DIR}`)
    console.log(`Run: yarn dev --input examples/basic --output dist/output`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})

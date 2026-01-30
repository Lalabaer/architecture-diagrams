import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = path.resolve('examples', 'url-shortener')

function manifest(entity, dependencies = []) {
    const m = {
        schema_version: '1.0',
        entity,
    }

    if (dependencies.length) {
        m.dependencies = dependencies
    }

    return m
}

function dep(kind, id, relationship, purpose) {
    const d = { target: { kind, id } }

    if (relationship) {
        d.relationship = relationship
    }

    if (purpose) {
        d.purpose = purpose
    }

    return d
}

const files = {
    // ---------------------------
    // DATASTORES (appear in architecture view)
    // ---------------------------
    '00-user-db.architecture.json': manifest({
        id: 'user-db',
        kind: 'datastore',
        name: 'User DB',
        owner_team: 'identity',
    }),
    '00-links-db.architecture.json': manifest({
        id: 'links-db',
        kind: 'datastore',
        name: 'Links DB',
        owner_team: 'core-url',
    }),
    '00-redis-cache.architecture.json': manifest({
        id: 'redis-cache',
        kind: 'datastore',
        name: 'Redis Cache',
        owner_team: 'platform-engineering',
    }),
    '00-event-stream.architecture.json': manifest({
        id: 'event-stream',
        kind: 'datastore',
        name: 'Event Stream',
        owner_team: 'platform-engineering',
    }),
    '00-clickhouse-analytics.architecture.json': manifest({
        id: 'clickhouse-analytics',
        kind: 'datastore',
        name: 'ClickHouse Analytics',
        owner_team: 'data-platform',
    }),
    '00-billing-db.architecture.json': manifest({
        id: 'billing-db',
        kind: 'datastore',
        name: 'Billing DB',
        owner_team: 'billing',
    }),
    '00-config-store.architecture.json': manifest({
        id: 'config-store',
        kind: 'datastore',
        name: 'Config Store',
        owner_team: 'platform-engineering',
    }),

    // ---------------------------
    // SYSTEMS (20 total)
    // ---------------------------

    // 01: entry points
    '01-api-gateway.architecture.json': manifest(
        {
            id: 'api-gateway',
            kind: 'system',
            name: 'API Gateway',
            owner_team: 'platform-edge',
            business_critical: true,
        },
        [
            dep('system', 'auth-service', 'sync_call', 'Authenticate API requests'),
            dep('system', 'rate-limiter', 'sync_call', 'Apply rate limits'),
            dep('system', 'link-create-service', 'sync_call', 'Create short URLs'),
            dep('system', 'analytics-api', 'sync_call', 'Expose analytics endpoints'),
            dep('system', 'admin-portal', 'sync_call', 'Admin endpoints'),
        ],
    ),

    '02-web-frontend.architecture.json': manifest(
        { id: 'web-frontend', kind: 'system', name: 'Web Frontend', owner_team: 'growth', business_critical: true },
        [dep('system', 'api-gateway', 'sync_call', 'Calls backend APIs')],
    ),

    // 03-05: identity + limits
    '03-auth-service.architecture.json': manifest(
        { id: 'auth-service', kind: 'system', name: 'Auth Service', owner_team: 'identity', business_critical: true },
        [
            dep('datastore', 'user-db', 'data_read', 'Fetch user credentials / sessions'),
            dep('datastore', 'redis-cache', 'data_write', 'Store session tokens / cache'),
        ],
    ),

    '04-user-service.architecture.json': manifest(
        { id: 'user-service', kind: 'system', name: 'User Service', owner_team: 'identity', business_critical: true },
        [
            dep('datastore', 'user-db', 'data_read', 'Read user profile'),
            dep('datastore', 'user-db', 'data_write', 'Update user profile'),
            dep('system', 'event-publisher', 'async_event', 'Publish user lifecycle events'),
        ],
    ),

    '05-rate-limiter.architecture.json': manifest(
        {
            id: 'rate-limiter',
            kind: 'system',
            name: 'Rate Limiter',
            owner_team: 'platform-edge',
            business_critical: true,
        },
        [
            dep('datastore', 'redis-cache', 'data_read', 'Read counters'),
            dep('datastore', 'redis-cache', 'data_write', 'Update counters'),
            dep('system', 'config-service', 'sync_call', 'Fetch rate-limit rules'),
        ],
    ),

    // 06-09: core URL flows
    '06-link-create-service.architecture.json': manifest(
        {
            id: 'link-create-service',
            kind: 'system',
            name: 'Link Create Service',
            owner_team: 'core-url',
            business_critical: true,
        },
        [
            dep('system', 'auth-service', 'sync_call', 'Authorize link creation'),
            dep('system', 'plan-service', 'sync_call', 'Check plan limits'),
            dep('system', 'abuse-detection-service', 'sync_call', 'Block malicious URLs'),
            dep('datastore', 'links-db', 'data_write', 'Persist short link'),
            dep('datastore', 'redis-cache', 'data_write', 'Warm cache for hot links'),
            dep('system', 'event-publisher', 'async_event', 'Emit link_created event'),
        ],
    ),

    '07-redirect-service.architecture.json': manifest(
        {
            id: 'redirect-service',
            kind: 'system',
            name: 'Redirect Service',
            owner_team: 'core-url',
            business_critical: true,
        },
        [
            dep('system', 'link-resolver', 'sync_call', 'Resolve code to destination'),
            dep('system', 'click-ingestor', 'async_event', 'Emit click events'),
            dep('system', 'rate-limiter', 'sync_call', 'Protect redirect endpoint'),
        ],
    ),

    '08-link-resolver.architecture.json': manifest(
        { id: 'link-resolver', kind: 'system', name: 'Link Resolver', owner_team: 'core-url', business_critical: true },
        [
            dep('datastore', 'redis-cache', 'data_read', 'Try cache first'),
            dep('datastore', 'links-db', 'data_read', 'Fallback to DB'),
            dep('system', 'abuse-detection-service', 'sync_call', 'Check link status / blocks'),
        ],
    ),

    '09-link-management-service.architecture.json': manifest(
        {
            id: 'link-management-service',
            kind: 'system',
            name: 'Link Management Service',
            owner_team: 'core-url',
            business_critical: true,
        },
        [
            dep('system', 'auth-service', 'sync_call', 'Authorize link management'),
            dep('datastore', 'links-db', 'data_read', 'List links'),
            dep('datastore', 'links-db', 'data_write', 'Update links'),
            dep('system', 'event-publisher', 'async_event', 'Emit link_updated/link_deleted events'),
        ],
    ),

    // 10-12: abuse / moderation
    '10-abuse-detection-service.architecture.json': manifest(
        {
            id: 'abuse-detection-service',
            kind: 'system',
            name: 'Abuse Detection',
            owner_team: 'trust-safety',
            business_critical: true,
        },
        [
            dep('system', 'config-service', 'sync_call', 'Fetch blocklists and rules'),
            dep('datastore', 'redis-cache', 'data_read', 'Cache reputation results'),
            dep('datastore', 'redis-cache', 'data_write', 'Write reputation cache'),
            dep('system', 'moderation-service', 'async_event', 'Request async deep moderation'),
        ],
    ),

    '11-moderation-service.architecture.json': manifest(
        { id: 'moderation-service', kind: 'system', name: 'Moderation Service', owner_team: 'trust-safety' },
        [
            dep('datastore', 'event-stream', 'data_read', 'Consume moderation requests'),
            dep('system', 'event-publisher', 'async_event', 'Emit moderation results'),
        ],
    ),

    '12-admin-portal.architecture.json': manifest(
        { id: 'admin-portal', kind: 'system', name: 'Admin Portal', owner_team: 'trust-safety' },
        [
            dep('system', 'api-gateway', 'sync_call', 'Admin APIs'),
            dep('system', 'link-management-service', 'sync_call', 'Manage links'),
            dep('system', 'user-service', 'sync_call', 'Manage users'),
            dep('system', 'reporting-service', 'sync_call', 'Generate reports'),
        ],
    ),

    // 13-16: events + analytics
    '13-click-ingestor.architecture.json': manifest(
        {
            id: 'click-ingestor',
            kind: 'system',
            name: 'Click Ingestor',
            owner_team: 'data-platform',
            business_critical: true,
        },
        [
            dep('datastore', 'event-stream', 'data_write', 'Publish click events'),
            dep('system', 'metrics-collector', 'async_event', 'Emit ingest metrics'),
        ],
    ),

    '14-stream-processor.architecture.json': manifest(
        {
            id: 'stream-processor',
            kind: 'system',
            name: 'Stream Processor',
            owner_team: 'data-platform',
            business_critical: true,
        },
        [
            dep('datastore', 'event-stream', 'data_read', 'Consume click/link/user events'),
            dep('datastore', 'clickhouse-analytics', 'data_write', 'Write aggregated metrics'),
            dep('system', 'notifications-service', 'async_event', 'Trigger alerts for anomalies'),
        ],
    ),

    '15-analytics-api.architecture.json': manifest(
        {
            id: 'analytics-api',
            kind: 'system',
            name: 'Analytics API',
            owner_team: 'data-platform',
            business_critical: true,
        },
        [
            dep('system', 'auth-service', 'sync_call', 'Authorize analytics access'),
            dep('datastore', 'clickhouse-analytics', 'data_read', 'Query analytics'),
            dep('system', 'reporting-service', 'sync_call', 'Export reports'),
        ],
    ),

    '16-reporting-service.architecture.json': manifest(
        { id: 'reporting-service', kind: 'system', name: 'Reporting Service', owner_team: 'data-platform' },
        [
            dep('datastore', 'clickhouse-analytics', 'data_read', 'Read analytics for reports'),
            dep('system', 'notifications-service', 'async_event', 'Send report notifications'),
        ],
    ),

    // 17-20: billing + config + ops
    '17-billing-service.architecture.json': manifest(
        {
            id: 'billing-service',
            kind: 'system',
            name: 'Billing Service',
            owner_team: 'billing',
            business_critical: true,
        },
        [
            dep('datastore', 'billing-db', 'data_read', 'Read invoices/subscriptions'),
            dep('datastore', 'billing-db', 'data_write', 'Write invoices/subscriptions'),
            dep('system', 'plan-service', 'sync_call', 'Apply plan changes'),
            dep('system', 'event-publisher', 'async_event', 'Emit billing events'),
        ],
    ),

    '18-plan-service.architecture.json': manifest(
        { id: 'plan-service', kind: 'system', name: 'Plan Service', owner_team: 'billing', business_critical: true },
        [
            dep('datastore', 'billing-db', 'data_read', 'Read plan limits'),
            dep('system', 'config-service', 'sync_call', 'Fetch plan config overrides'),
        ],
    ),

    '19-config-service.architecture.json': manifest(
        {
            id: 'config-service',
            kind: 'system',
            name: 'Config Service',
            owner_team: 'platform-engineering',
            business_critical: true,
        },
        [
            dep('datastore', 'config-store', 'data_read', 'Load configuration'),
            dep('datastore', 'config-store', 'data_write', 'Update configuration'),
            dep('system', 'event-publisher', 'async_event', 'Emit config_changed events'),
        ],
    ),

    '20-notifications-service.architecture.json': manifest(
        {
            id: 'notifications-service',
            kind: 'system',
            name: 'Notifications Service',
            owner_team: 'platform-communications',
        },
        [
            dep('datastore', 'event-stream', 'data_read', 'Consume notification events'),
            dep('system', 'metrics-collector', 'async_event', 'Emit delivery metrics'),
        ],
    ),

    // Helper “system” for publishing events (kept as system so it appears in architecture view if you want)
    '21-event-publisher.architecture.json': manifest(
        {
            id: 'event-publisher',
            kind: 'system',
            name: 'Event Publisher',
            owner_team: 'platform-engineering',
            business_critical: true,
        },
        [dep('datastore', 'event-stream', 'data_write', 'Publish domain events')],
    ),

    '22-metrics-collector.architecture.json': manifest(
        { id: 'metrics-collector', kind: 'system', name: 'Metrics Collector', owner_team: 'platform-observability' },
        [dep('datastore', 'clickhouse-analytics', 'data_write', 'Store metrics for analysis')],
    ),
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true })

    const names = Object.keys(files).sort()
    for (const name of names) {
        const fullPath = path.join(OUT_DIR, name)
        const json = JSON.stringify(files[name], null, 2) + '\n'
        await writeFile(fullPath, json, 'utf-8')
    }

    console.log(`Wrote ${names.length} example manifests to ${OUT_DIR}`)
    console.log('Run: yarn dev --input examples/url-shortener --output dist/output')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})

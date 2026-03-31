Analyze this target project's performance and identify 1-3 optimization opportunities ranked by expected impact. For each, provide a detailed root-cause analysis with evidence (code snippets + line references, not full files), theory, proposed fixes, and expected impact.

## Current Performance (Experiment 1)
- p95 Latency: 1013.880795ms
- Requests/sec: 114.9
- Error rate: 0%
- Improvement vs baseline: 0%

## Baseline Performance
- p95 Latency: 1013.880795ms
- Requests/sec: 114.9
- Error rate: 0%


## Traffic Distribution (k6 Scenario)
The following k6 load test scenario defines the request patterns and relative weights of each
endpoint. Use this to estimate what percentage of total traffic each endpoint/code path receives.

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ADMIN_USER = 'admin@microsoft.com';
const ADMIN_PASS = 'Pass@word1';

// Deterministic ID generator (same VU + iteration = same IDs across runs)
function seededId(salt, max) {
    return (((__VU * 997 + __ITER * 8191 + salt * 127) * 2654435761) >>> 0) % max + 1;
}

export const options = {
    stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 30 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.05'],
    },
};

// Authenticate once at test start and share token across VUs
export function setup() {
    const authRes = http.post(`${BASE_URL}/api/authenticate`, JSON.stringify({
        username: ADMIN_USER,
        password: ADMIN_PASS,
    }), { headers: { 'Content-Type': 'application/json' } });

    check(authRes, { 'auth 200': (r) => r.status === 200 });
    return { token: JSON.parse(authRes.body).token };
}

export default function (data) {
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
        },
    };

    // ── Read operations (4 requests) ────────────────────────────────────

    // Browse catalog (paginated — deterministic page)
    const pageIndex = seededId(1, 2) - 1;
    const catalogPage = http.get(
        `${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=${pageIndex}`
    );
    check(catalogPage, {
        'catalog list 200': (r) => r.status === 200,
        'catalog has items': (r) => JSON.parse(r.body).catalogItems.length > 0,
    });

    // Get a specific item (deterministic ID from seed data)
    const itemId = seededId(2, 12);
    const itemResponse = http.get(`${BASE_URL}/api/catalog-items/${itemId}`);
    check(itemResponse, { 'item detail 200': (r) => r.status === 200 });

    // Browse brands
    const brandsResponse = http.get(`${BASE_URL}/api/catalog-brands`);
    check(brandsResponse, { 'brands 200': (r) => r.status === 200 });

    // Browse types
    const typesResponse = http.get(`${BASE_URL}/api/catalog-types`);
    check(typesResponse, { 'types 200': (r) => r.status === 200 });

    // Health check (validates API liveness under load)
    const healthResponse = http.get(`${BASE_URL}/health`);
    check(healthResponse, { 'health 200': (r) => r.status === 200 });

    // ── Write operations (2 requests — DB resets between measured runs) ──

    // Update an existing item (PUT — idempotent)
    const updateId = seededId(3, 12);
    const updatePayload = JSON.stringify({
        id: updateId,
        catalogBrandId: seededId(4, 5),
        catalogTypeId: seededId(5, 4),
        description: `Updated by k6 VU${__VU} iter${__ITER}`,
        name: `.NET Bot Black Sweatshirt`,
        price: 10 + seededId(6, 90),
    });
    const updateRes = http.put(`${BASE_URL}/api/catalog-items`, updatePayload, authHeaders);
    check(updateRes, { 'update 200': (r) => r.status === 200 });

    // Create a new item (POST — safe because DB resets between runs)
    const createName = `k6-item-${__VU}-${__ITER}`;
    const createPayload = JSON.stringify({
        catalogBrandId: seededId(7, 5),
        catalogTypeId: seededId(8, 4),
        description: `Load test item VU${__VU}`,
        name: createName,
        price: 5 + seededId(9, 95),
    });
    const createRes = http.post(`${BASE_URL}/api/catalog-items`, createPayload, authHeaders);
    check(createRes, { 'create 201': (r) => r.status === 201 });

    sleep(0.5);
}

```



## Source Files
The following source files are available for analysis (paths relative to the eShopOnWeb-Honed root).
Read the files that are relevant to identifying performance bottlenecks.



Respond with JSON only. No markdown, no code blocks around the JSON.

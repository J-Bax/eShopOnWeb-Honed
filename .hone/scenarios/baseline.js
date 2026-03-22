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

    const body = JSON.parse(authRes.body);
    return { token: body.token };
}

export default function (data) {
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
        },
    };
    const readHeaders = { headers: { 'Content-Type': 'application/json' } };

    // ── Read operations (70% of traffic weight via 4 requests) ──────────

    // Browse catalog (paginated)
    const pageIndex = seededId(1, 2) - 1;
    const catalogPage = http.get(
        `${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=${pageIndex}`,
        readHeaders
    );
    check(catalogPage, {
        'catalog list 200': (r) => r.status === 200,
        'catalog has items': (r) => JSON.parse(r.body).catalogItems.length > 0,
    });

    // Get a specific item
    const itemId = seededId(2, 12);
    const itemResponse = http.get(`${BASE_URL}/api/catalog-items/${itemId}`, readHeaders);
    check(itemResponse, { 'item detail 200': (r) => r.status === 200 });

    // Browse brands
    const brandsResponse = http.get(`${BASE_URL}/api/catalog-brands`, readHeaders);
    check(brandsResponse, { 'brands 200': (r) => r.status === 200 });

    // Browse types
    const typesResponse = http.get(`${BASE_URL}/api/catalog-types`, readHeaders);
    check(typesResponse, { 'types 200': (r) => r.status === 200 });

    // ── Write operations (idempotent — safe across multiple measured runs) ──

    // Update an existing item (PUT)
    const updateId = seededId(3, 12);
    const updatePayload = JSON.stringify({
        id: updateId,
        catalogBrandId: seededId(4, 5),
        catalogTypeId: seededId(5, 4),
        description: `Updated by k6 VU${__VU} iter${__ITER}`,
        name: `.NET Bot Black Sweatshirt`,
        price: 10 + (seededId(6, 90)),
    });
    const updateResponse = http.put(`${BASE_URL}/api/catalog-items`, updatePayload, authHeaders);
    check(updateResponse, { 'update 200': (r) => r.status === 200 });

    // Update a second item (PUT) — more write coverage without accumulation
    const updateId2 = seededId(7, 12);
    const updatePayload2 = JSON.stringify({
        id: updateId2,
        catalogBrandId: seededId(8, 5),
        catalogTypeId: seededId(9, 4),
        description: `Updated2 by k6 VU${__VU} iter${__ITER}`,
        name: `.NET Foundation Sweatshirt`,
        price: 5 + (seededId(10, 95)),
    });
    const updateResponse2 = http.put(`${BASE_URL}/api/catalog-items`, updatePayload2, authHeaders);
    check(updateResponse2, { 'update2 200': (r) => r.status === 200 });

    sleep(0.5);
}

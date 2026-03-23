import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

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

export default function () {
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

    sleep(0.5);
}

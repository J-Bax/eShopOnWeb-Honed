import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ADMIN_USER = 'admin@microsoft.com';
const ADMIN_PASS = 'Pass@word1';

// Deterministic ID generator for stable reads/updates against seeded catalog rows
function seededId(salt, max) {
    return (((__VU * 997 + __ITER * 8191 + salt * 127) * 2654435761) >>> 0) % max + 1;
}

function uniqueName(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${__VU}-${__ITER}`;
}

export const options = {
    stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '15s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.10'],
    },
};

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

    // Fixed endpoint sequence — every VU hits all endpoints in the same order

    // 1. Catalog list (paginated)
    const pageIndex = seededId(1, 2) - 1;
    const catalogRes = http.get(
        `${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=${pageIndex}`,
        readHeaders
    );
    check(catalogRes, { 'catalog 200': (r) => r.status === 200 });

    // 2. Item detail
    const itemId = seededId(2, 12);
    const itemRes = http.get(`${BASE_URL}/api/catalog-items/${itemId}`, readHeaders);
    check(itemRes, { 'item 200': (r) => r.status === 200 });

    // 3. Brands
    const brandsRes = http.get(`${BASE_URL}/api/catalog-brands`, readHeaders);
    check(brandsRes, { 'brands 200': (r) => r.status === 200 });

    // 4. Types
    const typesRes = http.get(`${BASE_URL}/api/catalog-types`, readHeaders);
    check(typesRes, { 'types 200': (r) => r.status === 200 });

    // 5. Update item (PUT)
    const updateId = seededId(3, 12);
    const updatePayload = JSON.stringify({
        id: updateId,
        catalogBrandId: seededId(4, 5),
        catalogTypeId: seededId(5, 4),
        description: `Stress VU${__VU} iter${__ITER}`,
        name: `.NET Bot Black Sweatshirt`,
        price: 10 + (seededId(6, 90)),
    });
    const updateRes = http.put(`${BASE_URL}/api/catalog-items`, updatePayload, authHeaders);
    check(updateRes, { 'update 200': (r) => r.status === 200 });

    // 6. Create item (POST)
    const createName = uniqueName('k6-stress');
    const createPayload = JSON.stringify({
        catalogBrandId: seededId(7, 5),
        catalogTypeId: seededId(8, 4),
        description: `Stress test item VU${__VU}`,
        name: createName,
        price: 5 + (seededId(9, 95)),
    });
    const createRes = http.post(`${BASE_URL}/api/catalog-items`, createPayload, authHeaders);
    check(createRes, { 'create 201': (r) => r.status === 201 });

    // 7. Delete the created item so repeated measured runs do not accumulate state
    let createdId = null;
    if (createRes.status === 201) {
        const body = JSON.parse(createRes.body);
        createdId = body.catalogItem.id;
    }

    if (createdId) {
        const deleteRes = http.del(`${BASE_URL}/api/catalog-items/${createdId}`, null, authHeaders);
        check(deleteRes, { 'delete 200': (r) => r.status === 200 });
    }

    // 8. Authenticate (token refresh)
    const authRes = http.post(`${BASE_URL}/api/authenticate`, JSON.stringify({
        username: ADMIN_USER,
        password: ADMIN_PASS,
    }), { headers: { 'Content-Type': 'application/json' } });
    check(authRes, { 'auth 200': (r) => r.status === 200 });

    sleep(0.3);
}

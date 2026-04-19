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
        { duration: '10s', target: 10 },
        { duration: '20s', target: 30 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 },
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
    return { token: JSON.parse(authRes.body).token };
}

export default function (data) {
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
        },
    };

    // 1. Create a catalog item (POST)
    const createName = uniqueName('k6-catalog');
    const createPayload = JSON.stringify({
        catalogBrandId: seededId(1, 5),
        catalogTypeId: seededId(2, 4),
        description: `Stress test item VU${__VU} iter${__ITER}`,
        name: createName,
        price: 5 + seededId(3, 95),
    });
    const createRes = http.post(`${BASE_URL}/api/catalog-items`, createPayload, authHeaders);
    check(createRes, { 'create 201': (r) => r.status === 201 });

    // 2. Read the created item back (GET by ID)
    let createdId = null;
    if (createRes.status === 201) {
        const body = JSON.parse(createRes.body);
        createdId = body.catalogItem.id;
        const getRes = http.get(`${BASE_URL}/api/catalog-items/${createdId}`, authHeaders);
        check(getRes, { 'get created 200': (r) => r.status === 200 });
    }

    // 3. Update the item (PUT)
    if (createdId) {
        const updatePayload = JSON.stringify({
            id: createdId,
            catalogBrandId: seededId(4, 5),
            catalogTypeId: seededId(5, 4),
            description: `Updated by VU${__VU}`,
            name: createName,
            price: 10 + seededId(6, 90),
        });
        const updateRes = http.put(`${BASE_URL}/api/catalog-items`, updatePayload, authHeaders);
        check(updateRes, { 'update 200': (r) => r.status === 200 });
    }

    // 4. Delete the item (DELETE)
    if (createdId) {
        const deleteRes = http.del(`${BASE_URL}/api/catalog-items/${createdId}`, null, authHeaders);
        check(deleteRes, { 'delete 200': (r) => r.status === 200 });
    }

    // 5. Browse catalog list + brands + types (read verification)
    const listRes = http.get(`${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=0`);
    check(listRes, { 'list 200': (r) => r.status === 200 });

    const brandsRes = http.get(`${BASE_URL}/api/catalog-brands`);
    check(brandsRes, { 'brands 200': (r) => r.status === 200 });

    const typesRes = http.get(`${BASE_URL}/api/catalog-types`);
    check(typesRes, { 'types 200': (r) => r.status === 200 });

    sleep(0.3);
}

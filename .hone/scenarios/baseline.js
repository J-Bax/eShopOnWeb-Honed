import http from 'k6/http';
import { check, sleep } from 'k6';
import {
    BASE_URL,
    authHeaders,
    authenticateAdmin,
    buildCatalogItemPayload,
    buildCatalogUpdatePayload,
    cleanupRun,
    prepareRun,
    safeJson,
    seededCatalogItemId,
    seededIndex,
} from './helpers.js';

export const options = {
    stages: [
        { duration: '15s', target: 4 },
        { duration: '30s', target: 8 },
        { duration: '30s', target: 12 },
        { duration: '15s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.05'],
    },
};

export function setup() {
    return prepareRun('baseline');
}

export function teardown(data) {
    cleanupRun(data);
}

export default function (data) {
    const authorizedJson = authHeaders(authenticateAdmin());
    const pageIndex = seededIndex(1, 2);
    const itemId = seededCatalogItemId(data, 2);

    sleep(0.2);

    const [listRes, brandsRes, typesRes] = http.batch([
        ['GET', `${BASE_URL}/api/catalog-items?pageSize=8&pageIndex=${pageIndex}`],
        ['GET', `${BASE_URL}/api/catalog-brands`],
        ['GET', `${BASE_URL}/api/catalog-types`],
    ]);
    check(listRes, {
        'baseline list 200': (r) => r.status === 200,
        'baseline list has items': (r) => {
            const body = safeJson(r);
            return body !== null && Array.isArray(body.catalogItems) && body.catalogItems.length > 0;
        },
    });
    check(brandsRes, { 'baseline brands 200': (r) => r.status === 200 });
    check(typesRes, { 'baseline types 200': (r) => r.status === 200 });

    sleep(0.2);

    const detailRes = http.get(`${BASE_URL}/api/catalog-items/${itemId}`);
    check(detailRes, { 'baseline detail 200': (r) => r.status === 200 });

    sleep(0.2);

    const createPayload = buildCatalogItemPayload(data, 3, 'baseline-item');
    const createRes = http.post(`${BASE_URL}/api/catalog-items`, JSON.stringify(createPayload), authorizedJson);
    const createBody = safeJson(createRes);
    check(createRes, {
        'baseline create 201': (r) => r.status === 201,
        'baseline create tagged': () => createBody !== null && createBody.catalogItem && createBody.catalogItem.name.includes(data.runTag),
    });

    let createdId = null;
    if (createBody !== null && createBody.catalogItem) {
        createdId = createBody.catalogItem.id;
        const getCreatedRes = http.get(`${BASE_URL}/api/catalog-items/${createdId}`);
        check(getCreatedRes, { 'baseline get created 200': (r) => r.status === 200 });
    }

    sleep(0.2);

    if (createdId) {
        const updatePayload = buildCatalogUpdatePayload(data, createdId, 5, 'baseline-item');
        const updateRes = http.put(`${BASE_URL}/api/catalog-items`, JSON.stringify(updatePayload), authorizedJson);
        const updateBody = safeJson(updateRes);
        check(updateRes, {
            'baseline update 200': (r) => r.status === 200,
            'baseline update tagged': () => updateBody !== null && updateBody.catalogItem && updateBody.catalogItem.name.includes(data.runTag),
        });

        const rereadRes = http.get(`${BASE_URL}/api/catalog-items/${createdId}`);
        check(rereadRes, { 'baseline reread 200': (r) => r.status === 200 });
    }

    sleep(0.2);

    if (createdId) {
        const deleteRes = http.del(`${BASE_URL}/api/catalog-items/${createdId}`, null, authorizedJson);
        check(deleteRes, { 'baseline delete 200': (r) => r.status === 200 });

        const deletedRes = http.get(`${BASE_URL}/api/catalog-items/${createdId}`);
        check(deletedRes, { 'baseline deleted 404': (r) => r.status === 404 });
    }

    sleep(0.35);
}

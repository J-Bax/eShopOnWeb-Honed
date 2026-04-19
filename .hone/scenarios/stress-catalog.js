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
} from './helpers.js';

export const options = {
    stages: [
        { duration: '15s', target: 8 },
        { duration: '30s', target: 20 },
        { duration: '30s', target: 35 },
        { duration: '15s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.05'],
    },
};

export function setup() {
    return prepareRun('stress-catalog');
}

export function teardown(data) {
    cleanupRun(data);
}

export default function (data) {
    const authorizedJson = authHeaders(authenticateAdmin());
    const createPayload = buildCatalogItemPayload(data, 5, 'stress-catalog');
    const createRes = http.post(`${BASE_URL}/api/catalog-items`, JSON.stringify(createPayload), authorizedJson);
    const createBody = safeJson(createRes);
    check(createRes, {
        'stress catalog create 201': (r) => r.status === 201,
        'stress catalog create tagged': () => createBody !== null && createBody.catalogItem && createBody.catalogItem.name.includes(data.runTag),
    });

    let createdId = null;
    if (createBody !== null && createBody.catalogItem) {
        createdId = createBody.catalogItem.id;
        const getRes = http.get(`${BASE_URL}/api/catalog-items/${createdId}`);
        check(getRes, { 'stress catalog get 200': (r) => r.status === 200 });
    }

    if (createdId) {
        const updatePayload = buildCatalogUpdatePayload(data, createdId, 7, 'stress-catalog');
        const updateRes = http.put(`${BASE_URL}/api/catalog-items`, JSON.stringify(updatePayload), authorizedJson);
        const updateBody = safeJson(updateRes);
        check(updateRes, {
            'stress catalog update 200': (r) => r.status === 200,
            'stress catalog update tagged': () => updateBody !== null && updateBody.catalogItem && updateBody.catalogItem.name.includes(data.runTag),
        });
    }

    const [listRes, detailRes, brandsRes, typesRes] = http.batch([
        ['GET', `${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=0`],
        ['GET', `${BASE_URL}/api/catalog-items/${seededCatalogItemId(data, 3)}`],
        ['GET', `${BASE_URL}/api/catalog-brands`],
        ['GET', `${BASE_URL}/api/catalog-types`],
    ]);
    check(listRes, {
        'stress catalog list 200': (r) => r.status === 200,
        'stress catalog list has items': (r) => {
            const body = safeJson(r);
            return body !== null && Array.isArray(body.catalogItems) && body.catalogItems.length > 0;
        },
    });
    check(detailRes, { 'stress catalog detail 200': (r) => r.status === 200 });
    check(brandsRes, { 'stress catalog brands 200': (r) => r.status === 200 });
    check(typesRes, { 'stress catalog types 200': (r) => r.status === 200 });

    if (createdId) {
        const deleteRes = http.del(`${BASE_URL}/api/catalog-items/${createdId}`, null, authorizedJson);
        check(deleteRes, { 'stress catalog delete 200': (r) => r.status === 200 });
    }

    sleep(0.15);
}

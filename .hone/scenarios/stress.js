import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, cleanupRun, prepareRun, safeJson, seededCatalogItemId, seededIndex } from './helpers.js';

export const options = {
    stages: [
        { duration: '15s', target: 20 },
        { duration: '30s', target: 60 },
        { duration: '30s', target: 120 },
        { duration: '15s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.05'],
    },
};

export function setup() {
    return prepareRun('stress-browse');
}

export function teardown(data) {
    cleanupRun(data);
}

export default function (data) {
    const pageIndex = seededIndex(1, 2);

    const [catalogPage, detailResponse, brandsResponse, typesResponse, healthResponse] = http.batch([
        ['GET', `${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=${pageIndex}`],
        ['GET', `${BASE_URL}/api/catalog-items/${seededCatalogItemId(data, 2)}`],
        ['GET', `${BASE_URL}/api/catalog-brands`],
        ['GET', `${BASE_URL}/api/catalog-types`],
        ['GET', `${BASE_URL}/health`],
    ]);

    check(catalogPage, {
        'stress browse list 200': (r) => r.status === 200,
        'stress browse list has items': (r) => {
            const body = safeJson(r);
            return body !== null && Array.isArray(body.catalogItems) && body.catalogItems.length > 0;
        },
    });
    check(detailResponse, { 'stress browse detail 200': (r) => r.status === 200 });
    check(brandsResponse, { 'stress browse brands 200': (r) => r.status === 200 });
    check(typesResponse, { 'stress browse types 200': (r) => r.status === 200 });
    check(healthResponse, { 'stress browse health 200': (r) => r.status === 200 });

    sleep(0.15);
}

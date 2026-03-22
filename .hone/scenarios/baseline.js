import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const options = {
    vus: 50,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    // Browse catalog (paginated)
    const catalogPage = http.get(`${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=0`);
    check(catalogPage, {
        'catalog list 200': (r) => r.status === 200,
        'catalog has items': (r) => JSON.parse(r.body).catalogItems.length > 0,
    });

    // Get a specific item
    const itemResponse = http.get(`${BASE_URL}/api/catalog-items/1`);
    check(itemResponse, {
        'item detail 200': (r) => r.status === 200,
    });

    // Browse brands
    const brandsResponse = http.get(`${BASE_URL}/api/catalog-brands`);
    check(brandsResponse, {
        'brands 200': (r) => r.status === 200,
    });

    // Browse types
    const typesResponse = http.get(`${BASE_URL}/api/catalog-types`);
    check(typesResponse, {
        'types 200': (r) => r.status === 200,
    });

    sleep(0.5);
}

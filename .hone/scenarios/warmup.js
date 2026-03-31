import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const options = {
    vus: 5,
    duration: '10s',
};

export default function () {
    // Prime catalog list (EF Core model building + query compilation)
    const catalogPage = http.get(`${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=0`);
    check(catalogPage, { 'catalog 200': (r) => r.status === 200 });

    // Prime item detail
    const itemResponse = http.get(`${BASE_URL}/api/catalog-items/1`);
    check(itemResponse, { 'item 200': (r) => r.status === 200 });

    // Prime brands
    const brandsResponse = http.get(`${BASE_URL}/api/catalog-brands`);
    check(brandsResponse, { 'brands 200': (r) => r.status === 200 });

    // Prime types
    const typesResponse = http.get(`${BASE_URL}/api/catalog-types`);
    check(typesResponse, { 'types 200': (r) => r.status === 200 });

    // Prime auth (Identity token validation pipeline)
    const authRes = http.post(`${BASE_URL}/api/authenticate`, JSON.stringify({
        username: 'admin@microsoft.com',
        password: 'Pass@word1',
    }), { headers: { 'Content-Type': 'application/json' } });
    check(authRes, { 'auth 200': (r) => r.status === 200 });

    sleep(0.5);
}

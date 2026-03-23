import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const options = {
    stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 30 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.50'],
    },
};

export default function () {
    const jsonHeaders = { headers: { 'Content-Type': 'application/json' } };

    // 1. Admin login (valid credentials)
    const adminRes = http.post(`${BASE_URL}/api/authenticate`, JSON.stringify({
        username: 'admin@microsoft.com',
        password: 'Pass@word1',
    }), jsonHeaders);
    check(adminRes, {
        'admin auth 200': (r) => r.status === 200,
        'admin has token': (r) => JSON.parse(r.body).result === true,
    });

    // 2. Normal user login (valid credentials)
    const userRes = http.post(`${BASE_URL}/api/authenticate`, JSON.stringify({
        username: 'demouser@microsoft.com',
        password: 'Pass@word1',
    }), jsonHeaders);
    check(userRes, {
        'user auth 200': (r) => r.status === 200,
        'user has token': (r) => JSON.parse(r.body).result === true,
    });

    // 3. Invalid credentials (expected failure)
    const badRes = http.post(`${BASE_URL}/api/authenticate`, JSON.stringify({
        username: 'admin@microsoft.com',
        password: 'wrong-password',
    }), jsonHeaders);
    check(badRes, {
        'bad auth 200': (r) => r.status === 200,
        'bad auth rejected': (r) => JSON.parse(r.body).result === false,
    });

    sleep(0.3);
}

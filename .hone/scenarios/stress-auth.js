import { check, sleep } from 'k6';
import { ADMIN_USER, DEFAULT_PASSWORD, DEMO_USER, authenticate } from './helpers.js';

export const options = {
    stages: [
        { duration: '10s', target: 15 },
        { duration: '20s', target: 40 },
        { duration: '20s', target: 70 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.50'],
    },
};

export default function () {
    const adminRes = authenticate(ADMIN_USER, DEFAULT_PASSWORD);
    check(adminRes.response, {
        'admin auth 200': (r) => r.status === 200,
        'admin has token': () => adminRes.body !== null && adminRes.body.result === true && typeof adminRes.body.token === 'string',
    });

    const userRes = authenticate(DEMO_USER, DEFAULT_PASSWORD);
    check(userRes.response, {
        'user auth 200': (r) => r.status === 200,
        'user has token': () => userRes.body !== null && userRes.body.result === true && typeof userRes.body.token === 'string',
    });

    const badRes = authenticate(ADMIN_USER, 'wrong-password');
    check(badRes.response, {
        'bad auth 200': (r) => r.status === 200,
        'bad auth rejected': () => badRes.body !== null && badRes.body.result === false,
    });

    sleep(0.2);
}

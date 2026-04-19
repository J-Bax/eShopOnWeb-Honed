import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
export const ADMIN_USER = 'admin@microsoft.com';
export const DEMO_USER = 'demouser@microsoft.com';
export const DEFAULT_PASSWORD = 'Pass@word1';

export function createRunId(scenario) {
    return `${scenario}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

export function buildRunTag(runId) {
    return `[k6-run:${runId}]`;
}

export function seededIndex(salt, max) {
    if (max <= 0) {
        throw new Error(`Cannot seed against max=${max}`);
    }

    return (((__VU * 997 + __ITER * 8191 + salt * 127) * 2654435761) >>> 0) % max;
}

export function pickSeeded(values, salt) {
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Expected a non-empty seeded value list.');
    }

    return values[seededIndex(salt, values.length)];
}

export function prepareRun(scenario) {
    const runId = createRunId(scenario);
    const response = http.post(
        `${BASE_URL}/diag/k6/prepare`,
        JSON.stringify({ runId }),
        jsonHeaders(),
    );

    check(response, {
        [`${scenario} prepare 200`]: (r) => r.status === 200,
    });

    const body = safeJson(response);
    ensure(body !== null, 'prepare did not return JSON');
    ensure(body.runId === runId, 'prepare did not echo the expected runId');
    ensure(Array.isArray(body.catalogBrandIds) && body.catalogBrandIds.length > 0, 'prepare did not return catalogBrandIds');
    ensure(Array.isArray(body.catalogTypeIds) && body.catalogTypeIds.length > 0, 'prepare did not return catalogTypeIds');
    ensure(Array.isArray(body.seededCatalogItemIds) && body.seededCatalogItemIds.length > 0, 'prepare did not return seededCatalogItemIds');

    return {
        scenario,
        runId,
        runTag: buildRunTag(runId),
        catalogBrandIds: body.catalogBrandIds,
        catalogTypeIds: body.catalogTypeIds,
        seededCatalogItemIds: body.seededCatalogItemIds,
    };
}

export function cleanupRun(state) {
    const response = http.post(
        `${BASE_URL}/diag/k6/cleanup`,
        JSON.stringify({ runId: state.runId }),
        jsonHeaders(),
    );

    check(response, {
        [`${state.scenario} cleanup 200`]: (r) => r.status === 200,
    });

    const body = safeJson(response);
    ensure(body !== null, 'cleanup did not return JSON');
    ensure(body.runId === state.runId, 'cleanup did not echo the expected runId');
    return body;
}

export function authenticate(username, password) {
    const response = http.post(
        `${BASE_URL}/api/authenticate`,
        JSON.stringify({
            username,
            password,
        }),
        jsonHeaders(),
    );

    return {
        response,
        body: safeJson(response),
    };
}

export function authenticateAdmin() {
    const result = authenticate(ADMIN_USER, DEFAULT_PASSWORD);
    check(result.response, {
        'admin auth 200': (r) => r.status === 200,
    });

    ensure(result.body !== null, 'admin authentication did not return JSON');
    ensure(result.body.result === true, 'admin authentication failed');
    ensure(typeof result.body.token === 'string' && result.body.token.length > 0, 'admin authentication did not return a token');
    return result.body.token;
}

export function authHeaders(token) {
    return {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    };
}

export function jsonHeaders() {
    return { headers: { 'Content-Type': 'application/json' } };
}

export function buildCatalogItemPayload(state, salt, prefix) {
    return {
        catalogBrandId: pickSeeded(state.catalogBrandIds, salt),
        catalogTypeId: pickSeeded(state.catalogTypeIds, salt + 11),
        description: `${state.runTag} ${prefix} vu${__VU} iter${__ITER}`,
        name: `${state.runTag} ${prefix} ${__VU}-${__ITER}-${salt}`,
        price: Number((10 + seededIndex(salt + 23, 90) + 0.99).toFixed(2)),
    };
}

export function buildCatalogUpdatePayload(state, catalogItemId, salt, prefix) {
    const payload = buildCatalogItemPayload(state, salt, `${prefix}-updated`);
    return {
        id: catalogItemId,
        catalogBrandId: payload.catalogBrandId,
        catalogTypeId: payload.catalogTypeId,
        description: payload.description,
        name: payload.name,
        price: Number((payload.price + 1.25).toFixed(2)),
    };
}

export function seededCatalogItemId(state, salt) {
    return pickSeeded(state.seededCatalogItemIds, salt);
}

export function safeJson(response) {
    try {
        return response.json();
    } catch (error) {
        return null;
    }
}

function ensure(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

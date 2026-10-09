const assert = require('node:assert/strict');
const { test } = require('node:test');
const axios = require('axios');
const { relayAPIRequest } = require('../dist/api/relay');

async function invoke(body) {
    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        sendStatus(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; }
    };
    await relayAPIRequest({ body }, response);
    return response;
}

test('relay validates targets and completes both successful and failed requests', async (t) => {
    const originalGet = axios.get;
    const originalUserAgent = process.env.RELAY_USER_AGENT;
    const originalEmail = process.env.NOMINATIM_EMAIL;
    delete process.env.RELAY_USER_AGENT;
    delete process.env.NOMINATIM_EMAIL;
    t.after(() => {
        axios.get = originalGet;
        for (const [key, value] of [
            ['RELAY_USER_AGENT', originalUserAgent], ['NOMINATIM_EMAIL', originalEmail]
        ]) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
    let calls = 0;
    axios.get = async (url, options) => {
        calls++;
        assert.ok(options.headers['User-Agent'].startsWith('PVTools/'));
        assert.equal(options.timeout, 15000);
        assert.equal(options.maxRedirects, 0);
        return { status: 200, data: [{ lat: '53.86', lon: '10.69', display_name: 'Lübeck' }] };
    };

    await t.test('rejects unsupported methods and malformed URLs', async () => {
        assert.equal((await invoke(undefined)).statusCode, 403);
        assert.equal((await invoke({ method: 'POST' })).statusCode, 403);
        assert.equal((await invoke({ method: 'GET', url: 'not a URL' })).statusCode, 400);
        assert.equal((await invoke({ method: 'GET' })).statusCode, 400);
        assert.equal((await invoke({ method: 'GET', url: 42 })).statusCode, 400);
    });

    await t.test('rejects untrusted hosts, credentials, ports and protocols', async () => {
        for (const url of [
            'https://example.com/',
            'https://nominatim.openstreetmap.org.example.com/',
            'http://nominatim.openstreetmap.org/',
            'ftp://re.jrc.ec.europa.eu/',
            'https://user:password@nominatim.openstreetmap.org/',
            'https://user@re.jrc.ec.europa.eu/',
            'https://nominatim.openstreetmap.org:8080/'
        ]) {
            assert.equal((await invoke({ method: 'GET', url })).statusCode, 403);
        }
        assert.equal(calls, 0);
    });

    await t.test('returns geocoding results and still supports PVGIS', async () => {
        for (const url of [
            'https://nominatim.openstreetmap.org/search?q=Luebeck',
            'https://re.jrc.ec.europa.eu/api/v5_2/seriescalc'
        ]) {
            const response = await invoke({ method: 'GET', url });
            assert.equal(response.statusCode, 200);
            assert.equal(response.body[0].display_name, 'Lübeck');
        }
        assert.equal(calls, 2);
    });

    await t.test('forwards successful upstream status and accepts explicit HTTPS port', async () => {
        axios.get = async (url, options) => {
            assert.equal(new URL(url).port, '');
            assert.equal(options.maxRedirects, 0);
            return { status: 202, data: { pending: true } };
        };
        const response = await invoke({ method: 'GET', url: 'https://re.jrc.ec.europa.eu:443/api/v5_3/seriescalc' });
        assert.equal(response.statusCode, 202);
        assert.deepEqual(response.body, { pending: true });
    });

    await t.test('configures Nominatim email and User-Agent without affecting PVGIS', async () => {
        process.env.RELAY_USER_AGENT = 'PVTools/test (https://example.org/pvtools)';
        process.env.NOMINATIM_EMAIL = 'operator@example.org';
        const requests = [
            ['https://nominatim.openstreetmap.org/search?q=new', 'operator@example.org'],
            ['https://nominatim.openstreetmap.org/search?email=caller%40example.org', 'caller@example.org'],
            ['https://re.jrc.ec.europa.eu/api/v5_3/seriescalc', null]
        ];
        try {
            for (const [url, expectedEmail] of requests) {
                axios.get = async (rawUrl, options) => {
                    assert.equal(new URL(rawUrl).searchParams.get('email'), expectedEmail);
                    assert.equal(options.headers['User-Agent'], process.env.RELAY_USER_AGENT);
                    assert.equal(options.headers.Accept, 'application/json');
                    assert.equal(options.timeout, 15000);
                    assert.equal(options.maxRedirects, 0);
                    return { status: 200, data: [] };
                };
                assert.equal((await invoke({ method: 'GET', url })).statusCode, 200);
            }
        } finally {
            delete process.env.RELAY_USER_AGENT;
            delete process.env.NOMINATIM_EMAIL;
        }
    });

    await t.test('forwards upstream 429 and 400 status and bodies unchanged', async () => {
        for (const [status, data] of [
            [429, { error: 'Rate limit exceeded' }],
            [400, { message: 'Invalid calculation year' }],
            [400, 'Invalid request'],
            [400, ''],
            [400, null],
            [302, 'Redirect not followed']
        ]) {
            axios.get = async () => {
                throw Object.assign(new Error('HTTP failure'), {
                    isAxiosError: true, response: { status, data }
                });
            };
            const response = await invoke({ method: 'GET', url: 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc' });
            assert.equal(response.statusCode, status);
            assert.deepEqual(response.body, data);
        }
    });

    await t.test('returns 502 instead of hanging on upstream errors', async () => {
        axios.get = async () => { throw new Error('Upstream rejected request'); };
        const response = await invoke({ method: 'GET', url: 'https://nominatim.openstreetmap.org/search' });
        assert.equal(response.statusCode, 502);
        assert.ok(response.body.error);
    });

    await t.test('returns 504 on upstream timeouts', async () => {
        for (const code of ['ECONNABORTED', 'ETIMEDOUT']) {
            axios.get = async () => {
                throw Object.assign(new Error('Timeout'), { isAxiosError: true, code });
            };
            const response = await invoke({ method: 'GET', url: 'https://nominatim.openstreetmap.org/search' });
            assert.equal(response.statusCode, 504);
        }
    });
});
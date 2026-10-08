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
    t.after(() => { axios.get = originalGet; });
    let calls = 0;
    axios.get = async (url, options) => {
        calls++;
        assert.ok(options.headers['User-Agent'].startsWith('PVTools/'));
        assert.equal(options.timeout, 15000);
        assert.equal(options.maxRedirects, 0);
        return { data: [{ lat: '53.86', lon: '10.69', display_name: 'Lübeck' }] };
    };

    await t.test('rejects unsupported methods and malformed URLs', async () => {
        assert.equal((await invoke({ method: 'POST' })).statusCode, 403);
        assert.equal((await invoke({ method: 'GET', url: 'not a URL' })).statusCode, 400);
        assert.equal((await invoke({ method: 'GET' })).statusCode, 400);
    });

    await t.test('rejects untrusted hosts, credentials, ports and protocols', async () => {
        for (const url of [
            'https://example.com/',
            'https://nominatim.openstreetmap.org.example.com/',
            'http://nominatim.openstreetmap.org/',
            'https://user:password@nominatim.openstreetmap.org/',
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

    await t.test('returns 502 instead of hanging on upstream errors', async () => {
        axios.get = async () => { throw new Error('Upstream rejected request'); };
        const response = await invoke({ method: 'GET', url: 'https://nominatim.openstreetmap.org/search' });
        assert.equal(response.statusCode, 502);
        assert.ok(response.body.error);
    });

    await t.test('returns 504 on upstream timeouts', async () => {
        axios.get = async () => {
            throw Object.assign(new Error('Timeout'), { isAxiosError: true, code: 'ECONNABORTED' });
        };
        const response = await invoke({ method: 'GET', url: 'https://nominatim.openstreetmap.org/search' });
        assert.equal(response.statusCode, 504);
    });
});
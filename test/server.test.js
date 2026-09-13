import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';

async function get(url) {
  const response = await fetch(url);
  const body = await response.text();
  return { status: response.status, type: response.headers.get('content-type'), body };
}

async function withServer(run) {
  const server = await startServer({ port: 0, host: '127.0.0.1', options: { quiet: true } });
  try {
    await run(server.url);
  } finally {
    await server.close();
  }
}

test('GET /config returns wsPath and LAN urls with the listening port', async () => {
  await withServer(async (url) => {
    const response = await get(`${url}/config`);
    assert.equal(response.status, 200);
    const config = JSON.parse(response.body);
    assert.equal(config.wsPath, '/ws');
    assert.ok(Array.isArray(config.lanUrls));
    assert.ok(Number.isInteger(config.port));
  });
});

test('shared game rules are served as a browser-usable module', async () => {
  await withServer(async (url) => {
    const response = await get(`${url}/shared/game.js`);
    assert.equal(response.status, 200);
    assert.match(response.type, /javascript/);
    assert.match(response.body, /export function tick/);
  });
});

test('only whitelisted static paths are served; traversal and unknown paths 404', async () => {
  await withServer(async (url) => {
    assert.equal((await get(`${url}/package.json`)).status, 404);
    assert.equal((await get(`${url}/server/lobby.js`)).status, 404);
    assert.equal((await get(`${url}/../package.json`)).status, 404);
    assert.equal((await get(`${url}/%2e%2e/package.json`)).status, 404);
    assert.equal((await get(`${url}/nope.html`)).status, 404);
  });
});

test('the app shell and client modules are served to browsers', async () => {
  await withServer(async (url) => {
    const home = await get(`${url}/`);
    assert.equal(home.status, 200);
    assert.match(home.type, /text\/html/);
    assert.match(home.body, /id="screen-select"/);
    for (const file of ['app.js', 'single.js', 'multi.js', 'render.js', 'result-popup.js', 'styles.css']) {
      const response = await get(`${url}/${file}`);
      assert.equal(response.status, 200, `${file} served`);
    }
  });
});

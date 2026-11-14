import express from 'express';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createSavedAnalysesRouter} from './savedAnalyses';

let server: Server;
let base: string;

beforeEach(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/saved-analyses', createSavedAnalysesRouter());
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/saved-analyses`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {status: res.status, body: await res.json()};
}

const analysis = (score = 80) => ({score, findings: [] as any[]});
const doc = (overrides: Record<string, unknown> = {}) => ({
  title: 'Refund policy',
  text: 'Refunds are available within 30 days of purchase.',
  analysisData: analysis(),
  ...overrides,
});

describe('saved analyses API', () => {
  it('lists nothing on a fresh store', async () => {
    expect(await call('GET', '')).toEqual({status: 200, body: []});
  });

  it.each(['title', 'text', 'analysisData'])('rejects a save missing %s', async (field) => {
    const res = await call('POST', '', doc({[field]: undefined}));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({error: 'Missing title, text, or analysisData'});
    expect((await call('GET', '')).body).toEqual([]);
  });

  it('creates a document and lists it', async () => {
    const res = await call('POST', '', doc());
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^sa_\d+_\d+$/);
    expect(res.body).toMatchObject({title: 'Refund policy', analysisData: {score: 80}});
    expect(typeof res.body.lastUpdated).toBe('number');
    expect((await call('GET', '')).body).toEqual([res.body]);
  });

  it('updates an existing document in place when its id is posted again', async () => {
    const created = (await call('POST', '', doc())).body;
    const res = await call('POST', '', doc({id: created.id, title: 'Refund policy v2'}));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({id: created.id, title: 'Refund policy v2'});
    const list = (await call('GET', '')).body;
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Refund policy v2');
  });

  it('cascades an upstream update to linked downstream documents once', async () => {
    const upstream = (await call('POST', '', doc())).body;
    const downstream = (await call('POST', '', doc({title: 'Child', analysisData: analysis(10)}))).body;
    const unrelated = (await call('POST', '', doc({title: 'Other', analysisData: analysis(50)}))).body;

    const linked = await call('PUT', `/${downstream.id}/link`, {upstreamId: upstream.id});
    expect(linked.status).toBe(200);
    expect(linked.body.upstreamId).toBe(upstream.id);

    await call('POST', '', doc({id: upstream.id}));
    await call('POST', '', doc({id: upstream.id}));

    const list = (await call('GET', '')).body;
    const child = list.find((d: any) => d.id === downstream.id);
    const other = list.find((d: any) => d.id === unrelated.id);
    expect(child.analysisData.findings.map((f: any) => f.id)).toEqual(['F-CASCADE']);
    expect(child.analysisData.findings[0]).toMatchObject({severity: 'major', status: 'open'});
    // 10 - 15 is clamped to 0, and the second update does not deduct again.
    expect(child.analysisData.score).toBe(0);
    expect(other.analysisData).toEqual(analysis(50));
  });

  it('returns 404 when linking an unknown document', async () => {
    const res = await call('PUT', '/sa_missing/link', {upstreamId: 'sa_other'});
    expect(res).toEqual({status: 404, body: {error: 'Document not found'}});
  });

  it('deletes a document, and reports success for an unknown id', async () => {
    const keep = (await call('POST', '', doc({title: 'Keep'}))).body;
    const drop = (await call('POST', '', doc({title: 'Drop'}))).body;
    expect(await call('DELETE', `/${drop.id}`)).toEqual({status: 200, body: {success: true}});
    expect((await call('GET', '')).body.map((d: any) => d.id)).toEqual([keep.id]);
    expect(await call('DELETE', '/sa_missing')).toEqual({status: 200, body: {success: true}});
  });

  it('keeps a separate store per router', async () => {
    await call('POST', '', doc());
    const other = express();
    other.use(express.json());
    other.use('/api/saved-analyses', createSavedAnalysesRouter());
    const s = await new Promise<Server>((resolve) => {
      const x = other.listen(0, '127.0.0.1', () => resolve(x));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/saved-analyses`);
      expect(await res.json()).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });
});

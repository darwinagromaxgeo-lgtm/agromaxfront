import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import axios from 'axios';

const source = readFileSync(new URL('../src/shared/services/apiUrl.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(outputText, { exports });
const { normalizeApiBaseUrl } = exports;

test('login requests keep the Nest API prefix when configuration contains only the Render host', () => {
  for (const value of [
    'https://agromaxback.onrender.com',
    'https://agromaxback.onrender.com/',
    ' https://agromaxback.onrender.com/api/ ',
    'https://agromaxback.onrender.com/api',
  ]) {
    const api = axios.create({ baseURL: normalizeApiBaseUrl(value) });
    assert.equal(api.getUri({ url: '/auth/login' }), 'https://agromaxback.onrender.com/api/auth/login');
  }
});

test('local development and the MVP relative API proxy continue to resolve correctly', () => {
  assert.equal(axios.create({ baseURL: normalizeApiBaseUrl(undefined) }).getUri({ url: '/auth/login' }),
    'http://localhost:3000/api/auth/login');
  assert.equal(axios.create({ baseURL: normalizeApiBaseUrl('/api/') }).getUri({ url: '/auth/login' }),
    '/api/auth/login');
});

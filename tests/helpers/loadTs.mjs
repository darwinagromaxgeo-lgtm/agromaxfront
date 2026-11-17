import { existsSync, readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const cache = new Map();
export function loadTs(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = specifier => {
    if (specifier.startsWith('.')) {
      const dependency = path.resolve(path.dirname(filename), specifier) + '.ts';
      if (existsSync(dependency)) return loadTs(dependency);
    }
    return originalRequire(specifier);
  };
  cache.set(filename, loaded);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  loaded._compile(compiled, filename);
  return loaded.exports;
}

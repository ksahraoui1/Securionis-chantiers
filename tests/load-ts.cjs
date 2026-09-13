// Charge les modules TypeScript réels sans ajouter de framework de test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
module.exports = function loadTs(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const nativeRequire = createRequire(filename);
  const requireModule = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) {
      const target = path.join(root, 'src', name.slice(2));
      return loadTs(target + (fs.existsSync(target + '.ts') ? '.ts' : '.tsx'), mocks, cache);
    }
    return nativeRequire(name);
  };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } }).outputText;
  new vm.Script(`(function(require,module,exports,__filename,__dirname){${code}\n})`, { filename })
    .runInThisContext()(requireModule, module, module.exports, filename, path.dirname(filename));
  return module.exports;
};

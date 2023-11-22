const acorn = require('acorn');

class Scope {
  constructor(initial /* 初始化变量 */, parent) {
    const self = {}
    if (typeof initial === 'object') Object.assign(self, normalize(initial))
    if (typeof parent === 'object') Object.assign(self, parent)
    return self
  }
}

function normalize(obj) {
  if (typeof obj !== 'object') return
  Object.keys(obj).forEach((key) => {
    const value = obj[key]
    obj[key] = { value, kind: 'var' }
  })
  return obj
}

const evaluate = require('../homework/eval');

function customEval(code, parent) {

  const scope = new Scope({
    module: {
      exports: {}
    }
  }, parent);

  const node = acorn.parse(code, {
    ecmaVersion: 6
  })
  evaluate(node, scope);
  // return scope.get('module').exports;
  return scope.module.value.exports;
}

module.exports = {
  customEval,
  Scope,
}
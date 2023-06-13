const acorn = require('acorn');
const astring = require('astring');
const traverse = require('../../common/traverse');

function transform(root, originName, targetName) {
  // 遍历所有节点
  return traverse((node, ctx, next) => {

    // TODO: 作业代码写在这里
    const re = (node) => {
      if (node.type === 'Identifier' && node.name === originName) {
          node.name = targetName
      }
    }
    
    if(node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration')  re(node.id)
    if(node.type === 'MemberExpression')  re(node.object)
    if(node.type === 'BinaryExpression')  (re(node.left), re(node.right))

    // 继续往下遍历
    return next(node, ctx)
  })(root);
}

function rename(code, originName, targetName) {
  const ast = acorn.parse(code, {
    ecmaVersion: 5,
  })
  return astring.generate(transform(ast, originName, targetName))
}

module.exports = rename
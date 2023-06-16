const acorn = require("acorn");

function evaluate(node, env) {
  switch (node.type) {
    case "Literal":
      return node.value;
      break;
    // TODO: 补全作业代码
    case "Identifier":
      return env[node.name];
      break;
    case "BinaryExpression":
    case "LogicalExpression":
      const left = evaluate(node.left, env);
      const right = evaluate(node.right, env);
      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "/":
          return left / right;
        case "*":
          return left * right;
        case "||":
          return left || right;
        case "&&":
          return left && right;
        case "<=":
          return left <= right;
      }
      break;
    case "CallExpression":
      const args = node.arguments.map((a) => evaluate(a, env));
      const callee = evaluate(node.callee, env);
      try {
        return callee(...args);
      } catch (err) {
        //
      }
      return;
      break;
    case "ConditionalExpression":
      if (evaluate(node.test, env)) return evaluate(node.consequent, env);
      else return evaluate(node.alternate, env);
      break;
    case "ObjectExpression":
      const obj = {};
      for (const p of node.properties) {
        const key = p.key.name;
        obj[key] = evaluate(p.value, env, {});
      }
      return obj;
      break;
    case "ArrayExpression":
      return node.elements.map((el) => evaluate(el, env));
      break;
    case "ExpressionStatement":
      return evaluate(node.expression, env);
      break;
    case "ArrowFunctionExpression":
      return (...args) => {
        let argEnv = {};
        for (let i in node.params) {
          argEnv[node.params[i].name] = args[i];
        }
        return evaluate(node.body, { ...env, ...argEnv });
      };
      break;
    case "AssignmentExpression":
      if (node.operator === "=") {
        env[node.left.name] = evaluate(node.right, env);
        return env
      }

      break;
    case "SequenceExpression":
      let value;
      for (const exp of node.expressions) {
        value = evaluate(exp, env);
        env = Object.assign(env, value)
      }
      return value;
      break;
  }

  throw new Error(
    `Unsupported Syntax ${node.type} at Location ${node.start}:${node.end}`
  );
}

function customerEval(code, env = {}) {
  const node = acorn.parseExpressionAt(code, 0, {
    ecmaVersion: 6,
  });
  return evaluate(node, env);
}

module.exports = customerEval;

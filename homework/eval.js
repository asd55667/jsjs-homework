function createClosure(env) {
    const closure = Object.create(null)
    closure.parent = env.currentClosure ? env.currentClosure : env
    env.currentClosure = closure
    return closure
}

function dropClosure(env) {
    const scope = env.currentClosure ?? env
    if (!scope?.parent) return;
    if (!scope?.parent?.parent) {
        delete env.currentClosure
    } else env.currentClosure = scope.parent
}

function updateValue(name, value, env) {
    let scope = env.currentClosure ?? env
    while (scope.parent && !(name in scope)) {
        scope = scope.parent;
    }
    scope[name].value = value
}

function Literal(node) {
    return node.value;
}

function Identifier(node, env) {
    const { name } = node
    let scope = env.currentClosure ?? env
    while (scope.parent && !(name in scope)) {
        scope = scope.parent
    }

    return scope[name]?.value
}

function BinaryExpression(node, env) {
    const left = evaluate(node.left, env);
    const right = evaluate(node.right, env);
    return eval(`${left} ${node.operator} ${right}`)
}

function LogicalExpression(node, env) {
    const left = evaluate(node.left, env);
    const right = evaluate(node.right, env);
    switch (node.operator) {
        case "||":
            return left || right;
        case "&&":
            return left && right;
    }
    return false;
}

function CallExpression(node, env) {
    const args = node.arguments.map((a) => evaluate(a, env));
    const callee = evaluate(node.callee, env);
    try {
        return callee(...args);
    } catch (err) {
        //
    }
}

function ConditionalExpression(node, env) {
    if (evaluate(node.test, env)) return evaluate(node.consequent, env);
    else return evaluate(node.alternate, env);
}

function ObjectExpression(node, env) {
    const obj = {};
    for (const p of node.properties) {
        const key = p.key.name;
        obj[key] = evaluate(p.value, env, {});
    }
    return obj;
}

function ArrayExpression(node, env) {
    return node.elements.map((el) => evaluate(el, env));
}

function ExpressionStatement(node, env) {
    return evaluate(node.expression, env);
}

function ArrowFunctionExpression(node, env) {
    return (...args) => {
        const scope = createClosure(env)
        for (let i in node.params) {
            scope[node.params[i].name] = { value: args[i], kind: 'let' };
        }
        const res = evaluate(node.body, { ...env });
        return res
    };
}

function AssignmentExpression(node, env) {
    const scope = env.currentClosure ? env.currentClosure : env
    const { name } = node.left
    if (scope[name]?.kind === 'const') {
        throw new TypeError('Assignment to constant variable');
    }
    const right = evaluate(node.right, env);
    let value = right
    if (node.operator !== '=') {
        value = eval(`${evaluate(node.left, env)} ${node.operator.slice(0, -1)} ${right}`)
    }
    updateValue(name, value, env)
    return value
}

function SequenceExpression(node, env) {
    let value;
    for (const exp of node.expressions) {
        value = evaluate(exp, env);
        env = Object.assign(env, value);
    }
    return value;
}

function IfStatement(node, env) {
    const test = evaluate(node.test, env);
    if (test) {
        return evaluate(node.consequent, env);
    }
    return evaluate(node.alternate, env);
}

function BlockStatement(node, env) {
    let ret;
    node.body.forEach((el) => {
        ret = evaluate(el, env);
    });
    return ret
}

function VariableDeclaration(node, env) {
    const { kind, declarations } = node
    declarations.forEach(decl => {
        let scope = env.currentClosure ? env.currentClosure : env
        scope[decl.id.name] = { value: evaluate(decl.init), kind };
    })
}

function ReturnStatement(node, env) {
    return evaluate(node.argument, env)
}

function ForStatement(node, env) {
    evaluate(node.init, env);
    while (evaluate(node.test, env)) {
        evaluate(node.body, env);
        evaluate(node.update, env);
    }
}

function UpdateExpression(node, env) {
    const { argument } = node
    let val = evaluate(argument, env);
    switch (node.operator) {
        case "++":
            node.prefix ? ++val : val++; break;
        case "--":
            node.prefix ? --val : val--; break
    }

    if (argument.type === 'Identifier') {
        updateValue(argument.name, val, env)
    }

    return val;
}

function WhileStatement(node, env) {
    while (evaluate(node.test, env)) {
        evaluate(node.body, env);
    }
}

function evaluate(node, env) {
    try {
        return eval(`${node.type}(node, env)`);
    } catch (err) {
        throw err
        throw new Error(
            `Unsupported Syntax ${node.type} at Location ${node.start}:${node.end}
            ${err}
            `
        );
    }
}

module.exports = evaluate
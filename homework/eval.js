
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
    if (scope[name].kind === 'var') env[name].value = value
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
    const escape = (v) => typeof v === 'string' && !v ? "\'\'" : v
    return eval(`${escape(left)} ${node.operator} ${escape(right)}`)
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
    if (!callee) return
    return callee(...args);
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
    const scope = env.currentClosure ?? env
    const { left, right } = node
    const rightVal = evaluate(right, env);

    if (left.type === 'Identifier') {
        if (scope[left.name]?.kind === 'const') {
            throw new TypeError('Assignment to constant variable');
        }
        let value = rightVal
        if (node.operator !== '=') {
            value = eval(`${evaluate(left, env)} ${node.operator.slice(0, -1)} ${rightVal}`)
        }
        updateValue(left.name, value, env)
        return value
    } else if (left.type === 'MemberExpression') {
        const leftVal = evaluate(left.object, env);
        leftVal[left.property.name] = rightVal
        if (node.operator !== '=') {
            leftVal[left.property.name] = eval(`${evaluate(left, env)} ${node.operator.slice(0, -1)} ${rightVal}`)
        }
        return leftVal[left.property.name]
    };
    throw new Error(`AssignmentExpression, left type ${node.left.type}`)
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
    } else if (node.alternate) return evaluate(node.alternate, env);
}

function BlockStatement(node, env) {
    let ret;
    for (const stmt of node.body) {
        if (stmt.type === 'ReturnStatement') return evaluate(stmt, env);
        ret = evaluate(stmt, env);
    }
    return ret;
}

function VariableDeclaration(node, env) {
    const { kind, declarations } = node
    declarations.forEach(decl => {
        const scope = env.currentClosure ?? env
        scope[decl.id.name] = { value: evaluate(decl.init), kind };
        if (kind === 'var') {
            env[decl.id.name] = { value: evaluate(decl.init), kind };
        }
    })
}

function ReturnStatement(node, env) {
    return evaluate(node.argument, env)
}

function ForStatement(node, env) {
    const label = node?.label?.name;
    for (evaluate(node.init, env); evaluate(node.test, env); evaluate(node.update, env)) {
        try {
            evaluate(node.body, env);
        } catch (err) {
            if (!err?.label || label === err.label) {
                if (err.type === 'continue') continue
                else if (err.type === 'break') return;
                else throw err
            } else throw err
        }
    }
}

function UpdateExpression(node, env) {
    const { argument } = node
    if (argument.type !== 'Identifier') throw new SyntaxError('Invalid left-hand side expression in postfix operation')

    const old = evaluate(argument, env);
    const val = node.operator === '++' ? old + 1 : old - 1
    updateValue(argument.name, val, env)
    return node.prefix ? val : old;
}

function WhileStatement(node, env) {
    while (evaluate(node.test, env)) {
        try {
            evaluate(node.body, env);
        } catch (err) {
            if (err.type === ' continue') continue
            if (!err?.label || label === err.label) {
                if (err.type === 'continue') continue
                else if (err.type === 'break') return;
                else throw err
            } else throw err
        }
    }
}

function FunctionExpression(node, env) {
    return (...args) => {
        const scope = createClosure(env)
        for (let i in node.params) {
            scope[node.params[i].name] = { value: args[i], kind: 'let' };
        }
        const res = evaluate(node.body, { ...env });
        dropClosure(env)
        return res
    };
}

function MemberExpression(node, env) {
    const { object, property } = node

    let member = evaluate(object, env)[property.name]
    if (typeof member === 'function') {
        member = (...args) => {
            evaluate(object, env)[property.name](...args)
        }
    }
    return member
}

function SwitchStatement(node, env) {
    const { discriminant, cases } = node
    const cond = evaluate(discriminant, env)
    for (const option of cases) {
        if (cond == evaluate(option.test, env)) {
            option.consequent.forEach(stmt => evaluate(stmt, env))
        }
    }
}

function ContinueStatement(node, env) {
    throw { type: 'continue', label: node?.label?.name }
}

function TryStatement(node, env) {
    try {
        return evaluate(node.block, env)
    } catch (err) {
        const callee = evaluate(node.handler, env)
        return callee(err)
    } finally {
        evaluate(node.finalizer, env)
    }
}

function CatchClause(node, env) {
    return (...args) => {
        const { name } = node.param
        env.currentClosure[name] = { value: args[0], kind: 'let' };
        return evaluate(node.body, { ...env });
    };
}

function ThrowStatement(node, env) {
    throw evaluate(node.argument, env);
}

function LabeledStatement(node, env) {
    node.body.label = node.label
    evaluate(node.body, env);
}

function BreakStatement(node, env) {
    throw { type: 'break', label: node?.label?.name }
}

function Program(node, env) {
    node.body.forEach(stmt => evaluate(stmt, env));
}

function evaluate(node, env) {
    return eval(`${node.type}(node, env)`);
}

module.exports = evaluate
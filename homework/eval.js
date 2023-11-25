const isFunc = (v) => typeof v === 'function'

const fMap = Object.create(null);

function getRoot(env) {
    let root = env
    while (root?.parent) root = root.parent
    return root
}

function hoist(node, env) {
    const scope = env.currentClosure ?? env;
    if (node.type === 'FunctionDeclaration') FunctionDeclaration(node, env);
    else if (node.type === 'VariableDeclaration' && node.kind === 'var') {
        for (const decl of node.declarations) {
            if (['global'].includes(decl.id.name)) continue
            scope[decl.id.name] = { value: undefined, kind: 'var' };
        }
    }
}

function configureFu(fn, node) {
    if (node?.id?.name) Object.defineProperty(fn, 'name', { value: node.id.name })
    if (node?.params?.length) Object.defineProperty(fn, 'length', { value: node.params.length })
}

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

    if (name in scope) {
        scope[name].value = value
    } else {
        const root = getRoot(env)
        if (root[name]) {
            if (root[name].kind === 'const') throw new TypeError('Assignment to constant variable');
            root[name].value = value
        }
        else root[name] = { value, kind: 'var' }
    }
}

function Literal(node) {
    return node.value;
}

function Identifier(node, env) {
    const { name } = node
    if (name === 'undefined') return undefined
    if (node.raw === 'null') return null

    let scope = env.currentClosure ?? env
    while (scope.parent && !(name in scope)) {
        scope = scope.parent
    }

    if (!scope[name]) {
        throw new SyntaxError(`Uncaught ReferenceError: ${name} is not defined at Location ${node.start}:${node.end}`);
    }
    return scope[name].value
}

function BinaryExpression(node, env) {
    const left = evaluate(node.left, env);
    const right = evaluate(node.right, env);
    const escape = (v) => typeof v === 'string' ? `\'${v}\'` : v
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
        if (['FunctionExpression'].includes(p.value.type)) p.value.id = p.key
        if (p.kind === 'get') {
            Object.defineProperty(obj, p.key.name, {
                get() {
                    return evaluate(p.value, env).apply(obj);
                }
            })
        } else if (p.kind === 'set') {
            Object.defineProperty(obj, p.key.name, {
                set(v) {
                    evaluate(p.value, env).call(obj, v);
                    return v
                }
            })
        } else {
            obj[p.key.name] = evaluate(p.value, env);
        }
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
        let parent = scope.parent
        while (parent && !parent['global']) {
            parent = parent?.parent
        }
        scope['global'] = parent?.['global']

        for (let i in node.params) {
            scope[node.params[i].name] = { value: args[i], kind: 'let' };
        }
        node.body.scope = true
        let res;
        try {
            res = evaluate(node.body, { ...env });
        } catch (err) {
            if (err.type === 'return') res = err.value
            else throw err
        }
        dropClosure(env)
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
    !node.scope ? createClosure(env) : env
    for (const stmt of node.body) hoist(stmt, env);
    for (const stmt of node.body) evaluate(stmt, env);
    !node.scope && dropClosure(env)
}

function VariableDeclaration(node, env) {
    const { kind, declarations } = node
    declarations.forEach(decl => {
        const scope = env.currentClosure ?? env
        const { name } = decl.id
        const value = decl.init ? evaluate(decl.init, env) : undefined
        if (kind === 'var') {
            if (['global'].includes(name)) return
            const root = getRoot(env)
            root[name] = { value, kind };
        }
        if (name in scope && scope[name].kind === 'const') throw new Error(`Uncaught SyntaxError: Identifier ${name} has already been declared`);
        scope[name] = { value, kind };
    })
}

function ReturnStatement(node, env) {
    throw { type: 'return', value: evaluate(node.argument, env) }
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
    let { argument } = node
    if (!['Identifier', 'MemberExpression'].includes(argument.type)) throw new SyntaxError('Invalid left-hand side expression in postfix operation')

    const old = evaluate(argument, env);
    let val = node.operator === '++' ? old + 1 : old - 1
    let name = argument.name
    if (argument.type === 'MemberExpression') {
        const names = []
        while (argument.type === 'MemberExpression') {
            console.assert(argument.property.type === 'Identifier')
            if (argument.property.computed) names.push(evaluate(argument.property, env))
            else names.push(argument.property.name)
            argument = argument.object
        }
        console.assert(argument.type === 'Identifier')
        const obj = evaluate(argument, env)

        names.reduce((v, name, idx) => {
            const sub = names.slice(idx + 1).reverse().reduce((obj, k) => obj[k], obj)
            sub[name] = v
            return sub
        }, val)
        val = obj
        name = argument.name
    }
    updateValue(name, val, env)
    return node.prefix ? val : old;
}

function WhileStatement(node, env) {
    const label = node?.label?.name;
    const scope = createClosure(env);
    while (evaluate(node.test, env)) {
        try {
            evaluate(node.body, scope);
        } catch (err) {
            if (err.type === ' continue') continue
            if (!err?.label || label === err.label) {
                if (err.type === 'continue') continue
                else if (err.type === 'break') return;
                else throw err
            } else throw err
        } finally {
        }
    }
    dropClosure(env);
}

function FunctionExpression(node, env) {
    const fn = function (...args) {
        const cache = fMap[node?.id?.name]
        const scope = createClosure(env);
        scope['global'] = cache ? { value: cache.self } : { value: this }
        for (let i in node.params) {
            scope[node.params[i].name] = { value: args[i], kind: 'let' };
        }
        node.body.scope = true
        let res
        try {
            res = evaluate(node.body, { ...scope });
        } catch (err) {
            if (err.type === 'return') res = err.value
            else throw err;
        }
        if (cache?.type === 'new' && !res) {
            const { value } = scope['global']
            value.__proto__ = value.constructor.prototype
            return value
        }
        if (cache?.type !== 'bind') delete fMap[node?.id?.name]
        dropClosure(env)
        return res
    };
    configureFu(fn, node)
    return fn
}

function MemberExpression(node, env) {
    const { object, property } = node
    const obj = evaluate(object, env)
    let member = obj[property.name]
    if (isFunc(member)) {
        member = (...args) => {
            if (isFunc(obj)) {
                const { name } = property
                if (name === 'call' || name === 'apply') fMap[object.name] = { self: args[0], type: 'call' }
                if (name === 'bind') fMap[object.name] = { self: args[0], type: 'bind' }
            }
            return obj[property.name](...args)
        }
    }

    return member
}

function SwitchStatement(node, env) {
    const { discriminant, cases } = node
    const cond = evaluate(discriminant, env)
    createClosure(env);
    try {
        for (const option of cases) {
            const { test } = option
            if ((test && cond === evaluate(test, env)) || !test) {
                option.consequent.forEach(stmt => evaluate(stmt, env))
            }
        }
    } catch (err) {
        if (err.type === 'break') return
        else throw err
    } finally {
        dropClosure(env)
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
    node.body.forEach(stmt => hoist(stmt, env));
    node.body.forEach(stmt => evaluate(stmt, env));
}

function ThisExpression(node, env) {
    let scope = env.currentClosure ?? env
    while (scope.parent && !(['global'] in scope)) {
        scope = scope.parent
    }
    return scope['global']?.value
}

function FunctionDeclaration(node, env) {
    const scope = env.currentClosure ?? env
    node.type = 'FunctionExpression'
    const callee = evaluate(node, env)
    const fn = function (...args) {
        return callee(...args)
    }
    configureFu(fn, node)
    scope[node.id.name] = { value: fn, kind: 'var' }
}


function NewExpression(node, env) {
    const args = node.arguments.map((a) => evaluate(a, env));
    const callee = evaluate(node.callee, env)
    fMap[node.callee.name] = { self: { constructor: callee }, type: 'new', name: node.callee.name }
    return new callee(...args)
}

function MetaProperty(node, env) {
    const scope = env.currentClosure ?? env;
    if (node.meta.name === 'new' && node.property.name === 'target') {
        return scope['global'].value.constructor
    }
}

function evaluate(node, env) {
    return eval(`${node.type}(node, env)`);
}

module.exports = evaluate
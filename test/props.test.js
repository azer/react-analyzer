const assert = require('assert');
const { functionVisitor } = require('../dist/functions');
const { variableVisitor } = require('../dist/variables');
const { test, runTests } = require('./runner');
const { traverseAST } = require('../dist/parser');

test('Simple function component with props', () => {
    const code = `
        function SimpleComponent(props) {
            return <div>{props.name}</div>;
        }
    `;
    const result = runVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0].arguments[0], {
        type: 'object',
        name: 'props',
        props: {
            name: { type: 'unknown', optional: false }
        }
    });
});

test('Arrow function component with nested props', () => {
    const code = `
        const NestedComponent = (props) => {
            return <div>{props.user.profile.avatar}</div>;
        };
    `;
    const result = runVisitor(code, variableVisitor);
    assert.deepStrictEqual(result.functions[0].arguments[0], {
        type: 'object',
        name: 'props',
        props: {
            user: {
                type: 'object',
                optional: false,
                props: {
                    profile: {
                        type: 'object',
                        optional: false,
                        props: {
                            avatar: { type: 'unknown', optional: false }
                        }
                    }
                }
            }
        }
    });
});

test('Component with destructured props', () => {
    const code = `
        function DestructuredComponent({ name, age }) {
            return <div>{name} is {age} years old</div>;
        }
    `;
    const result = runVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0].arguments[0], {
        type: 'object',
        props: {
            name: { type: 'unknown', optional: false },
            age: { type: 'unknown', optional: false }
        }
    });
});

test('Component with prop spreading', () => {
    const code = `
        function SpreadComponent(props) {
            return <ChildComponent {...props} extraProp={true} />;
        }
    `;
    const result = runVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0].arguments[0], {
        type: 'unknown',
        name: 'props', // Empty because we can't infer specific props from spreading
    });
});

test('TypeScript component with typed props', () => {
    const code = `
        interface Props {
            name: string;
            age: number;
        }

        function TypedComponent(props: Props) {
            return <div>{props.name} is {props.age} years old</div>;
        }
    `;
    const result = runVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0].arguments[0], {
        type: 'type_reference',
        typeName: 'Props',
        name: 'props'
    });
});

test('Component with conditional prop usage', () => {
    const code = `
        function ConditionalComponent(props) {
            return (
                <div>
                    {props.showName && <span>{props.name}</span>}
                    {props.data ? <DataView data={props.data} /> : null}
                </div>
            );
        }
    `;
    const result = runVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0].arguments[0], {
        type: 'object',
        name: 'props',
        props: {
            showName: { type: 'unknown', optional: false },
            name: { type: 'unknown', optional: false },
            data: { type: 'unknown', optional: false }
        }
    });
});

test('Component with prop usage in useEffect', () => {
    const code = `
        function EffectComponent(props) {
            React.useEffect(() => {
                console.log(props.effectDependency);
            }, [props.effectDependency]);

            return <div>{props.content}</div>;
        }
    `;
    const result = runVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0].arguments[0], {
        type: 'object',
        name: 'props',
        props: {
            effectDependency: { type: 'unknown', optional: false },
            content: { type: 'unknown', optional: false }
        }
    });
});

function runVisitor(code, visitor) {
    const result = {
        components: [],
        typeDefinitions: [],
        exported: [],
        aliases: [],
        types: [],
        functions: [],
    };

    const visitors = {
        FunctionDeclaration: (path) => functionVisitor(result, path),
        VariableDeclaration: (path) => variableVisitor(result, path),
    };

    traverseAST('test.tsx', code, visitors);

    return result;
}

if (require.main === module) {
    const pattern = process.argv[2] || '';
    runTests(pattern);
}
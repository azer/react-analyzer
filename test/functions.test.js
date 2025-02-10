const assert = require('assert');
const { resolveType, resolveFunction } = require('../dist/index')
const { variableVisitor } = require('../dist/variables');
const { interfaceVisitor, typeAliasVisitor } = require('../dist/interface');
const { functionVisitor } = require('../dist/functions');
const { test, runTests } = require('./runner');
const { traverseAST } = require('../dist/parser');

test('Simple function declaration', () => {
    const code = `
    function SimpleComponent(props) {
      return <div>{props.name}</div>;
    }
  `;
    const result = runFunctionVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0], {
        name: 'SimpleComponent',
        arguments: [
            { name: 'props', props: { name: { type: 'unknown', optional: false } }, type: 'object' }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

test('Function with typed props', () => {
    const code = `
    function TypedComponent(props: { name: string; age: number }) {
      return <div>{props.name}: {props.age}</div>;
    }
  `;
    const result = runFunctionVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0], {
        name: 'TypedComponent',
        arguments: [
            {
                name: 'props',
                type: 'object',
                props: {
                    name: { type: 'string', optional: false },
                    age: { type: 'number', optional: false }
                }
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

test('Function with destructured props', () => {
    const code = `
    function DestructuredComponent({ name, age }: { name: string; age: number }) {
      return <div>{name}: {age}</div>;
    }
  `;
    const result = runFunctionVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0], {
        name: 'DestructuredComponent',
        arguments: [
            {
                type: 'object',
                props: {
                    name: { type: 'string', optional: false },
                    age: { type: 'number', optional: false }
                }
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

test('Function with hooks and logic', () => {
    const code = `
      function ComplexComponent({ initialCount, step }) {
        const [count, setCount] = useState(initialCount);
        const increment = useCallback(() => {
          setCount(prevCount => prevCount + step);
        }, [step]);
  
        useEffect(() => {
          document.title = \`Count: \${count}\`;
        }, [count]);
  
        return (
          <div>
            <p>Count: {count}</p>
            <button onClick={increment}>Increment</button>
          </div>
        );
      }
    `;
    const result = runFunctionVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0], {
        name: 'ComplexComponent',
        arguments: [
            {
                type: 'object',
                props: {
                    initialCount: { type: 'unknown', optional: false },
                    step: { type: 'unknown', optional: false }
                }
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

test('Function with props declared as type alias', () => {
    const code = `
      type Props = {
        name: string;
        age: number;
      };
  
      function TypeAliasComponent(props: Props) {
        return <div>{props.name}: {props.age}</div>;
      }
    `;
    const result = runFunctionVisitor(code, functionVisitor);

    
    assert.deepStrictEqual(result.functions[0], {
        name: 'TypeAliasComponent',
        arguments: [
            {
                "type": "object",
                "props": {
                    "name": {
                        "type": "string",
                        "optional": false
                    },
                    "age": {
                        "type": "number",
                        "optional": false
                    }
                },
                "typeName": "Props"
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

test('Function with props declared as interface and destructured', () => {
    const code = `
      interface Props {
        name: string;
        age: number;
      }
  
      function InterfaceComponent({ name, age }: Props) {
        return <div>{name}: {age}</div>;
      }
    `;
    const result = runFunctionVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0], {
        name: 'InterfaceComponent',
        arguments: [
            {
                type: "object",
                props: {
                    name: { type: 'string', optional: false },
                    age: { type: 'number', optional: false }
                },
                "typeName": "Props"
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});


test('Multiple top-level functions and nested functions', () => {
    const code = `
        function helperFunction(a: string, b: number): number {
            return a + b;
        }

        const arrowHelperFunction = (x: string, y: string): string => {
            return x + y;
        };

        function PureComponent({ name, age }: { name: string; age: number }): JSX.Element {
            const formatName = (name: string): string => {
                return name.toUpperCase();
            };

            useEffect(() => {
                function effectCleanup() {
                    console.log('Cleanup');
                }
                return effectCleanup;
            }, []);

            return <div>{formatName(name)}: {age}</div>;
        }

        function anotherTopLevelFunction<T>(item: T): T {
            return item;
        }
    `;
    const result = runFunctionVisitor(code, functionVisitor);

    assert.strictEqual(result.functions.length, 3, 'Should only capture 3 top-level functions');

    assert.deepStrictEqual(result.functions[0], {
        name: 'helperFunction',
        arguments: [
            { name: 'a', type: 'string' },
            { name: 'b', type: 'number' }
        ],
        returnType: { type: 'number' }
    });

    assert.deepStrictEqual(result.functions[1], {
        name: 'PureComponent',
        arguments: [
            {
                type: 'object',
                props: {
                    name: { type: 'string', optional: false },
                    age: { type: 'number', optional: false }
                }
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });

    assert.deepStrictEqual(result.functions[2], {
        name: 'anotherTopLevelFunction',
        arguments: [
            { name: 'item', type: "type_reference", typeName: 'T', isGeneric: true }
        ],
        returnType: { type: 'type_reference', typeName: 'T', isGeneric: true },
        genericParams: ['T']
    });
});

test('Function with destructured props from interface', () => {
    const code = `
      interface Props {
        foo: string;
        bar?: number;
        qux: boolean
      }
  
      function DestructuredPropsComponent({ foo, bar }: Props) {
        return <div>{foo}: {bar}</div>;
      }
    `;
    const result = runFunctionVisitor(code, functionVisitor);
    assert.deepStrictEqual(result.functions[0], {
        name: 'DestructuredPropsComponent',
        arguments: [
            {
                type: "object",
                props: {
                    foo: { type: 'string', optional: false },
                    bar: { type: 'number', optional: true }
                },
                typeName: "Props"
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

test('Function with default values', () => {
    const code = `

    interface Props { name?: string; age?: number }

    function DefaultValuesComponent({ name = "John", age = 30 }: Props) {
      return <div>{name}: {age}</div>;
    }
  `;
    const result = runFunctionVisitor(code, functionVisitor);

    assert.deepStrictEqual(result.functions[0], {
        name: 'DefaultValuesComponent',
        arguments: [
            {
                type: 'object',
                props: {
                    name: { type: 'string', optional: true, defaultValue: '"John"' },
                    age: { type: 'number', optional: true, defaultValue: '30' }
                },
                typeName: 'Props'
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

test('Function with complex default values', () => {
    const code = `
    interface Props {
        user?: { name: string; age: number };
        items?: string[];
        config?: { theme: 'light' | 'dark'; showHeader?: boolean };
    }

    function ComplexDefaultsComponent({
        user = { name: "John Doe", age: 30 },
        items = ["item1", "item2"],
        config = { theme: "light", showHeader: true }
    }: Props) {
        return (
            <div>
                <p>{user.name}: {user.age}</p>
                <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
                <p>Theme: {config.theme}, Show Header: {config.showHeader ? 'Yes' : 'No'}</p>
            </div>
        );
    }
    `;
    const result = runFunctionVisitor(code, functionVisitor);

    assert.deepStrictEqual(result.functions[0], {
        name: 'ComplexDefaultsComponent',
        arguments: [
            {
                type: 'object',
                props: {
                    user: {
                        type: 'object',
                        optional: true,
                        props: {
                            name: { type: 'string', optional: false },
                            age: { type: 'number', optional: false }
                        },
                        defaultValue: '{ name: "John Doe", age: 30 }'
                    },
                    items: {
                        type: 'array',
                        optional: true,
                        elementType: { type: 'string' },
                        defaultValue: '["item1", "item2"]'
                    },
                    config: {
                        type: 'object',
                        optional: true,
                        props: {
                            theme: {
                                type: 'union',
                                types: [
                                    { type: 'literal', literal: { type: 'string', value: 'light' } },
                                    { type: 'literal', literal: { type: 'string', value: 'dark' } },
                                  
                                ],
                                optional: false
                            },
                            showHeader: { type: 'boolean', optional: true }
                        },
                        defaultValue: '{ theme: "light", showHeader: true }'
                    }
                },
                typeName: 'Props'
            }
        ],
        returnType: { type: 'type_reference', typeName: 'JSX.Element' }
    });
});

function runFunctionVisitor(code, visitor) {
    const result = {
        components: [],
        typeDefinitions: [],
        exported: [],
        aliases: [],
        types: [],
        functions: [],
    };

    const visitors = {
        FunctionDeclaration: (path) => visitor(result, path),
        TSTypeAliasDeclaration: (path) => typeAliasVisitor(result, path),
        TSInterfaceDeclaration: (path) => interfaceVisitor(result, path)
    };

    traverseAST('test.tsx', code, visitors);

    result.types = result.types.map(type => resolveType(result, type));
    result.functions = result.functions.map(func => resolveFunction(result, func));

    return result;
}


if (require.main === module) {
    const pattern = process.argv[2] || '';
    runTests(pattern);
}
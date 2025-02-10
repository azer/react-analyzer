const assert = require('assert');
const { resolveType, resolveFunction } = require('../dist/index')
const { variableVisitor } = require('../dist/variables');
const { interfaceVisitor, typeAliasVisitor } = require('../dist/interface');
const { test, runTests } = require('./runner');
const { traverseAST } = require('../dist/parser');
const { functionVisitor } = require('../dist/functions');

test('Simple TSX arrow component', () => {
  const code = `
    type Props = {
      name: string;
      age: number;
    };

    const SimplePropsComponent = (props: Props) => {
      return <div>{props.name}: {props.age}</div>;
    };
  `;

  const result = runVariableVisitor("simple_props.tsx", code, variableVisitor);

  assert.deepStrictEqual(result.functions[0], {
    name: 'SimplePropsComponent',
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
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
  });
});

test('Simple JSX arrow component', () => {
  const code = `
    const SimpleComponent = (props) => {
      return <div>{props.name}</div>;
    };
  `;

  const result = runVariableVisitor("simple.jsx", code, variableVisitor);
  assert.deepStrictEqual(result.functions[0], {
    name: 'SimpleComponent',
    arguments: [
      { name: 'props', type: 'object', props: { name: { optional: false, type: 'unknown' } } }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
  });
});

test('Arrow function with typed props', () => {
  const code = `
    const TypedComponent = (props: { name: string; age: number }) => {
      return <div>{props.name}: {props.age}</div>;
    };
  `;
  const result = runVariableVisitor("var.tsx", code, variableVisitor);
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
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
  });
});

test('Arrow function with destructured props', () => {
  const code = `
    const DestructuredComponent = ({ name, age }: { name: string; age: number }) => {
      return <div>{name}: {age}</div>;
    };
  `;
  const result = runVariableVisitor("destructured.tsx", code, variableVisitor);


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
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
  });
});

test('Arrow function with implicit return', () => {
  const code = `
    const ImplicitReturnComponent = ({ message }: { message?: string }) => (
      <div>{message}</div>
    );
  `;
  const result = runVariableVisitor("arrow.tsx", code, variableVisitor);
  assert.deepStrictEqual(result.functions[0], {
    name: 'ImplicitReturnComponent',
    arguments: [
      {
        type: 'object',
        props: {
          message: { type: 'string', optional: true }
        }
      }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
  });
});

test('Arrow function with complex JSX', () => {
  const code = `
    const ComplexComponent = ({ items, onItemClick }: { items: string[], onItemClick: (item: string) => void }) => (
      <ul>
        {items.map((item, index) => (
          <li key={index} onClick={() => onItemClick(item)}>{item}</li>
        ))}
      </ul>
    );
  `;

  const result = runVariableVisitor("complex.tsx", code, variableVisitor);

  assert.deepStrictEqual(result.functions[0], {
    name: 'ComplexComponent',
    arguments: [
      {
        type: 'object',
        props: {
          items: { type: 'array', elementType: { type: 'string' }, optional: false },
          onItemClick: {
            type: 'function',
            parameters: [{ name: 'item', type: 'string' }],
            returnType: { type: 'void' },
            optional: false
          }
        }
      }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' }
  });
});

test('Arrow function with React hooks and JSX', () => {
  const code = `
    const HookedComponent = ({ initialCount }) => {
      const [count, setCount] = React.useState(initialCount);
      React.useEffect(() => {
        document.title = \`Count: \${count}\`;
      }, [count]);

      return (
        <div>
          <p>Count: {count}</p>
          <button onClick={() => setCount(count + 1)}>Increment</button>
        </div>
      );
    };
  `;
  const result = runVariableVisitor("hooks.jsx", code, variableVisitor);


  assert.deepStrictEqual(result.functions[0], {
    name: 'HookedComponent',
    arguments: [
      {
        type: 'object',
        props: {
          initialCount: { type: 'unknown', optional: false }
        }
      }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' }
  });
});

test('Simple aliases at file scope', () => {
  const code = `
    const MyComponent = ({ name }) => <div>{name}</div>;
    const AnotherComponent = ({ age }) => <span>{age}</span>;

    export const Foo = MyComponent;
    const Bar = AnotherComponent;
  `;

  const result = runVariableVisitor("simple_aliases.tsx", code, variableVisitor);

  assert.deepStrictEqual(result.aliases, [
    { name: 'Foo', target: 'MyComponent' },
    { name: 'Bar', target: 'AnotherComponent' }
  ]);
});

test('Function-wrapped aliases at file scope', () => {
  const code = `
    import React from 'react';

    const MyComponent = ({ name }) => <div>{name}</div>;
    const AnotherComponent = ({ age }) => <span>{age}</span>;

    const EnhancedComponent = React.memo(MyComponent);
    const ForwardedComponent = React.forwardRef(MyComponent);
  `;

  const result = runVariableVisitor("wrapped_aliases.tsx", code, variableVisitor);

  assert.deepStrictEqual(result.aliases, [
    { name: 'EnhancedComponent', target: 'MyComponent', wrapperFn: 'React.memo' },
    { name: 'ForwardedComponent', target: 'MyComponent', wrapperFn: 'React.forwardRef' }
  ]);
});

test('Arrow function with destructured props & pointing to named interface', () => {
  const code = `
    interface Props {
      name?: string,
      age?: number
    }

    const DestructuredComponent = ({ name, age }: Props) => {
      return <div>{name}: {age}</div>;
    };
  `;
  const result = runVariableVisitor("destructured.tsx", code, variableVisitor);

  assert.deepStrictEqual(result.functions[0], {
    name: 'DestructuredComponent',
    arguments: [
      {
        type: 'object',
        typeName: 'Props',
        props: {
          name: { type: 'string', optional: true },
          age: { type: 'number', optional: true }
        }
      }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
  });
});

test('React.FC component', () => {
  const code = `
    type Props = {
      items: string[];
      onClick: (id: number) => void;
      status?: 'loading' | 'success' | 'error';
    }

    export const Hello: React.FC<Props> = ({ items, onClick, status }) => {
      return <div>{status}</div>;
    };
  `;

  const result = runVariableVisitor("hello.tsx", code, variableVisitor);

  assert.deepStrictEqual(result.functions[0], {
    name: 'Hello',
    arguments: [
      {
        type: 'object',
        typeName: 'Props',
        props: {
          items: { type: 'array', elementType: { type: 'string' }, optional: false },
          onClick: {
            type: 'function',
            parameters: [{ name: 'id', type: 'number' }],
            returnType: { type: 'void' },
            optional: false
          },
          status: {
            type: 'union',
            types: [
              { type: 'literal', literal: { type: 'string', value: 'loading' } },
              { type: 'literal', literal: { type: 'string', value: 'success' } },
              { type: 'literal', literal: { type: 'string', value: 'error' } },
            ],
            optional: true
          }
        }
      }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
  });
});

test('Wrapped complex component with hooks and context in TSX', () => {
  const code = `
    import React, { useContext, useEffect, useState } from 'react';
    import { ThemeContext, Theme } from './ThemeContext';

    interface Item {
      id: string;
      name: string;
    }

    interface ComplexWrappedComponentProps {
      items: Item[];
      onItemSelect: (item: Item) => void;
      initialCount?: number;
    }

    const ComplexWrappedComponent: React.FC<ComplexWrappedComponentProps> = React.memo(({ 
      items, 
      onItemSelect, 
      initialCount = 0 
    }) => {

      return (
        <div style={{ backgroundColor: theme.background, color: theme.foreground }}>
          <h2>Selected: {count}</h2>
          <ul>
            {items.map((item) => (
              <li key={item.id} onClick={() => handleItemClick(item)}>
                {item.name}
              </li>
            ))}
          </ul>
        </div>
      );
    });

    export default ComplexWrappedComponent;
  `;

  const result = runVariableVisitor("complex_wrapped.tsx", code, variableVisitor);

  assert.equal(result.types.length, 2)
  assert.equal(result.functions.length, 1)
  assert.deepStrictEqual(result.functions[0], {
    name: 'ComplexWrappedComponent',
    arguments: [
      {
        "type": "object",
        "props": {
          "items": {
            "type": "array",
            "elementType": {
              "type": "object",
              "props": {
                "id": {
                  "type": "string",
                  "optional": false
                },
                "name": {
                  "type": "string",
                  "optional": false
                }
              },
              "typeName": "Item"
            },
            "optional": false
          },
          "onItemSelect": {
            "type": "function",
            "returnType": {
              "type": "void"
            },
            "parameters": [
              {
                "type": "object",
                "props": {
                  "id": {
                    "type": "string",
                    "optional": false
                  },
                  "name": {
                    "type": "string",
                    "optional": false
                  }
                },
                "typeName": "Item"
              }
            ],
            "optional": false
          },
          "initialCount": {
            "type": "number",
            "optional": true,
            "defaultValue": '0'
          }
        },
        "typeName": "ComplexWrappedComponentProps"
      }
    ],
    "wrapperFn": "React.memo",
    returnType: { type: 'type_reference', typeName: 'JSX.Element' }
  });

});

test('Complex component with nested functions and top-level helpers', () => {
  const code = `
    import React from 'react';

    interface Item {
      id: string;
      name: string;
    }

    interface ComplexComponentProps {
      items: Item[];
    }

    const ComplexComponent: React.FC<ComplexComponentProps> = ({ items }) => {
      const handleClick = (item) => {
        console.log(item);
      };

      useEffect(() => {
        console.log('hi')

        foo()

        return () => {
          console.log('bye')  
        }

        async function foo() {
          throw new Error("no")
        }
      }, [])

      function renderItem(item) {
        return <li key={item.id}>{item.name}</li>;
      }

      return (
        <ul>
          {items.map((item) => (
            <div onClick={() => handleClick(item)}>
              {renderItem(item)}
            </div>
          ))}
        </ul>
      );
    };

    function topLevelHelper1(a: number, b: number): number {
      return a + b;
    }

    const topLevelHelper2 = <T>(x: T, y: T): T => {
      return x + y;
    };

    export default ComplexComponent;
  `;

  const result = runVariableVisitor("complex_with_helpers.tsx", code, variableVisitor);

  assert.equal(result.functions.length, 3, "Should only have 3 top-level functions");

  assert.deepStrictEqual(result.functions[0], {
    name: 'ComplexComponent',
    arguments: [
      {
        "type": "object",
        "props": {
          "items": {
            "type": "array",
            "elementType": {
              "type": "object",
              "props": {
                "id": {
                  "type": "string",
                  "optional": false
                },
                "name": {
                  "type": "string",
                  "optional": false
                }
              },
              "typeName": "Item"
            },
            "optional": false
          }
        },
        "typeName": "ComplexComponentProps"
      }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' }
  });

  assert.deepStrictEqual(result.functions[1], {
    name: 'topLevelHelper1',
    arguments: [
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' }
    ],
    returnType: { type: 'number' }
  });

  assert.deepStrictEqual(result.functions[2], {
    name: 'topLevelHelper2',
    arguments: [
      { name: 'x', type: 'type_reference', typeName: 'T', isGeneric: true },
      { name: 'y', type: 'type_reference', typeName: 'T', isGeneric: true }
    ],
    returnType: { type: 'type_reference', typeName: 'T', isGeneric: true }
  });
});

test('Arrow function with complex default values', () => {
  const code = `
    interface Props {
      user?: { name: string; age: number };
      items?: string[];
      config?: { theme: 'light' | 'dark'; showHeader?: boolean };
    }

    const ComplexDefaultsComponent = ({
      user = { name: "John Doe", age: 30 },
      items = ["item1", "item2"],
      config = { theme: "light", showHeader: true }
    }: Props) => {
      return (
        <div>
          <p>{user.name}: {user.age}</p>
          <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
          <p>Theme: {config.theme}, Show Header: {config.showHeader ? 'Yes' : 'No'}</p>
        </div>
      );
    };
  `;
  const result = runVariableVisitor("complex_defaults.tsx", code, variableVisitor);

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
                  { type: 'literal', literal: { type: 'string', value: 'dark' } }
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

test('React.memo component with type parameter', () => {
  const code = `
    interface Props {
      value: string;
    }

    export const XComponent = React.memo<Props>(({ value }) => <div>{value}</div>);
  `;

  const result = runVariableVisitor("memo_with_type.tsx", code, variableVisitor);

  assert.deepStrictEqual(result.functions[0], {
    name: 'XComponent',
    arguments: [
      {
        type: 'object',
        props: {
          value: { type: 'string', optional: false }
        },
        typeName: 'Props'
      }
    ],
    returnType: { type: 'type_reference', typeName: 'JSX.Element' },
    wrapperFn: 'React.memo'
  });
});

test('React.memo component with inline object type', () => {
  const code = `
    export const XComponent = React.memo<{ value: number }>(({ value }) => <div>{value}</div>);
  `;

  const result = runVariableVisitor("memo_with_type.tsx", code, variableVisitor);

  assert.deepStrictEqual(result, {
    "components": [],
    "typeDefinitions": [],
    "exported": [],
    "aliases": [],
    "types": [],
    "functions": [
      {
        "name": "XComponent",
        "arguments": [
          {
            "type": "object",
            "props": {
              "value": {
                "type": "number",
                "optional": false
              }
            }
          }
        ],
        "returnType": {
          "type": "type_reference",
          "typeName": "JSX.Element"
        },
        "wrapperFn": "React.memo"
      }
    ]
  });
});

function runVariableVisitor(filename, code, visitor) {
  const result = {
    components: [],
    typeDefinitions: [],
    exported: [],
    aliases: [],
    types: [],
    functions: [],
  };

  const visitors = {
    VariableDeclaration: (path) => visitor(result, path),
    TSTypeAliasDeclaration: (path) => typeAliasVisitor(result, path),
    TSInterfaceDeclaration: (path) => interfaceVisitor(result, path),
    FunctionDeclaration: (path) => functionVisitor(result, path),
  };

  traverseAST(filename, code, visitors);

  result.types = result.types.map(type => resolveType(result, type));
  result.functions = result.functions.map(func => resolveFunction(result, func));

//  console.log('result [after] >', JSON.stringify(result, null, '\t'))

  return result;
}

if (require.main === module) {
  const pattern = process.argv[2] || '';
  runTests(pattern);
}
const assert = require('assert');
const { analyzeReactFile } = require('../dist/index');
const { test, runTests } = require('./runner');

test('minimal jsx component', () => {
  const code = `import React from 'react'

export function HelloWorld(props) {
    return <div>{props.user}: {props.message}</div>
}`

  const result = analyzeReactFile('HelloWorld.jsx', code);

  assert.deepStrictEqual(result, {
    type: 'jsx',
    filename: 'HelloWorld.jsx',
    components: [{
      name: 'HelloWorld',
      props: {
        message: { type: 'unknown', optional: false },
        user: { type: 'unknown', optional: false },
      },
    }],
  });

})

test('simple TS functional component with variable declaration & prop destruction', () => {
  const code = `
    interface Props {
      name: string;
      age: number;
      isActive?: boolean;
    }

    export const MyComponent = ({ name, age, isActive }: Props) => {
      return <div>{name}: {age}</div>;
    };

    const Foo = MyComponent
    const Bar = Foo

    export { Bar }
  `;

  const result = analyzeReactFile('MyComponent.tsx', code);

  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'MyComponent.tsx',
    components: [{
      name: 'MyComponent',
      props: {
        name: { type: 'string', optional: false },
        age: { type: 'number', optional: false },
        isActive: { type: 'boolean', optional: true },
      },
    },
    {
      name: 'Bar',
      props: {
        name: { type: 'string', optional: false },
        age: { type: 'number', optional: false },
        isActive: { type: 'boolean', optional: true },
      },
    }
  ],
  });
});

test('TS functional component with referenced interface and nested prop', () => {
  const code = `
    interface Address {
      street: string;
      city: string;
    }

    interface Props {
      name: string;
      age: number;
      isActive?: boolean;
      address: Address;
      settings: {
        theme: 'light' | 'dark';
        notifications: boolean;
      };
    }

    export const MyComponent = ({ name, age, isActive, address, settings }: Props) => {
      return <div>{name}: {age}, {address.city}</div>;
    };
  `;

  const result = analyzeReactFile('MyComponent.tsx', code);

  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'MyComponent.tsx',
    components: [{
      name: 'MyComponent',
      props: {
        name: { type: 'string', optional: false },
        age: { type: 'number', optional: false },
        isActive: { type: 'boolean', optional: true },
        address: {
          type: 'object',
          typeName: 'Address',
          optional: false,
          props: {
            street: { type: 'string', optional: false },
            city: { type: 'string', optional: false },
          },
        },
        settings: {
          type: 'object',
          optional: false,
          props: {
            theme: {
              type: 'union',
              optional: false,
              types: [
                { type: 'literal', literal: { type: 'string', value: 'light' } },
                { type: 'literal', literal: { type: 'string', value: 'dark' } },
              ],
            },
            notifications: { type: 'boolean', optional: false },
          },
        },
      },
    }],
  });
});


test('component with complex types', () => {
  const code = `
    type Props = {
      items: string[];
      onClick: (id: number) => void;
      status: 'loading' | 'success' | 'error';
    }

    export const ComplexComponent: React.FC<Props> = ({ items, onClick, status }) => {
      return <div>{status}</div>;
    };
  `;

  const result = analyzeReactFile('ComplexComponent.tsx', code);

  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'ComplexComponent.tsx',
    components: [{
      name: 'ComplexComponent',
      props: {
        items: {
          type: 'array',
          optional: false,
          elementType: {
            type: 'string'
          }
        },
        onClick: {
          type: 'function',
          optional: false,
          parameters: [
            {
              name: "id",
              type: 'number'
            }
          ],
          returnType: {
            type: 'void'
          }
        },
        status: {
          type: 'union',
          optional: false,
          types: [
            {
              type: 'literal',
              literal: { value: 'loading', type: "string" }
            },
            {
              type: 'literal',
              literal: { value: 'success', type: "string" }
            },
            {
              type: 'literal',
              literal: { value: 'error', type: "string" }
            }
          ]
        }
      }
    }],
  });
});

test('functional TypeScript component w/ named function', () => {
  const code = `
    import { styled } from 'themes'
    import React from 'react'
    import { Root, Image, Fallback } from '@radix-ui/react-avatar'
    import { initials } from 'lib/string'

    interface Props {
      alt?: string
      src?: string | null
      fallback: string
      fontSize?: string
      onClick?: () => void
    }

    export function Avatar(props: Props) {
      const css = { fontSize: props.fontSize || '$small' }

      return (
        <AvatarRoot css={css} onClick={props.onClick}>
          <StyledImage src={props.src} alt={props.alt} />
          <StyledFallback>{initials(props.fallback)}</StyledFallback>
        </AvatarRoot>
      )
    }
  `;

  const result = analyzeReactFile('Avatar.tsx', code);

  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'Avatar.tsx',
    components: [{
      name: 'Avatar',
      props: {
        alt: { type: 'string', optional: true },
        src: { type: 'union', optional: true, types: [{ type: 'string' }, { type: 'null' }] },
        fallback: { type: 'string', optional: false },
        fontSize: { type: 'string', optional: true },
        onClick: { type: 'function', optional: true, parameters: [], returnType: { type: 'void' } },
      },
    }],
  });
});

test('component with generic props', () => {
  const code = `
    interface Props<T> {
      data: T;
      render: (item: T) => React.ReactNode;
    }

    export function GenericComponent<T>({ data, render }: Props<T>) {
      return <div>{render(data)}</div>;
    }
  `;

  const result = analyzeReactFile('GenericComponent.tsx', code);

  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'GenericComponent.tsx',
    components: [{
      name: 'GenericComponent',
      props: {
        "data": {
          "type": "type_reference",
          "typeName": "T",
          "optional": false
        },
        "render": {
          "type": "function",
          "returnType": {
            "type": "type_reference",
            "typeName": "React.ReactNode"
          },
          "parameters": [
            {
              "type": "type_reference",
              "typeName": "T",
              "name": "item"
            }
          ],
          "optional": false
        }
      },
    }],
  });
});

test('component with intersection types', () => {
  const code = `
    interface StyleProps {
      className?: string;
      style?: React.CSSProperties;
    }

    interface ButtonProps {
      onClick: () => void;
      label: string;
    }

    type Props = StyleProps & ButtonProps;

    export const StyledButton: React.FC<Props> = ({ className, style, onClick, label }) => (
      <button className={className} style={style} onClick={onClick}>{label}</button>
    );
  `;

  const result = analyzeReactFile('StyledButton.tsx', code);
  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'StyledButton.tsx',
    components: [{
      name: 'StyledButton',
      props: {
        className: { type: 'string', optional: true },
        style: { type: 'type_reference', typeName: 'React.CSSProperties', optional: true },
        onClick: { type: 'function', optional: false, parameters: [], returnType: { type: 'void' } },
        label: { type: 'string', optional: false },
      },
    }],
  });
});

test('component with default props', () => {
  const code = `
    interface Props {
      name: string;
      greeting?: string;
    }

    export const Greeter: React.FC<Props> = ({ name, greeting = 'Hello' }) => (
      <div>{greeting}, {name}!</div>
    );

    Greeter.defaultProps = {
      greeting: 'Hello'
    };
  `;

  const result = analyzeReactFile('Greeter.tsx', code);
  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'Greeter.tsx',
    components: [{
      name: 'Greeter',
      props: {
        name: { type: 'string', optional: false },
        greeting: { type: 'string', optional: true, defaultValue: '"Hello"' },
      },
      defaultProps: {
        greeting: "Hello"
      }
    }],
  });
});


test('React.memo components', () => {
  const code = `
    interface Props { value: number }
    export const XComponent = React.memo<Props>(({ value }) => <div>{value}</div>);

    // Named function example
    function NamedComponent({ label }: { label: string }) {
      return <span>{label}</span>;
    }
    
    const RenamedComponent = NamedComponent;
    
    export const YNamedComponent = React.memo(RenamedComponent);

    // Arrow function, not inline
    interface ComplexProps {
      items: string[];
      onSelect: (item: string) => void;
    }

    const ComplexComponent = ({ items, onSelect }: ComplexProps) => {
      return (
        <ul>
          {items.map(item => (
            <li key={item} onClick={() => onSelect(item)}>{item}</li>
          ))}
        </ul>
      );
    };

    export const ZComplexComponent = React.memo(ComplexComponent);
  `;

  const result = analyzeReactFile('MemoComponents.tsx', code);

  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'MemoComponents.tsx',
    components: [
      {
        name: 'XComponent',
        props: {
          value: { type: 'number', optional: false },
        },
         wrapperFn: 'React.memo'
      },
      {
        name: 'YNamedComponent',
        props: {
          label: { type: 'string', optional: false },
        },
      },
      {
        name: 'ZComplexComponent',
        props: {
          items: { type: 'array', optional: false, elementType: { type: 'string' } },
          onSelect: { type: 'function', optional: false, parameters: [{ name: 'item', type: 'string' }], returnType: { type: 'void' } },
        },
        
      }
    ],
  });
});


test('component with React hooks', () => {
  const code = `
    export const Counter = () => {
      const [count, setCount] = useState(0);
      useEffect(() => {
        document.title = \`Count: \${count}\`;
      }, [count]);
      return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
    };
  `;

  const result = analyzeReactFile('Counter.tsx', code);
  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'Counter.tsx',
    components: [{
      name: 'Counter',
      props: {},
    }],
  });
});

test('component with prop types', () => {
  const code = `
    export const MyComponent = ({ name, age }) => <div>{name}: {age}</div>;
    MyComponent.propTypes = {
      name: PropTypes.string.isRequired,
      age: PropTypes.number
    };
  `;

  const result = analyzeReactFile('MyComponent.js', code);
  assert.deepStrictEqual(result, {
    type: 'jsx',
    filename: 'MyComponent.js',
    components: [{
      name: 'MyComponent',
      props: {
        name: { type: 'string', optional: false },
        age: { type: 'number', optional: true },
      },
    }],
  });
});

test('forwardRef component', () => {
  const code = `
    export const FancyButton = React.forwardRef<HTMLButtonElement, { label: string }>(
      (props, ref) => <button ref={ref}>{props.label}</button>
    );
  `;

  const result = analyzeReactFile('FancyButton.tsx', code);
  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'FancyButton.tsx',
    components: [{
      name: 'FancyButton',
      wrapperFn: 'React.forwardRef',
      props: {
        label: { type: 'string', optional: false },
      },
    }],
  });
});

test('component with complex default props', () => {
  const code = `
    interface Props {
      config: { theme: string; showHeader?: boolean };
      data?: string[];
    }
    
    export const ComplexDefault = ({ config, data = [] }: Props) => <div />;

    ComplexDefault.defaultProps = {
      config: { theme: 'light', showHeader: true }
    };
  `;

  const result = analyzeReactFile('ComplexDefault.tsx', code);


  assert.deepStrictEqual(result, {
    type: 'tsx',
    filename: 'ComplexDefault.tsx',
    components: [{
      name: 'ComplexDefault',
      defaultProps: {
        config: {
          showHeader: true,
          theme: 'light'
        }
      },
      props: {
        config: {
          type: 'object',
          optional: false,
          "props": {
						"theme": {
							"type": "string",
							"optional": false
						},
						"showHeader": {
							"type": "boolean",
							"optional": true
						}
					}
        },
        data: {
          type: 'array',
          optional: true,
          elementType: { type: 'string' },
          "defaultValue": "[]",
        },
      },
    }],
  });
});

if (require.main === module) {
  const pattern = process.argv[2] || '';
  runTests(pattern);
}
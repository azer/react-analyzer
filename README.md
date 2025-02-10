# react-analyzer

Extract structured information about React components and their props through fast, reliable static analysis through AST parsing.

It's ideal for feeding high level codebase structure to LLMs, building developer tools / visual component editors, performing static analysis, documentation generation etc.

**Included:**
- Supports JSX and TSX files
- Extracts component names, props, and their types
- Supports complex TypeScript types
- Handles React.FC, React.memo, and React.forwardRef
- Detects default props (`({ items = [] })` and prop types (`component.propTypes =`)
- Processes generic types and utility types

**Scope:**

Focused on React component analysis but internally scans all variables, functions, interfaces in given files. Can be extended for other frameworks, etc.

## Install

```bash
npm install @azer/react-analyzer
```

## Usage

```js
import { analyzeReactFile } from 'react-analyzer';

// Analyze a React file
const result = analyzeReactFile('MyComponent.tsx', sourceCode);
```

## Examples

### Simple JSX Component

```ts
export function HelloWorld(props) {
  return <div>{props.user}: {props.message}</div>
}
```

Analysis result:

```ts
{
  type: 'jsx',
  filename: 'HelloWorld.jsx',
  components: [{
    name: 'HelloWorld',
    props: {
      message: { type: 'unknown', optional: false },
      user: { type: 'unknown', optional: false }
    }
  }]
}
```

### Simple TSX Component

```tsx
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
```

Analysis result:

```tsx
{
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
  }]
}
```

### Complex TSX Component

```tsx
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
    <div>
      <h2>Selected: {initialCount}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id} onClick={() => onItemSelect(item)}>
            {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
});

export default ComplexWrappedComponent;
```

Analysis result:

```tsx
{
  type: 'tsx',
  filename: 'ComplexComponent.tsx',
  components: [{
    name: 'ComplexWrappedComponent',
    props: {
      items: {
        type: 'array',
        optional: false,
        elementType: {
          type: 'object',
          props: {
            id: { type: 'string', optional: false },
            name: { type: 'string', optional: false }
          },
          typeName: 'Item'
        }
      },
      onItemSelect: {
        type: 'function',
        optional: false,
        parameters: [{
          type: 'object',
          props: {
            id: { type: 'string', optional: false },
            name: { type: 'string', optional: false }
          },
          typeName: 'Item'
        }],
        returnType: { type: 'void' }
      },
      initialCount: {
        type: 'number',
        optional: true,
        defaultValue: '0'
      }
    },
    wrapperFn: 'React.memo'
  }]
}
```

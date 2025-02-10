# react-analyzer

Extract structured information about React components and their props. You can feed high level codebase structure to LLMs, build developer tools, do static analysis, etc.

**Included:**
- Supports JSX and TSX files
- Extracts component names, props, and their types
- Supports complex TypeScript types
- Handles React.FC, React.memo, and React.forwardRef
- Detects default props (`({ items = [] })` and prop types (`component.propTypes =`)
- Processes generic types and utility types

**Not included:**

It only returns React components. You can easily tweak it for other frameworks or exported variables, functions, interfaces etc.

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

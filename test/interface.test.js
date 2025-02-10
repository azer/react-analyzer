const assert = require('assert');
const { interfaceVisitor, typeAliasVisitor } = require('../dist/interface');
const { test, runTests } = require('./runner');
const { traverseAST } = require('../dist/parser');

test('Simple interface', () => {
  const code = `
    interface SimpleProps {
      name: string;
      age: number;
      isActive?: boolean;
    }
  `;
  const result = runInterfaceVisitor(code, interfaceVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'SimpleProps',
    props: {
      name: { type: 'string', optional: false },
      age: { type: 'number', optional: false },
      isActive: { type: 'boolean', optional: true },
    },
  });
});

test('Nested interface', () => {
  const code = `
    interface Address {
      street: string;
      city: string;
    }

    interface NestedProps {
      name: string;
      address?: Address;
    }
  `;
  const result = runInterfaceVisitor(code, interfaceVisitor);

  assert.deepStrictEqual(result.types[0], {
    name: 'Address',
    props: {
      street: { type: 'string', optional: false },
      city: { type: 'string', optional: false },
    },
  });

  assert.deepStrictEqual(result.types[1], {
    name: 'NestedProps',
    props: {
      name: { type: 'string', optional: false },
      address: { 
        type: 'type_reference',
        typeName: 'Address',
        optional: true,
      },
    },
  });
});

test('Interface with array and union types', () => {
  const code = `
    interface ComplexProps {
      items: string[];
      status: 'pending' | 'completed' | 'failed';
    }
  `;
  const result = runInterfaceVisitor(code, interfaceVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'ComplexProps',
    props: {
      items: { 
        type: 'array', 
        optional: false,
        elementType: { type: 'string' },
      },
      status: { 
        type: 'union', 
        optional: false,
        types: [
          { type: 'literal', literal: { type: 'string', value: 'pending' } },
          { type: 'literal', literal: { type: 'string', value: 'completed' } },
          { type: 'literal', literal: { type: 'string', value: 'failed' } },
        ],
      },
    },
  });
});

test('Simple type alias', () => {
  const code = `
    type SimpleAlias = {
      id: number;
      name: string;
    };
  `;
  const result = runTypeAliasVisitor(code, typeAliasVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'SimpleAlias',
    props: {
      id: { type: 'number', optional: false },
      name: { type: 'string', optional: false },
    },
  });
});

test('Type alias with function type', () => {
  const code = `
    type FunctionAlias = {
      onClick: (id: number) => void;
      getData: () => Promise<string>;
    };
  `;

  const result = runTypeAliasVisitor(code, typeAliasVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'FunctionAlias',
    props: {
      onClick: { 
        type: 'function', 
        optional: false,
        parameters: [{ name: 'id', type: 'number' }],
        returnType: { type: 'void' },
      },
      getData: { 
        type: 'function', 
        optional: false,
        parameters: [],
        returnType: { 
          type: 'type_reference',
          typeName: 'Promise',
        },
      },
    },
  });
});

test('Interface extending another interface', () => {
  const code = `
    interface BaseProps {
      id: number;
    }

    interface ExtendedProps extends BaseProps {
      name: string;
    }
  `;
  const result = runInterfaceVisitor(code, interfaceVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'BaseProps',
    props: {
      id: { type: 'number', optional: false },
    },
  });

  assert.deepStrictEqual(result.types[1], {
    name: 'ExtendedProps',
    props: {
      name: { type: 'string', optional: false },
    },
    extended: ['BaseProps'],
  });
});

test('Intersection types', () => {
  const code = `
    interface A { a: number; }
    interface B { b: string; }
    type AB = A & B;
  `;
  const result = runTypeAliasVisitor(code, typeAliasVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'AB',
    props: {},
    intersectionTypes: ['A', 'B']
  });
});

test('Partial utility type', () => {
  const code = `
    interface User {
      id: number;
      name: string;
    }
    type PartialUser = Partial<User>;
  `;
  const result = runTypeAliasVisitor(code, typeAliasVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'PartialUser',
    props: {},
    partial: 'User'
  });
});

test('Pick utility type', () => {
  const code = `
    interface User {
      id: number;
      name: string;
      email: string;
    }
    type UserName = Pick<User, 'name'>;
  `;
  const result = runTypeAliasVisitor(code, typeAliasVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'UserName',
    props: {},
    pick: {
      typeName: 'User',
      props: ['name']
    }
  });
});

test('Omit utility type', () => {
  const code = `
    interface User {
      id: number;
      name: string;
      email: string;
    }
    type UserWithoutEmail = Omit<User, 'email'>;
  `;
  const result = runTypeAliasVisitor(code, typeAliasVisitor);
  assert.deepStrictEqual(result.types[0], {
    name: 'UserWithoutEmail',
    props: {},
    omit: {
      typeName: 'User',
      props: ['email']
    }
  });
});

if (require.main === module) {
  const pattern = process.argv[2] || '';
  runTests(pattern);
}

function runInterfaceVisitor(code, visitor) {
    const result = {
      components: [],
      typeDefinitions: [],
      exported: [],
      aliases: [],
      types: [],
      functions: [],
    };
  
    const visitors = {
      TSInterfaceDeclaration: (path) => visitor(result, path)
    };
  
    traverseAST('test.tsx', code, visitors);
  
    return result;
  }

  function runTypeAliasVisitor(code, visitor) {
    const result = {
      components: [],
      typeDefinitions: [],
      exported: [],
      aliases: [],
      types: [],
      functions: [],
    };
  
    const visitors = {
      TSTypeAliasDeclaration: (path) => visitor(result, path)
    };
  
    traverseAST('test.tsx', code, visitors);
  
    return result;
  }
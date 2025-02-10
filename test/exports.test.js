const assert = require('assert');
const { namedExportVisitor, defaultExportVisitor } = require('../dist/exports');

const { test, runTests } = require('./runner');
const { traverseAST } = require('../dist/parser');


test('Named exports', () => {
    const code = `
        export const foo = 'bar';
        export function baz() {}
        export class Qux {}
        const quux = 'corge';
        export { quux };

        const grault = 123
        export { grault as garply };
    `;

    const result = runExportVisitor("named_exports.ts", code);
    assert.deepStrictEqual(result.exported, ['foo', 'baz', 'Qux', 'quux', 'garply']);
    assert.strictEqual(result.defaultExport, null);
});

test('Default export', () => {
    const code = `
        const foo = 'bar';
        export default foo;
    `;

    const result = runExportVisitor("default_export.ts", code);

    assert.deepStrictEqual(result.exported, []);
    assert.strictEqual(result.defaultExport, 'foo');
});

test('Mixed named and default exports', () => {
    const code = `
        export const foo = 'bar';
        function baz() {}
        export default baz;
        export const qux = 'quux';
    `;

    const result = runExportVisitor("mixed_exports.ts", code);

    assert.deepStrictEqual(result.exported, ['foo', 'qux']);
    assert.strictEqual(result.defaultExport, 'baz');
});

test('Re-exports', () => {
    const code = `
        export { foo, bar as baz } from './other-module';
        export * from './another-module';
    `;

    const result = runExportVisitor("re_exports.ts", code);

    assert.deepStrictEqual(result.exported, ['foo', 'baz']);
    assert.strictEqual(result.defaultExport, null);
});

test('Anonymous default export', () => {
    const code = `
        export default function() {
            console.log('Hello, world!');
        }
    `;

    const result = runExportVisitor("anonymous_default.ts", code);

    assert.deepStrictEqual(result.exported, []);
    assert.strictEqual(result.defaultExport, 'AnonymousDefault');
});

test('Default named function export', () => {
    const code = `
        export default function namedFunction() {
            console.log('This is a named function');
        }
    `;

    const result = runExportVisitor("default_named_function.ts", code);

    assert.deepStrictEqual(result.exported, []);
    assert.strictEqual(result.defaultExport, 'namedFunction');
});

test('Default const export', () => {
    const code = `
        const foo = {
            key: 'value',
            method() {
                console.log('This is a method');
            }
        };
        export default foo;
    `;

    const result = runExportVisitor("default_const_export.ts", code);

    assert.deepStrictEqual(result.exported, []);
    assert.strictEqual(result.defaultExport, 'foo');
});

if (require.main === module) {
    const pattern = process.argv[2] || '';
    runTests(pattern);
}


function runExportVisitor(filename, code) {
    const result = {
        exported: [],
        defaultExport: null
    };

    const visitors = {
        ExportNamedDeclaration: (path) => namedExportVisitor(result, path),
        ExportDefaultDeclaration: (path) => defaultExportVisitor(result, path)
    };

    traverseAST(filename, code, visitors);

    return result;
}
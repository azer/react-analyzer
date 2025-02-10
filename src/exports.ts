import * as t from '@babel/types';
import { logger } from "./log";
import { Result } from "./types";

const log = logger("exports");

export function namedExportVisitor(result: Result, path: any) {
    if (!t.isExportNamedDeclaration(path.node)) return;

    const node = path.node;
    
    if (node.declaration) {
        result.exported.push(...extractDirectExports(node.declaration));
    } else if (node.specifiers && node.specifiers.length > 0) {
        result.exported.push(...extractNamedExports(node.specifiers));
    }

    log.info(`Found named export(s): ${result.exported.join(', ')}`);
}

/**
 * Extracts identifiers from direct export declarations.
 * @example export function foo() {} // Returns ['foo']
 * @example export const bar = 42, baz = 'hello' // Returns ['bar', 'baz']
 * @example export class MyClass {} // Returns ['MyClass']
 */
function extractDirectExports(declaration: t.Declaration): string[] {
    if (t.isFunctionDeclaration(declaration) && declaration.id) {
        return [declaration.id.name];
    }
    
    if (t.isVariableDeclaration(declaration)) {
        return declaration.declarations
            .filter(d => t.isIdentifier(d.id))
            .map(decl => (decl.id as t.Identifier).name);
    }
    
    if (t.isClassDeclaration(declaration) && declaration.id) {
        return [declaration.id.name];
    }

    return [];
}

/**
 * Extracts identifiers from named export specifiers.
 * @example export { foo, bar as baz } // Returns ['foo', 'baz']
 */
function extractNamedExports(specifiers: t.ExportSpecifier[]): string[] {
    return specifiers
        .filter(specifier => t.isIdentifier(specifier.exported))
        .map(specifier => (specifier.exported as t.Identifier).name);
}

export function defaultExportVisitor(result: Result, path: any) {
    if (!t.isExportDefaultDeclaration(path.node)) return;

    const node = path.node;

    if (t.isFunctionDeclaration(node.declaration) && node.declaration.id) {
        result.defaultExport = node.declaration.id.name;
    } else if (t.isIdentifier(node.declaration)) {
        result.defaultExport = node.declaration.name;
    } else {
        result.defaultExport = 'AnonymousDefault';
    }

    log.info(`Found default export: ${result.defaultExport}`);
}
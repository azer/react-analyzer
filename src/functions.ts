import * as t from '@babel/types';
import { logger } from "./log";
import { Result, FunctionParameterType, PropType, ReactProp, FunctionDeclaration } from "./types";
import { extractPropsFromTypeLiteral } from './object';
import { convertPropTreeToReactProps, extractPropType, scanPropsUsage } from './props';

const log = logger("function");

export function functionVisitor(result: Result, path: any) {
    if (!isModuleLevel(path)) {
        return; // Early return if not at module level
    }

    const node = path.node;

    if (!t.isFunctionDeclaration(node) || !node.id) return;

    const name = node.id.name;
    const genericParams = extractgenericParams(node);
    const args = node.params.map((p) => extractParameterType(result, p, genericParams));

    let returnType: PropType | undefined;

    // Check for declared return type
    if (node.returnType && t.isTSTypeAnnotation(node.returnType)) {
        returnType = extractPropType(result, node.returnType, genericParams);
    } else {
        // If no return type is declared, try to infer it
        returnType = inferReturnType(node.body);
    }

    const row: FunctionDeclaration = { name, returnType, arguments: args }

    if (genericParams.length > 0) {
        row.genericParams = genericParams
    }

    // Scan for props usage if the first argument is named 'props'
    if (args.length === 1 && args[0].type === 'unknown') {
        const propsTree = scanPropsUsage(node, args[0].name);
        const usedProps = convertPropTreeToReactProps(propsTree);

        if (Object.keys(usedProps).length > 0) {
            row.arguments[0] = {
                ...row.arguments[0],
                type: 'object',
                props: usedProps
            };
        }
    }

    result.functions.push(row);

    log.info(`Found function: ${name}`);
}

export function extractParameterType(result: Result, param: t.Identifier | t.RestElement | t.Pattern, genericParams: string[] = []): FunctionParameterType {
    if (t.isIdentifier(param)) {
        const paramName = param.name;

        if (param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)) {
            const typeAnnotation = param.typeAnnotation.typeAnnotation;

             // Handle TSTypeLiteral (inline object type)
            if (t.isTSTypeLiteral(typeAnnotation)) {
                const props = extractPropsFromTypeLiteral(result, typeAnnotation);
                
                return {
                    type: 'object',
                    name: paramName,
                    props: props
                };
            }

            // New logic for basic types
            if (t.isTSStringKeyword(typeAnnotation)) {
                return { type: 'string', name: paramName };
            }

            if (t.isTSNumberKeyword(typeAnnotation)) {
                return { type: 'number', name: paramName };
            }
            
            if (t.isTSBooleanKeyword(typeAnnotation)) {
                return { type: 'boolean', name: paramName };
            }

            if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
                const isGeneric = genericParams.includes(typeAnnotation.typeName.name);

                if (!isGeneric) {
                    return {
                        type: 'type_reference',
                        typeName: typeAnnotation.typeName.name,
                        name: paramName
                    };
                }

                return {
                    type: 'type_reference',
                    typeName: typeAnnotation.typeName.name,
                    name: paramName,
                    isGeneric: true
                };

            }

            if (t.isTSTypeLiteral(typeAnnotation)) {
                const props = extractPropsFromTypeLiteral(result, typeAnnotation);
                return {
                    type: 'object',
                    name: paramName,
                    props: props
                };
            }
        }

        // If we reach here, it's an identifier without a type annotation
        return { type: 'unknown', name: paramName };
    }

    // Handle object pattern parameters (e.g., `{ prop1, prop2 }: Type`)
    if (t.isObjectPattern(param)) {
        const properties: { [key: string]: ReactProp } = {};
        let typeName: string | undefined;


       // Extract property names from the object pattern
       for (const prop of param.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            let defaultValue: string | undefined;

            // Check if the property has a default value (AssignmentPattern)
            if (t.isAssignmentPattern(prop.value)) {
                defaultValue = extractDefaultValue(prop.value.right);
            }

            properties[prop.key.name] = { type: 'unknown', optional: false };
            if (defaultValue !== undefined) {
                properties[prop.key.name].defaultValue = defaultValue;
            }

            log.info("default value:", prop.key.name, defaultValue);
        }
    }

        // If there's no type annotation, return the object with unknown property types
        if (!param.typeAnnotation || !t.isTSTypeAnnotation(param.typeAnnotation)) {
            return {
                type: 'object',
                props: properties
            };
        }

        const typeAnnotation = param.typeAnnotation.typeAnnotation;

        // Handle reference to a named type (e.g., `Props`)
        if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
            typeName = typeAnnotation.typeName.name;
            return {
                type: 'object',
                props: properties,
                typeName
            };
        }

        // Handle inline type literal (e.g., `{ prop1: Type1, prop2: Type2 }`)
        if (t.isTSTypeLiteral(typeAnnotation)) {
            for (const member of typeAnnotation.members) {
                if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
                    const propName = member.key.name;
                    if (member.typeAnnotation) {
                        properties[propName] = {
                            ...extractPropType(result, member.typeAnnotation),
                            optional: !!member.optional
                        };
                    }
                }
            }
            return {
                type: 'object',
                props: properties
            };
        }
    }

    // Handle other parameter types if needed
    return { type: 'unknown', name: 'unknown' };
}

function extractObjectPatternProps(properties: t.ObjectProperty[]): { [key: string]: ReactProp } {
    const props: { [key: string]: ReactProp } = {};
    for (const prop of properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            props[prop.key.name] = { type: 'unknown', optional: false };
        }
    }
    return props;
}

export function inferReturnType(body: t.BlockStatement): PropType {
    // Handle implicit return arrow functions
    if (!t.isBlockStatement(body)) {
        return inferTypeFromExpression(body);
    }

    const returnStatement = findReturnStatement(body);
    if (!returnStatement || !returnStatement.argument) {
        return { type: 'void' };
    }

    return inferTypeFromExpression(returnStatement.argument);
}

function findReturnStatement(node: t.Node): t.ReturnStatement | null {
    if (t.isReturnStatement(node)) {
        return node;
    }

    if (t.isBlockStatement(node)) {
        for (const statement of node.body) {
            const result = findReturnStatement(statement);
            if (result) return result;
        }
    }

    return null;
}

function inferTypeFromExpression(expression: t.Expression): PropType {
    if (t.isJSXElement(expression)) {
        return { type: 'type_reference', typeName: 'JSX.Element' };
    }

    if (t.isObjectExpression(expression)) {
        return { type: 'object' };
    }

    if (t.isArrayExpression(expression)) {
        return { type: 'array', elementType: { type: 'unknown' } };
    }

    if (t.isStringLiteral(expression)) {
        return { type: 'string' };
    }

    if (t.isNumericLiteral(expression)) {
        return { type: 'number' };
    }

    if (t.isBooleanLiteral(expression)) {
        return { type: 'boolean' };
    }

    return { type: 'unknown' };
}

export function isModuleLevel(path: any): boolean {
    // Check if the parent is a Program node
    if (path.parentPath && path.parentPath.isProgram()) {
        return true;
    }

    // Check if it's an export declaration directly under Program
    if (path.parentPath && path.parentPath.isExportNamedDeclaration() && path.parentPath.parentPath && path.parentPath.parentPath.isProgram()) {
        return true;
    }

    // For default exports
    if (path.parentPath && path.parentPath.isExportDefaultDeclaration() && path.parentPath.parentPath && path.parentPath.parentPath.isProgram()) {
        return true;
    }

    return false;
}

function extractgenericParams(node: t.FunctionDeclaration | t.ArrowFunctionExpression): string[] {
    if (node.typeParameters && t.isTSTypeParameterDeclaration(node.typeParameters)) {
        return node.typeParameters.params.map(param => param.name);
    }
    return [];
}


function extractDefaultValue(node: t.Node): string | undefined {
    // Handle string literals: "example"
    if (t.isStringLiteral(node)) {
        return `"${node.value}"`;
    }

    // Handle numeric literals: 42
    if (t.isNumericLiteral(node)) {
        return node.value.toString();
    }

    // Handle boolean literals: true, false
    if (t.isBooleanLiteral(node)) {
        return node.value.toString();
    }

    // Handle object expressions: { key: value }
    if (t.isObjectExpression(node)) {
        const properties = node.properties.map(prop => {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                const key = prop.key.name;
                const value = extractDefaultValue(prop.value);
                return `${key}: ${value}`;
            }
            return '';
        }).filter(Boolean);
        return `{ ${properties.join(', ')} }`;
    }

    // Handle array expressions: [1, 2, 3]
    if (t.isArrayExpression(node)) {
        const elements = node.elements.map(elem => {
            if (elem) {
                return extractDefaultValue(elem);
            }
            return '';
        }).filter(Boolean);
        return `[${elements.join(', ')}]`;
    }

    // Default case: unable to extract value
    return undefined;
}


import * as t from '@babel/types';
import { logger } from "./log";
import { Result, FunctionParameterType, PropType, FunctionDeclaration, ReactProps, Alias } from "./types";
import { extractParameterType, isModuleLevel } from './functions';
import { convertPropTreeToReactProps, extractPropType, scanPropsUsage } from './props';
import { inferReturnType } from './functions';
import { extractPropsFromTypeLiteral } from './object';

const log = logger("variables");

export function variableVisitor(result: Result, path: any) {
    if (!isModuleLevel(path)) {
        return; // Early return if not at module level
    }

    const node = path.node;
    if (!t.isVariableDeclaration(node)) {
        log.info("no variable declaration:", node)
        return;
    }

    node.declarations.forEach((declaration) => {
        if (t.isVariableDeclarator(declaration)) {
            // Extract the wrapper function name
            const wrapperFn = extractWrapperFn(declaration.init);

            let functionToExtract = declaration;
            if (wrapperFn && t.isCallExpression(declaration.init)) {
                const firstArg = declaration.init.arguments[0];
                if (t.isExpression(firstArg)) {
                    // If there's a wrapper, we need to create a new VariableDeclarator
                    // with the inner arrow function as its init
                    functionToExtract = t.variableDeclarator(
                        declaration.id,
                        firstArg
                    );
                } else {
                    log.info("Expected first argument to be an expression, but got:", firstArg.type);
                    return;
                }
            }

            const reactMemoType = detectReactMemoType(declaration)
            log.info("react memo type", reactMemoType)

            const arrowFunction = functionToExtract && extractArrowFunction(result, functionToExtract);

            if (arrowFunction) {
                if (wrapperFn) {
                    log.info("Function has wrapper:", arrowFunction.name, wrapperFn)
                    arrowFunction.wrapperFn = wrapperFn;
                }

                const processedFn = processForwardRef(result, declaration, arrowFunction);
                const withMemo = processMemoType(result, declaration, processedFn)

                // @ts-ignore
                const withScannedProps = scanArrowFunctionProps(withMemo, declaration.init);

                result.functions.push(withScannedProps);
                return;
            }

            const memoTypeName = detectReactMemoType(declaration);
            if (memoTypeName) {
                log.info("memo type:", memoTypeName)
            }

            const alias = extractAlias(declaration);
            if (alias) {
                result.aliases.push(alias);
                return;
            }
        }
    });
}

function scanArrowFunctionProps(func: FunctionDeclaration, node: t.ArrowFunctionExpression): FunctionDeclaration {
    if (func.arguments.length !== 1 || func.arguments[0].type !== 'unknown') {
        return func
    }

    // @ts-ignore
    const propsTree = scanPropsUsage(node, func.arguments[0].name);
    const usedProps = convertPropTreeToReactProps(propsTree);

    if (Object.keys(usedProps).length > 0) {
        return {
            ...func,
            arguments: [
                {
                    ...func.arguments[0],
                    type: 'object',
                    props: usedProps
                }
            ]
        };
    }

    return func
}

function extractWrapperFn(node: t.Expression): string | undefined {
    if (t.isCallExpression(node)) {
        const callee = node.callee;
        if (t.isIdentifier(callee)) {
            return callee.name;
        } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && t.isIdentifier(callee.property)) {
            return `${callee.object.name}.${callee.property.name}`;
        }
    }
    return undefined;
}


function extractArrowFunction(result: Result, declaration: t.VariableDeclarator): FunctionDeclaration | null {
    if (!t.isArrowFunctionExpression(declaration.init)) return null;

    const name = t.isIdentifier(declaration.id) ? declaration.id.name : 'anonymous';

    // Check for React.FC
    const fcTypeName = detectReactFCType(declaration);
    if (fcTypeName) {
        const typeDeclaration = result.types.find(t => t.name === fcTypeName);
        log.info("Found React.FC<> type:", fcTypeName, "Arrow function:", name, result.types)

        const propsArg = extractParameterType(result, declaration.init.params[0])

        // @ts-ignore
        propsArg.typeName = fcTypeName

        if (typeDeclaration) {
            return {
                name,
                arguments: [propsArg],
                returnType: { type: 'type_reference', typeName: 'JSX.Element' }
            };
        }
    }

    const genericParams = extractGenericTypeParams(declaration.init);
    const args = declaration.init.params.map((p) => extractParameterType(result, p, genericParams));

    let returnType: PropType | undefined;

    if (declaration.init.returnType && t.isTSTypeAnnotation(declaration.init.returnType)) {
        returnType = extractPropType(result, declaration.init.returnType, genericParams);
    } else {
        returnType = inferReturnType(declaration.init.body as t.BlockStatement);
    }

    log.info(`Found arrow function: ${name}`);

    return {
        name,
        arguments: args,
        returnType
    };
}

function extractAlias(declaration: t.VariableDeclarator): Alias | null {
    // Early return if not a variable declarator with an identifier
    if (!t.isIdentifier(declaration.id)) return null;

    const name = declaration.id.name;

    // Handle simple alias: const Foo = Bar
    if (t.isIdentifier(declaration.init)) {
        const target = declaration.init.name;
        return { name, target };
    }

    if (t.isCallExpression(declaration.init) && t.isIdentifier(declaration.init.arguments[0])) {
        const target = declaration.init.arguments[0].name;
        const wrapperFn = t.isMemberExpression(declaration.init.callee)
            ? `${(declaration.init.callee.object as t.Identifier).name}.${(declaration.init.callee.property as t.Identifier).name}`
            : (declaration.init.callee as t.Identifier).name;
        return { name, target, wrapperFn };
    }

    // No other alias types are supported for now
    return null;
}

// extract the prop type from React.FC<prop type>
function detectReactFCType(node: t.VariableDeclarator): string | null {
    log.info(`Detecting React.FC type for node: ${node.type}`);

    if (t.isIdentifier(node.id) &&
        node.id.typeAnnotation &&
        t.isTSTypeAnnotation(node.id.typeAnnotation)) {
        const typeAnnotation = node.id.typeAnnotation.typeAnnotation;
        log.info(`Type annotation: ${typeAnnotation.type}`);

        if (t.isTSTypeReference(typeAnnotation) &&
            ((t.isIdentifier(typeAnnotation.typeName) && typeAnnotation.typeName.name === 'FC') ||
             (t.isTSQualifiedName(typeAnnotation.typeName) &&
              t.isIdentifier(typeAnnotation.typeName.left) &&
              typeAnnotation.typeName.left.name === 'React' &&
              t.isIdentifier(typeAnnotation.typeName.right) &&
              typeAnnotation.typeName.right.name === 'FC')) &&
            typeAnnotation.typeParameters &&
            typeAnnotation.typeParameters.params.length > 0) {

            log.info('Found React.FC type reference');
            const propsType = typeAnnotation.typeParameters.params[0];
            log.info(`Props type: ${propsType.type}`);

            if (t.isTSTypeReference(propsType) && t.isIdentifier(propsType.typeName)) {
                log.info(`Detected props type name: ${propsType.typeName.name}`);
                return propsType.typeName.name;
            }
        }
    }

    log.info('No React.FC type detected');
    return null;
}

// Detects if the component uses a named interface for its props
function detectNamedInterfaceProps(param: t.Pattern): string | null {
    if (t.isObjectPattern(param) &&
        param.typeAnnotation &&
        t.isTSTypeAnnotation(param.typeAnnotation)) {
        const typeAnnotation = param.typeAnnotation.typeAnnotation;
        if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
            return typeAnnotation.typeName.name;
        }
    }
    return null;
}

function extractGenericTypeParams(node: t.ArrowFunctionExpression): string[] {
    if (node.typeParameters && t.isTSTypeParameterDeclaration(node.typeParameters)) {
        return node.typeParameters.params.map(param => param.name);
    }
    return [];
}

function detectForwardRefTypes(result: Result, node: t.VariableDeclarator): { refType: PropType, propsType: PropType } | null {
    if (!t.isVariableDeclarator(node) || !t.isCallExpression(node.init)) {
        return null;
    }

    const callExpression = node.init;

    const forwardRef = t.isIdentifier(callExpression.callee) && callExpression.callee.name === 'forwardRef'
    const reactForwardRef = t.isMemberExpression(callExpression.callee) &&
        t.isIdentifier(callExpression.callee.object) &&
        callExpression.callee.object.name === 'React' &&
        t.isIdentifier(callExpression.callee.property) &&
        callExpression.callee.property.name === 'forwardRef'

    // Check if it's a React.forwardRef call
    if (
        forwardRef || reactForwardRef
    ) {
        // Check for type parameters
        if (callExpression.typeParameters && t.isTSTypeParameterInstantiation(callExpression.typeParameters)) {
            const [refType, propsType] = callExpression.typeParameters.params;

            if (t.isTSTypeReference(refType) && t.isIdentifier(refType.typeName)) {
                const refTypeName: PropType = {
                    type: 'type_reference',
                    typeName: refType.typeName.name
                };

                let propsTypeName: PropType;

                if (t.isTSTypeReference(propsType) && t.isIdentifier(propsType.typeName)) {
                    // If props is a type reference (e.g., Props)
                    propsTypeName = {
                        type: 'type_reference',
                        typeName: propsType.typeName.name
                    };
                } else if (t.isTSTypeLiteral(propsType)) {
                    // If props is an inline object type
                    const props: ReactProps = {};
                    propsType.members.forEach((member: any) => {
                        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
                            const propName = member.key.name;
                            if (member.typeAnnotation) {
                                props[propName] = {
                                    ...extractPropType(result, member.typeAnnotation),
                                    optional: !!member.optional
                                };
                            }
                        }
                    });
                    propsTypeName = {
                        type: 'object',
                        props: props
                    };
                } else {
                    // Default to unknown if we can't determine the type
                    propsTypeName = { type: 'unknown' };
                }

                return {
                    refType: refTypeName,
                    propsType: propsTypeName
                };
            }
        }
    }

    return null;
}

function processForwardRef(result: Result, declaration: t.VariableDeclarator, arrowFunction: FunctionDeclaration): FunctionDeclaration {
    // Early return if not a forwardRef component
    if (arrowFunction.wrapperFn !== 'React.forwardRef' && arrowFunction.wrapperFn !== 'forwardRef') {

        return { ...arrowFunction };
    }

    log.info("Processing React.forwardRef<arrowFn>", arrowFunction)

    const forwardRefTypes = detectForwardRefTypes(result, declaration);
    if (!forwardRefTypes) {
        return { ...arrowFunction };
    }

    const [propsArg, refArg] = arrowFunction.arguments;
    const newArrowFunction = { ...arrowFunction };

    // Process ref argument
    newArrowFunction.arguments[1] = {
        ...refArg,
        ...forwardRefTypes.refType
    };

    // Process props argument
    if (propsArg.type === 'object') {
        if (forwardRefTypes.propsType.type === 'type_reference') {
            newArrowFunction.arguments[0] = {
                ...propsArg,
                typeName: forwardRefTypes.propsType.typeName
            };
        } else if (forwardRefTypes.propsType.type === 'object') {
            newArrowFunction.arguments[0] = {
                ...propsArg,
                props: {
                    ...propsArg.props,
                    ...forwardRefTypes.propsType.props
                }
            };
        }
    } else {
        newArrowFunction.arguments[0] = {
            ...propsArg,
            ...forwardRefTypes.propsType
        };
    }

    return newArrowFunction;
}

function processMemoType(result: Result, declaration: t.VariableDeclarator, arrowFunction: FunctionDeclaration): FunctionDeclaration {
    // Early return if not a memo component
    if (arrowFunction.wrapperFn !== 'React.memo' && arrowFunction.wrapperFn !== 'memo') {
        return { ...arrowFunction };
    }


    const { typeName, inlineProps } = detectReactMemoType(declaration);

    log.info("Processing React.memo<arrowFn>", typeName, inlineProps);

    if (!typeName && !inlineProps) {
        return { ...arrowFunction };
    }

    const newArrowFunction = { ...arrowFunction };

    // Process props argument
    if (newArrowFunction.arguments.length > 0) {
        const propsArg = newArrowFunction.arguments[0];
        if (typeName) {
            newArrowFunction.arguments[0] = {
                ...propsArg,
                type: 'type_reference',
                typeName: typeName
            };
        } else if (inlineProps) {
            newArrowFunction.arguments[0] = {
                ...propsArg,
                type: 'object',
                props: inlineProps
            };
        }
    }

    return newArrowFunction;
}

function detectReactMemoType(node: t.VariableDeclarator): { typeName: string | null, inlineProps: ReactProps | null } {
    if (!t.isCallExpression(node.init)) {
        return { typeName: null, inlineProps: null };
    }

    const callExpression = node.init;

    // Check if it's React.memo or memo
    const isMemo =
        (t.isIdentifier(callExpression.callee) && callExpression.callee.name === 'memo') ||
        (t.isMemberExpression(callExpression.callee) &&
            t.isIdentifier(callExpression.callee.object) &&
            callExpression.callee.object.name === 'React' &&
            t.isIdentifier(callExpression.callee.property) &&
            callExpression.callee.property.name === 'memo');

    if (!isMemo) {
        return { typeName: null, inlineProps: null };
    }

    // Check for type parameters
    if (callExpression.typeParameters && t.isTSTypeParameterInstantiation(callExpression.typeParameters)) {
        const [propsType] = callExpression.typeParameters.params;

        if (t.isTSTypeReference(propsType) && t.isIdentifier(propsType.typeName)) {
            return { typeName: propsType.typeName.name, inlineProps: null };
        } else if (t.isTSTypeLiteral(propsType)) {
            const inlineProps = extractPropsFromTypeLiteral({} as Result, propsType);
            return { typeName: null, inlineProps };
        }
    }

    return { typeName: null, inlineProps: null };
}
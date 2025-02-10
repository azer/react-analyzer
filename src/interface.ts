import * as t from '@babel/types';
import { extractPropType, getFullQualifiedName } from "./props";
import { logger } from "./log";
import { ReactProps, Result, TypeDeclaration } from "./types";

const log = logger("interface")

export function interfaceVisitor(result: Result, path: any) {
    const props = extractPropsFromInterface(result, path.node);
    const row: TypeDeclaration = {
        name: path.node.id.name,
        props,
    }


    const ext = getExtendedInterfaceNames(path.node)
    if (ext.length > 0) {
        row.extended = ext
    }

    result.types.push(row);

    log.info(`Found interface: ${path.node.id.name}`);
}

export function typeAliasVisitor(result: Result, path: any) {
    const props = extractPropsFromTypeAlias(result, path.node);

    result.types.push({
        name: path.node.id.name,
        props,
        ...utilityTypeVisitor(result, path.node.typeAnnotation)
    });

    log.info(`Found type alias: ${path.node.id.name}`);
}

function utilityTypeVisitor(result: Result, typeAnnotation: t.TSType): Partial<TypeDeclaration> {
    // Handle intersection types: A & B
    if (t.isTSIntersectionType(typeAnnotation)) {
        return {
            intersectionTypes: typeAnnotation.types
                .filter(t => t.type === 'TSTypeReference')
                .map(t => getFullQualifiedName((t as t.TSTypeReference).typeName))
        };
    }

    // Handle utility types (e.g., Partial)
    if (!t.isTSTypeReference(typeAnnotation)) {
        return {};
    }

    const typeRef = typeAnnotation;
    if (!t.isIdentifier(typeRef.typeName)) {
        return {};
    }

    // Handle Partial<Foo>
    if (t.isIdentifier(typeRef.typeName) && typeRef.typeName.name === 'Partial') {
        if (typeRef.typeParameters?.params.length === 1) {
            const partialType = typeRef.typeParameters.params[0];
            if (t.isTSTypeReference(partialType) && t.isIdentifier(partialType.typeName)) {
                return { partial: partialType.typeName.name };
            }
        }
    }

     // Handle Pick<User, 'name'>
     if (typeRef.typeName.name === 'Pick') {
        if (typeRef.typeParameters?.params.length === 2) {
            const [pickType, pickProps] = typeRef.typeParameters.params;
            if (t.isTSTypeReference(pickType) && t.isIdentifier(pickType.typeName) &&
                t.isTSLiteralType(pickProps) && t.isStringLiteral(pickProps.literal)) {
                return {
                    pick: {
                        typeName: pickType.typeName.name,
                        props: [pickProps.literal.value]
                    }
                };
            }
        }
    }

     // Handle Omit<User, 'email'>
     if (typeRef.typeName.name === 'Omit') {
        if (typeRef.typeParameters?.params.length === 2) {
            const [omitType, omitProps] = typeRef.typeParameters.params;
            if (t.isTSTypeReference(omitType) && t.isIdentifier(omitType.typeName) &&
                t.isTSLiteralType(omitProps) && t.isStringLiteral(omitProps.literal)) {
                return {
                    omit: {
                        typeName: omitType.typeName.name,
                        props: [omitProps.literal.value]
                    }
                };
            }
        }
    }

    return {};
}

function extractPropsFromInterface(result: Result, node: t.TSInterfaceDeclaration): ReactProps {
    const props: ReactProps = {};

    for (const member of node.body.body) {
        if (!t.isTSPropertySignature(member)) continue;
        if (!t.isIdentifier(member.key)) continue;

        const propName = member.key.name;
        if (!member.typeAnnotation) continue;

        const propType = extractPropType(result, member.typeAnnotation);

        props[propName] = {
            ...propType,
            optional: !!member.optional
        };
    }

    return props
}

export function extractPropsFromTypeAlias(result: Result, node: t.TSTypeAliasDeclaration): ReactProps {
    const props: ReactProps = {};

    if (t.isTSTypeLiteral(node.typeAnnotation)) {
        for (const member of node.typeAnnotation.members) {
            if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
                const propName = member.key.name;
                if (member.typeAnnotation) {
                    props[propName] = {
                        ...extractPropType(result, member.typeAnnotation),
                        optional: !!member.optional
                    };
                }
            }
        }
    }

    return props
}

function getExtendedInterfaceNames(node: t.TSInterfaceDeclaration): string[] {
    const extendedNames: string[] = [];

    if (node.extends) {
        for (const extend of node.extends) {
            if (t.isTSExpressionWithTypeArguments(extend) && t.isIdentifier(extend.expression)) {
                extendedNames.push(extend.expression.name);
            }
        }
    }

    return extendedNames;
}
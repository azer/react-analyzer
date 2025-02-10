import { logger } from "./log";
import * as t from '@babel/types';
import { FunctionParameterType, PropType, ReactProps, ReactPropType, Result } from "./types";
import { isModuleLevel } from "./functions";

const log = logger("props")


export function defaultPropsVisitor(result: Result, path: any) {
    if (!isModuleLevel(path)) {
        return; // Early return if not at module level
    }

    const node = path.node;

    // defaultProps
    if (
        t.isExpressionStatement(node) &&
        t.isAssignmentExpression(node.expression) &&
        t.isMemberExpression(node.expression.left) &&
        t.isIdentifier(node.expression.left.object) &&
        t.isIdentifier(node.expression.left.property) &&
        node.expression.left.property.name === 'defaultProps'
    ) {
        const componentName = node.expression.left.object.name;
        const defaultPropsObject = node.expression.right;

        if (t.isObjectExpression(defaultPropsObject)) {
            const defaultProps: Record<string, any> = {};

            defaultPropsObject.properties.forEach(prop => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    defaultProps[prop.key.name] = extractDefaultValue(prop.value);
                }
            });

            log.info(`Found defaultProps for ${componentName}:`, defaultProps);

            const fn = result.functions.find(fn => fn.name === componentName)

            // Store the defaultProps in the result
            if (defaultProps) {
                fn.defaultProps = defaultProps
            }
        }
    }

    // propTypes
    if (
        t.isExpressionStatement(node) &&
        t.isAssignmentExpression(node.expression) &&
        t.isMemberExpression(node.expression.left) &&
        t.isIdentifier(node.expression.left.object) &&
        t.isIdentifier(node.expression.left.property) &&
        node.expression.left.property.name === 'propTypes'
    ) {
        const componentName = node.expression.left.object.name;
        const propTypesObject = node.expression.right;

        if (t.isObjectExpression(propTypesObject)) {
            const propTypes: Record<string, ReactPropType> = {};

            log.info(">>", JSON.stringify(propTypesObject))

            propTypesObject.properties.forEach(prop => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    // @ts-ignore
                    propTypes[prop.key.name] = extractPropTypeDefinition(prop.value);
                } else {
                    log.info("nooo", prop)
                }
            });

            log.info(`Found propTypes for ${componentName}:`, propTypes);

            const fn = result.functions.find(fn => fn.name === componentName);

            log.info("prop types:", propTypes)

            // Store the propTypes in the result
            if (fn && Object.keys(propTypes).length > 0) {
                fn.propTypes = propTypes;
            }
        }
    }
}

function extractDefaultValue(node: t.Node): any {
    if (t.isExpression(node)) {
        if (t.isStringLiteral(node)) return node.value;
        if (t.isNumericLiteral(node)) return node.value;
        if (t.isBooleanLiteral(node)) return node.value;
        if (t.isObjectExpression(node)) {
            const obj: Record<string, any> = {};
            node.properties.forEach(prop => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    obj[prop.key.name] = extractDefaultValue(prop.value);
                }
            });
            return obj;
        }
        if (t.isArrayExpression(node)) {
            return node.elements.map(elem => elem ? extractDefaultValue(elem) : null);
        }
    }
    return undefined;
}

// Recursively determines prop type from TypeScript type annotations
// 
// > string[] 
// { type: 'array', elementType: { type: 'string' } }
// > (x: number) => void 
// { type: 'function', returnType: { type: 'void' }, parameters: [{ type: 'number' }] }
export function extractPropType(result: Result, typeAnnotation: t.TSTypeAnnotation | null, genericParams: string[] = []): PropType {
    log.info(`Extracting prop type from:`, JSON.stringify(typeAnnotation));
  
    if (!typeAnnotation || !t.isTSTypeAnnotation(typeAnnotation)) {
      log.info("Unknown type: typeAnnotation is null or not TSTypeAnnotation");
      return { type: 'unknown' };
    }
  
    const type = typeAnnotation.typeAnnotation;
    log.info(`Type annotation: ${type.type}`);
    
    if (t.isTSStringKeyword(type)) return { type: 'string' };
    if (t.isTSNumberKeyword(type)) return { type: 'number' };
    if (t.isTSBooleanKeyword(type)) return { type: 'boolean' };
    //if (t.isTSObjectKeyword(type)) return { type: 'object' };
    if (t.isTSAnyKeyword(type)) return { type: 'any' };
    if (t.isTSVoidKeyword(type)) return { type: 'void' };
    if (t.isTSNullKeyword(type)) return { type: 'null' };  // Add this line
  
    if (t.isTSArrayType(type)) {
      return { 
        type: 'array', 
        elementType: extractPropType(result, { type: "TSTypeAnnotation", typeAnnotation: type.elementType })
      };
    }
    
    if (t.isTSFunctionType(type)) {
      return {
        type: 'function',
        returnType: extractPropType(result, type.typeAnnotation),
        parameters: type.parameters.map(param => extractFunctionParameterType(result, param))
      };
    }
    
    if (t.isTSUnionType(type)) {
      return { 
        type: 'union', 
        types: type.types.map(t => extractPropType(result, { type: "TSTypeAnnotation", typeAnnotation: t }))
      };
    }
  
    if (t.isTSLiteralType(type)) {
      if (t.isStringLiteral(type.literal)) return { type: 'literal', literal: { type: "string", value: type.literal.value } };
      if (t.isNumericLiteral(type.literal)) return { type: 'literal', literal: { type: "number", value: type.literal.value }};
      if (t.isBooleanLiteral(type.literal)) return { type: 'literal', literal: { type: "boolean", value: type.literal.value } };
    }
  
    if (t.isTSTypeReference(type)) {
      log.info("TS Type reference:", JSON.stringify(type))
  
      if (t.isIdentifier(type.typeName)) {
        log.info("TS Type reference (identifier):", type.typeName.name, JSON.stringify(type))
  
        // Check if it's a generic type parameter
        if (!genericParams.includes(type.typeName.name)) {
          return { 
            type: 'type_reference', 
            typeName: type.typeName.name
          };
        }
  
        return { 
          type: 'type_reference', 
          typeName: type.typeName.name,
          isGeneric: true
        };
      }
      
      if (t.isTSQualifiedName(type.typeName)) {
        const qualifiedName = getFullQualifiedName(type.typeName);
        log.info("TS Qualified Name:", qualifiedName);
        
        return { type: 'type_reference', typeName: qualifiedName };
      }
    }
  
    if (t.isTSTypeReference(type)) {
      if (t.isIdentifier(type.typeName)) {
        return { type: 'type_reference', typeName: type.typeName.name };
      }
    }
  
  
    if (t.isTSTypeLiteral(type)) {
      const props: ReactProps = {};
      for (const member of type.members) {
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
  
      return { type: 'object', props };
    }
  
    log.error("Can not extract property type:", type)
    
    return { type: 'unknown' };
  }

  function extractFunctionParameterType(result: Result, param: t.Identifier | t.RestElement | t.ArrayPattern | t.ObjectPattern): FunctionParameterType {
    let name = '';
    let paramType: PropType = { type: 'unknown' };
  
    if (t.isIdentifier(param)) {
      name = param.name;
      if (param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)) {
        paramType = extractPropType(result, param.typeAnnotation);
      }
    } else if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
      name = param.argument.name;
      if (param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)) {
        paramType = {
          type: 'array',
          elementType: extractPropType(result, param.typeAnnotation)
        };
      }
    } else if (t.isArrayPattern(param)) {
      name = 'arrayParam'; // You might want to generate a more meaningful name
      paramType = { type: 'array', elementType: { type: 'unknown' } };
    } else if (t.isObjectPattern(param)) {
      name = 'objectParam'; // You might want to generate a more meaningful name
      paramType = { type: 'object' };
    }
  
    return {
      ...paramType,
      name
    };
  }

  export function getFullQualifiedName(node: t.TSQualifiedName | t.Identifier): string {
    if (t.isIdentifier(node)) {
      return node.name;
    }
  
    const parts: string[] = [];
    let current: t.TSQualifiedName | t.Identifier = node;
  
    while (t.isTSQualifiedName(current)) {
      parts.unshift(current.right.name);
      current = current.left;
    }
  
    if (t.isIdentifier(current)) {
      parts.unshift(current.name);
    }
  
    return parts.join('.');
}

function extractPropTypeDefinition(node: t.Expression): ReactPropType {
    if (t.isMemberExpression(node)) {
        return extractPropTypeFromMemberExpression(node);
    }

    if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
        return extractPropTypeFromMemberExpression(node.callee);
    }

    return { type: 'unknown', isRequired: false };
}

function extractPropTypeFromMemberExpression(node: t.MemberExpression): ReactPropType {
    let type = 'unknown';
    let isRequired = false;

    if (t.isIdentifier(node.object) && node.object.name === 'PropTypes') {
        if (t.isIdentifier(node.property)) {
            type = node.property.name.toLowerCase();
        }
    } else if (t.isMemberExpression(node.object) && 
               t.isIdentifier(node.object.object) && 
               node.object.object.name === 'PropTypes') {
        if (t.isIdentifier(node.object.property)) {
            type = node.object.property.name.toLowerCase();
        }
        if (t.isIdentifier(node.property) && node.property.name === 'isRequired') {
            isRequired = true;
        }
    }

    return { type, isRequired };
}


interface PropTree {
    [key: string]: PropTree | null;
}

export function scanPropsUsage(node: t.FunctionDeclaration, propsName: string): PropTree {
    const propsTree: PropTree = {};

    function visit(node: t.Node) {
        if (t.isMemberExpression(node)) {
            let current: t.Expression = node;
            const path: string[] = [];

            while (t.isMemberExpression(current)) {
                if (t.isIdentifier(current.property)) {
                    path.unshift(current.property.name);
                }
                current = current.object;
            }

            if (t.isIdentifier(current) && current.name === propsName) {
                let currentTree = propsTree;
                path.forEach((prop, index) => {
                    if (!currentTree[prop]) {
                        currentTree[prop] = index === path.length - 1 ? null : {};
                    }
                    if (currentTree[prop] !== null) {
                        currentTree = currentTree[prop] as PropTree;
                    }
                });
            }
        }

        // Recursively visit all child nodes
        for (const key in node) {
            const child = (node as any)[key];
            if (Array.isArray(child)) {
                child.forEach(visit);
            } else if (child && typeof child === 'object' && 'type' in child) {
                visit(child);
            }
        }
    }

    visit(node.body);

    return propsTree;
}

export function convertPropTreeToReactProps(tree: PropTree): ReactProps {
    const props: ReactProps = {};

    function convert(subtree: PropTree, prefix: string = '') {
        for (const [key, value] of Object.entries(subtree)) {
            const propName = prefix ? `${prefix}.${key}` : key;
            if (value !== null) {
                props[propName] = {
                    type: 'object',
                    props: convertPropTreeToReactProps(value),
                    optional: false
                };
            } else {
                props[propName] = { type: 'unknown', optional: false };
            }
        }
    }

    convert(tree);
    return props;
}
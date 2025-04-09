export * from "./types";
import path from "path";
import {
  ReactProps,
  PropType,
  ReactFile,
  Result,
  ReactComponent,
  FunctionDeclaration,
  ReactProp,
  FunctionParameterType,
  TypeDeclaration,
} from "./types";
import { interfaceVisitor, typeAliasVisitor } from "./interface";
import { defaultExportVisitor, namedExportVisitor } from "./exports";
import { variableVisitor } from "./variables";
import { functionVisitor } from "./functions";
import { traverseAST } from "./parser";
import { logger } from "./log";
import {
  convertPropTreeToReactProps,
  defaultPropsVisitor,
  scanPropsUsage,
} from "./props";

const log = logger("index");

export function analyzeReactFile(filename: string, code: string): ReactFile {
  const fileExtension = getFileExtension(filename).toLowerCase();
  const type = fileExtension === ".tsx" ? "tsx" : "jsx";

  let result: Result = {
    types: [],
    aliases: [],
    components: [],
    typeDefinitions: [],
    exported: [],
    functions: [],
    defaultExport: null,
  };

  const visitors = {
    TSInterfaceDeclaration(path: any) {
      interfaceVisitor(result, path);
    },
    TSTypeAliasDeclaration(path: any) {
      typeAliasVisitor(result, path);
    },
    ExportNamedDeclaration(path: any) {
      namedExportVisitor(result, path);
    },
    ExportDefaultDeclaration(path: any) {
      defaultExportVisitor(result, path);
    },
    VariableDeclaration(path: any) {
      variableVisitor(result, path);
    },
    FunctionDeclaration(path: any) {
      functionVisitor(result, path);
    },
    ExpressionStatement(path: any) {
      defaultPropsVisitor(result, path);
    },
  };

  traverseAST(filename, code, visitors);

  result.types = result.types.map((type) => resolveUtilityType(result, type));
  result.types = result.types.map((type) => resolveType(result, type));
  result.functions = result.functions.map((func) =>
    resolveFunction(result, func),
  );

  for (const alias of result.aliases) {
    if (result.functions.find((fn) => fn.name === alias.name)) continue;

    const targetFn = result.functions.find((fn) => fn.name === alias.target);

    if (targetFn) {
      result.functions.push({
        ...targetFn,
        name: alias.name,
      });
    }
  }

  return {
    type,
    filename,
    components: extractComponents(result),
  };
}

function extractComponents(result: Result): ReactComponent[] {
  return result.functions
    .filter((func) => isReactComponent(result, func))
    .map((func) => createReactComponent(result, func));
}

function isReactComponent(result: Result, func: FunctionDeclaration): boolean {
  return (
    /^[A-Z]/.test(func.name) &&
    func.arguments.length < 3 &&
    result.exported.includes(func.name)
  );
}

function createReactComponent(
  result: Result,
  func: FunctionDeclaration,
): ReactComponent {
  // @ts-ignore
  const props = func.arguments[0] ? func.arguments[0].props || {} : {};
  const component: ReactComponent = {
    name: func.name,
    props,
  };

  // Merge props from propTypes, if available
  if (func.propTypes) {
    for (const [propName, propType] of Object.entries(func.propTypes)) {
      component.props[propName] = {
        ...component.props[propName],
        // @ts-ignore
        type: propType.type,
        optional: !propType.isRequired,
      };
    }
  }

  if (func.wrapperFn) {
    component.wrapperFn = func.wrapperFn;
  }

  if (func.defaultProps) {
    component.defaultProps = func.defaultProps;
  }

  return component;
}

function resolveUtilityType(
  result: Result,
  type: TypeDeclaration,
): TypeDeclaration {
  // Handle intersection types
  if (type.intersectionTypes) {
    const mergedProps: ReactProps = {};
    type.intersectionTypes.forEach((typeName) => {
      const intersectedType = result.types.find((t) => t.name === typeName);
      if (intersectedType) {
        Object.assign(mergedProps, intersectedType.props);
      }
    });
    return { ...type, props: mergedProps, intersectionTypes: undefined };
  }

  // Handle Partial<T>
  if (type.partial) {
    const baseType = result.types.find((t) => t.name === type.partial);
    if (baseType) {
      const partialProps: ReactProps = {};
      Object.entries(baseType.props).forEach(([key, value]) => {
        partialProps[key] = { ...value, optional: true };
      });
      return { ...type, props: partialProps, partial: undefined };
    }
  }

  // Handle Pick<T, K>
  if (type.pick) {
    const baseType = result.types.find((t) => t.name === type.pick.typeName);
    if (baseType) {
      const pickedProps: ReactProps = {};
      type.pick.props.forEach((prop) => {
        if (prop in baseType.props) {
          pickedProps[prop] = baseType.props[prop];
        }
      });
      return { ...type, props: pickedProps, pick: undefined };
    }
  }

  // Handle Omit<T, K>
  if (type.omit) {
    const baseType = result.types.find((t) => t.name === type.omit.typeName);
    if (baseType) {
      const omittedProps: ReactProps = { ...baseType.props };
      type.omit.props.forEach((prop) => {
        delete omittedProps[prop];
      });
      return { ...type, props: omittedProps, omit: undefined };
    }
  }

  return type;
}

function resolveReferences(
  result: Result,
  obj: any,
  seenTypes: Set<string> = new Set(),
): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  // Handle type references
  if (obj.type === "type_reference") {
    if (seenTypes.has(obj.typeName)) {
      return { ...obj, circular: true };
    }
    const referencedType = result.types.find((t) => t.name === obj.typeName);
    if (referencedType) {
      seenTypes.add(obj.typeName);
      const resolvedProps = resolveReferences(
        result,
        referencedType.props,
        new Set(seenTypes),
      );
      return !obj.optional
        ? {
            type: "object",
            props: resolvedProps,
            typeName: obj.typeName,
          }
        : {
            type: "object",
            props: resolvedProps,
            typeName: obj.typeName, // Preserve the original typeName
            optional: obj.optional,
          };
    }
    return obj;
  }

  // Handle objects with typeName and props (destructured objects)
  if (obj.typeName && obj.type === "object" && obj.props) {
    const referencedType = result.types.find((t) => t.name === obj.typeName);
    if (referencedType) {
      const resolvedProps: any = {};

      for (const [key, value] of Object.entries(obj.props)) {
        if (typeof value === "object" && value !== null) {
          resolvedProps[key] = {
            ...value,
            ...referencedType.props[key],
          };
        } else {
          resolvedProps[key] = referencedType.props[key] || value;
        }
      }

      return {
        ...obj,
        props: resolvedProps,
      };
    }
  }

  // Recursively resolve all properties
  const resolved: any = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    resolved[key] = resolveReferences(result, value, new Set(seenTypes));
  }

  // Preserve typeName if it exists in the original object
  if (obj.typeName) {
    resolved.typeName = obj.typeName;
  }

  return resolved;
}

export function resolveType(
  result: Result,
  type: TypeDeclaration,
): TypeDeclaration {
  return resolveReferences(result, type);
}

export function resolveFunction(
  result: Result,
  func: FunctionDeclaration,
): FunctionDeclaration {
  return resolveReferences(result, func);
}

/**
 * Gets the file extension from a filename
 * @param filename The name of the file
 * @returns The file extension (including the dot)
 */
function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");
  return lastDotIndex === -1 ? "" : filename.slice(lastDotIndex);
}

import * as t from '@babel/types';
import { Result } from "./types";

export function findTypeByName(result: Result, typeName: string): {
  name: string;
  node: t.TSTypeAliasDeclaration | t.TSInterfaceDeclaration;
  // Add other properties as needed
} {
    return result.typeDefinitions.find(def => def.name === typeName);
}

export function findComponentByName(result: Result, componentName: string) {
    const component = result.components.find(def => def.name === componentName);
    if (component) {
        return component
    }

    const aliasComp = result.aliases.find(alias => alias.name === componentName)
    if (aliasComp) {
        return findComponentByName(result, aliasComp.target)
    }
}
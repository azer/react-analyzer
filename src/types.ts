import * as t from '@babel/types';

export interface ReactFile {
  type: "jsx" | "tsx";
  filename: string;
  components: ReactComponent[];
}

export interface ReactComponent {
  name: string,
  props: ReactProps,
  wrapperFn?: string
  defaultProps?: Record<string, any>
}

export interface ReactProps {
  [propName: string]: ReactProp;
}

export type PropType =
  | { type: 'string' }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'object', props?: { [propName: string]: ReactProp }, typeName?: string }
  | { type: 'any' }
  | { type: 'unknown' }
  | { type: 'void' }
  | { type: 'null' }
  | { type: 'ReactNode' }
  | { type: 'ReactElement' }
  | { type: "type_reference", typeName: string, isGeneric?: boolean }
  | { type: 'array'; elementType: PropType }
  | { type: 'function'; returnType: PropType; parameters: FunctionParameterType[] }
  | { type: 'union'; types: PropType[] }
  | { type: 'literal'; literal: { value: any, type: string } };

export type FunctionParameterType = PropType & {
  name?: string
}

export type ReactProp = PropType & {
  optional: boolean;
  defaultValue?: any;
}

export type Result = {
  components: ReactComponent[];
  typeDefinitions: { name: string; node: t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration }[];
  exported: string[]
  aliases: Alias[]
  types: TypeDeclaration[]
  functions: FunctionDeclaration[]
  defaultExport: string
};

export interface Alias {
  name: string,
  target: string,
  wrapperFn?: string
}

export interface TypeDeclaration {
  name: string,
  props: ReactProps,
  extended?: string[]
  intersectionTypes?: string[]
  partial?: string
  pick?: {
    typeName: string,
    props: string[]
  },
  omit?: {
    typeName: string,
    props: string[]
  },
}


export interface ReactPropType {
  type: string;
  isRequired?: boolean;
}

export interface FunctionDeclaration {
  name: string,
  arguments: FunctionParameterType[]
  returnType?: PropType,
  wrapperFn?: string,
  genericParams?: string[],
  defaultProps?: Record<string, any>
  propTypes?: Record<string, ReactPropType>;
}
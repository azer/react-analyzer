import * as t from '@babel/types';

import { extractPropType } from "./props";
import { ReactProps, Result } from "./types";

export function extractPropsFromTypeLiteral(result: Result, typeLiteral: t.TSTypeLiteral): ReactProps {
    const props: ReactProps = {};

    for (const member of typeLiteral.members) {
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

    return props;
}
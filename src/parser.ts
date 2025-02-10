import * as Babel from '@babel/standalone';
import * as t from '@babel/types';
import { logger } from './log';

const log = logger("parser");

export function parseCode(code: string): t.File {
  try {
    const result = Babel.transform(code, {
      presets: ['typescript', 'react'],
      filename: 'virtual.tsx',
      ast: true,
      code: false,
    });

    if (!result.ast) {
      throw new Error('AST not generated');
    }

    log.info("Code parsed successfully");
    return result.ast;
  } catch (error) {
    log.error("Failed to parse code", error);
    throw error;
  }
}

const presets = {
  "tsx": ["typescript", "react"],
  "ts": ["typescript"]
}

export function traverseAST(filename: string, code: string, visitors: object) {
  log.info("Traversing AST");
  
  const plugin = function() {
    return {
      visitor: visitors
    };
  };

  const fileExtension = filename.split('.').pop()?.toLowerCase();

  log.info("Transform %s code:", fileExtension)

  Babel.transform(code, {
    plugins: [plugin],
    presets: presets[fileExtension] || ['react'],
    filename: filename,
  });

  log.info("AST traversal complete");
}
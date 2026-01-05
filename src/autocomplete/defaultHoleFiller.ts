import { HoleFiller, PromptArgs, AutoCompleteContext } from "./holeFiller";
import { LSPDefinition } from "../types/lsp";
import * as vscode from 'vscode';

// Source: continue/core/autocomplete/templating/AutocompleteTemplate.ts (holeFillerTemplate)
export class DefaultHoleFiller implements HoleFiller {
  systemPrompt(): string {
    // From https://github.com/VictorTaelin/AI-scripts
    return `You are a HOLE FILLER. You are provided with a file containing holes, formatted as '{{HOLE_NAME}}'.
		Your TASK is to complete with a string to replace this hole with, inside a <COMPLETION/> XML tag, including context-aware indentation, if needed.
		All completions MUST be truthful, accurate, well-written and correct.
## EXAMPLE QUERY:

<QUERY>
function sum_evens(lim) {
  var sum = 0;
  for (var i = 0; i < lim; ++i) {
    {{FILL_HERE}}
  }
  return sum;
}
</QUERY>

TASK: Fill the {{FILL_HERE}} hole.

## CORRECT COMPLETION

<COMPLETION>if (i % 2 === 0) {
      sum += i;
    }</COMPLETION>

## EXAMPLE QUERY:

<QUERY>
def sum_list(lst):
  total = 0
  for x in lst:
  {{FILL_HERE}}
  return total

print sum_list([1, 2, 3])
</QUERY>

## CORRECT COMPLETION:

<COMPLETION>  total += x</COMPLETION>

## EXAMPLE QUERY:

<QUERY>
// data Tree a = Node (Tree a) (Tree a) | Leaf a

// sum :: Tree Int -> Int
// sum (Node lft rgt) = sum lft + sum rgt
// sum (Leaf val)     = val

// convert to TypeScript:
{{FILL_HERE}}
</QUERY>

## CORRECT COMPLETION:

<COMPLETION>type Tree<T>
  = {$:"Node", lft: Tree<T>, rgt: Tree<T>}
  | {$:"Leaf", val: T};

function sum(tree: Tree<number>): number {
  switch (tree.$) {
    case "Node":
      return sum(tree.lft) + sum(tree.rgt);
    case "Leaf":
      return tree.val;
  }
}</COMPLETION>

## EXAMPLE QUERY:

The 5th {{FILL_HERE}} is Jupiter.

## CORRECT COMPLETION:

<COMPLETION>planet from the Sun</COMPLETION>

## EXAMPLE QUERY:

function hypothenuse(a, b) {
  return Math.sqrt({{FILL_HERE}}b ** 2);
}

## CORRECT COMPLETION:

<COMPLETION>a ** 2 + </COMPLETION>
`;
  }

  userPrompt(ctx: AutoCompleteContext): string {
    let context = '';
    if (ctx.filename !== '') {
      context += `// Filename: "${ctx.filename}" \n`;
    }
    if (ctx.language !== '') {
      context += `// Programming language: "${ctx.language}" \n`;
    }

    // Add LSP context if available
    if (ctx.lspContext && ctx.lspContext.definitions.length > 0) {
      context += this.formatLSPContext(ctx.lspContext.definitions);
    }

    return `${context}<QUERY>\n${ctx.textBeforeCursor}{{FILL_HERE}}${ctx.textAfterCursor}\n</QUERY>\nTASK: Fill the {{FILL_HERE}} hole. Answer only with the CORRECT completion, and NOTHING ELSE. Do it now.\n<COMPLETION>`;
  }

  private formatLSPContext(definitions: LSPDefinition[]): string {
    if (definitions.length === 0) {return '';}

    let context = '// Available definitions and symbols:\n';
    
    // Group definitions by type for better organization
    const functions = definitions.filter(d => [vscode.SymbolKind.Function, vscode.SymbolKind.Method].includes(d.kind));
    const classes = definitions.filter(d => [vscode.SymbolKind.Class, vscode.SymbolKind.Interface].includes(d.kind));
    const variables = definitions.filter(d => [vscode.SymbolKind.Variable, vscode.SymbolKind.Property, vscode.SymbolKind.Field].includes(d.kind));
    const types = definitions.filter(d => [vscode.SymbolKind.Enum, vscode.SymbolKind.Struct, vscode.SymbolKind.TypeParameter].includes(d.kind));

    // Add functions and methods
    if (functions.length > 0) {
      context += '// Functions/Methods:\n';
      functions.slice(0, 10).forEach(def => {
        const signature = this.formatDefinitionSignature(def);
        context += `//   ${signature}\n`;
      });
    }

    // Add classes and interfaces
    if (classes.length > 0) {
      context += '// Classes/Interfaces:\n';
      classes.slice(0, 8).forEach(def => {
        const signature = this.formatDefinitionSignature(def);
        context += `//   ${signature}\n`;
      });
    }

    // Add variables and properties
    if (variables.length > 0) {
      context += '// Variables/Properties:\n';
      variables.slice(0, 8).forEach(def => {
        const signature = this.formatDefinitionSignature(def);
        context += `//   ${signature}\n`;
      });
    }

    // Add types
    if (types.length > 0) {
      context += '// Types:\n';
      types.slice(0, 5).forEach(def => {
        const signature = this.formatDefinitionSignature(def);
        context += `//   ${signature}\n`;
      });
    }

    return context;
  }

  private formatDefinitionSignature(def: LSPDefinition): string {
    const kindName = this.getSymbolKindName(def.kind);
    let signature = `${def.name}`;
    
    if (def.detail) {
      signature += `: ${def.detail}`;
    }
    
    if (def.containerName) {
      signature = `${def.containerName}.${signature}`;
    }
    
    return `${kindName} ${signature}`;
  }

  private getSymbolKindName(kind: vscode.SymbolKind): string {
    switch (kind) {
      case vscode.SymbolKind.Function: return 'function';
      case vscode.SymbolKind.Method: return 'method';
      case vscode.SymbolKind.Class: return 'class';
      case vscode.SymbolKind.Interface: return 'interface';
      case vscode.SymbolKind.Variable: return 'var';
      case vscode.SymbolKind.Property: return 'prop';
      case vscode.SymbolKind.Field: return 'field';
      case vscode.SymbolKind.Enum: return 'enum';
      case vscode.SymbolKind.Struct: return 'struct';
      case vscode.SymbolKind.TypeParameter: return 'type';
      case vscode.SymbolKind.Constant: return 'const';
      default: return 'symbol';
    }
  }

  prompt(params: AutoCompleteContext): PromptArgs {
    return {
      messages: [
        { role: "system", content: this.systemPrompt() },
        { role: "user", content: this.userPrompt(params) },
      ],
    };
  }
}


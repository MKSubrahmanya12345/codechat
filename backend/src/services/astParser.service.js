import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverseFn = traverseModule?.default || traverseModule;
const require = createRequire(import.meta.url);

let Parser = null;
const grammars = {};

try {
    Parser = require("tree-sitter");
    try { grammars["python"] = require("tree-sitter-python"); } catch(e){}
    try { grammars["java"] = require("tree-sitter-java"); } catch(e){}
    try { grammars["go"] = require("tree-sitter-go"); } catch(e){}
} catch(e) {
    console.warn("Tree-sitter not fully available:", e.message);
}

const getSnippet = (lines, lineStart, lineEnd, maxLines) => {
    if (!Array.isArray(lines) || lines.length === 0) return "";
    const start = Math.max(1, Number(lineStart) || 1);
    const rawEnd = Number(lineEnd) || start;
    const end = Math.max(start, rawEnd);
    const hardEnd = Math.min(lines.length, start + Math.max(1, maxLines) - 1, end);
    return lines.slice(start - 1, hardEnd).join("\n").trim();
};

const mapExtensionToLanguage = (ext) => {
    switch (ext) {
        case ".py": return "python";
        case ".java": return "java";
        case ".go": return "go";
        default: return null;
    }
};

const analyzeWithTreeSitter = (content, ext, snippetLines) => {
    const langKey = mapExtensionToLanguage(ext);
    if (!Parser || !langKey || !grammars[langKey]) return null;

    const imports = [];
    const exports = [];
    const symbols = [];
    const calls = [];
    const extendsRels = [];
    const lines = content.split(/\r?\n/);

    const addSymbol = (name, symbolType, startLine, endLine) => {
        if (!name) return null;
        const symbol = {
            key: `${name}:${startLine}:${symbols.length}`,
            name,
            symbolType,
            lineStart: startLine + 1,
            lineEnd: endLine + 1,
            snippetPreview: getSnippet(lines, startLine + 1, endLine + 1, snippetLines)
        };
        symbols.push(symbol);
        return symbol;
    };

    try {
        const parser = new Parser();
        parser.setLanguage(grammars[langKey]);
        const tree = parser.parse(content);

        const walk = (node, symbolStack) => {
            const currentStack = [...symbolStack];

            // Python Specifics
            if (langKey === "python") {
                if (node.type === "import_statement" || node.type === "import_from_statement") {
                    const text = node.text;
                    const match = text.match(/(?:from|import)\s+([a-zA-Z0-9_\.]+)/);
                    if (match && match[1]) imports.push(match[1]);
                }
                if (node.type === "function_definition") {
                    const nameNode = node.childForFieldName("name");
                    if (nameNode) {
                        const sym = addSymbol(nameNode.text, "function", node.startPosition.row, node.endPosition.row);
                        if (sym) currentStack.push(sym.key);
                    }
                }
                if (node.type === "class_definition") {
                    const nameNode = node.childForFieldName("name");
                    if (nameNode) {
                        const sym = addSymbol(nameNode.text, "class", node.startPosition.row, node.endPosition.row);
                        if (sym) currentStack.push(sym.key);
                        
                        // Check superclasses
                        const superclassesNode = node.childForFieldName("superclasses");
                        if (superclassesNode) {
                            const extendsArgs = superclassesNode.namedChildren;
                            for (const ext of extendsArgs) {
                                extendsRels.push({ fromSymbolKey: sym.key, toName: ext.text });
                            }
                        }
                    }
                }
                if (node.type === "call") {
                    const funcNode = node.childForFieldName("function");
                    if (funcNode) {
                        let calleeName = funcNode.text;
                        if (funcNode.type === "attribute") {
                            calleeName = funcNode.childForFieldName("attribute")?.text || calleeName;
                        }
                        const fromSymbolKey = currentStack.length ? currentStack[currentStack.length - 1] : null;
                        calls.push({ fromSymbolKey, toName: calleeName });
                    }
                }
            }

            // Java Specifics
            if (langKey === "java") {
                if (node.type === "import_declaration") {
                    const text = node.text;
                    const match = text.match(/import\s+(static\s+)?([\w\.]+);/);
                    if (match && match[2]) imports.push(match[2]);
                }
                if (node.type === "method_declaration") {
                    const nameNode = node.childForFieldName("name");
                    if (nameNode) {
                        const sym = addSymbol(nameNode.text, "method", node.startPosition.row, node.endPosition.row);
                        if (sym) currentStack.push(sym.key);
                    }
                }
                if (node.type === "class_declaration" || node.type === "interface_declaration") {
                    const nameNode = node.childForFieldName("name");
                    if (nameNode) {
                        const sym = addSymbol(nameNode.text, node.type === "class_declaration" ? "class" : "interface", node.startPosition.row, node.endPosition.row);
                        if (sym) currentStack.push(sym.key);

                        const superclassNode = node.childForFieldName("superclass");
                        if (superclassNode) {
                            const typeNode = superclassNode.childForFieldName("type");
                            if (typeNode) extendsRels.push({ fromSymbolKey: sym.key, toName: typeNode.text });
                        }
                    }
                }
                if (node.type === "method_invocation" || node.type === "object_creation_expression") {
                    const nameNode = node.childForFieldName("name") || node.childForFieldName("type");
                    if (nameNode) {
                        const fromSymbolKey = currentStack.length ? currentStack[currentStack.length - 1] : null;
                        calls.push({ fromSymbolKey, toName: nameNode.text });
                    }
                }
            }

            // Go Specifics
            if (langKey === "go") {
                if (node.type === "import_spec") {
                    const pathNode = node.childForFieldName("path");
                    if (pathNode) imports.push(pathNode.text.replace(/"/g, ""));
                }
                if (node.type === "function_declaration" || node.type === "method_declaration") {
                    const nameNode = node.childForFieldName("name");
                    if (nameNode) {
                        const sym = addSymbol(nameNode.text, "function", node.startPosition.row, node.endPosition.row);
                        if (sym) currentStack.push(sym.key);
                    }
                }
                if (node.type === "type_spec") {
                    const nameNode = node.childForFieldName("name");
                    const typeNode = node.childForFieldName("type");
                    if (nameNode && typeNode) {
                        const typeType = typeNode.type === "struct_type" ? "struct" : (typeNode.type === "interface_type" ? "interface" : "type");
                        addSymbol(nameNode.text, typeType, node.startPosition.row, node.endPosition.row);
                    }
                }
                if (node.type === "call_expression") {
                    const funcNode = node.childForFieldName("function");
                    if (funcNode) {
                        let calleeName = funcNode.text;
                        if (funcNode.type === "selector_expression") {
                            calleeName = funcNode.childForFieldName("field")?.text || calleeName;
                        }
                        const fromSymbolKey = currentStack.length ? currentStack[currentStack.length - 1] : null;
                        calls.push({ fromSymbolKey, toName: calleeName });
                    }
                }
            }

            for (const child of node.namedChildren) {
                walk(child, currentStack);
            }
        };

        walk(tree.rootNode, []);

        return {
            imports: [...new Set(imports)],
            exports: [...new Set(exports)],
            symbols,
            calls,
            extendsRels,
            parseOk: true
        };

    } catch (e) {
        console.error("Tree-sitter parse failed", e);
        return null; // fallback to regex
    }
};

const analyzeWithRegex = (content, ext, snippetLines) => {
    const lines = content.split(/\r?\n/);
    const imports = [];
    const symbols = [];
    const calls = [];
    const extendsRels = [];
    let currentSymbolKey = null;

    const addSymbol = (name, symbolType, lineIdx) => {
        const symbol = {
            key: `${name}:${lineIdx + 1}:${symbols.length}`,
            name,
            symbolType,
            lineStart: lineIdx + 1,
            lineEnd: lineIdx + 1,
            snippetPreview: getSnippet(lines, lineIdx + 1, lineIdx + Math.max(2, snippetLines), snippetLines)
        };
        symbols.push(symbol);
        currentSymbolKey = symbol.key;
        return symbol;
    };

    lines.forEach((line, i) => {
        const trimmed = line.trim();
        
        // Imports
        if (ext === ".py") {
            let m = trimmed.match(/^(?:from\s+([a-zA-Z0-9_\.]+)\s+import|import\s+([a-zA-Z0-9_\.]+))/);
            if (m) imports.push(m[1] || m[2]);
            
            m = trimmed.match(/^def\s+([a-zA-Z0-9_]+)\s*\(/);
            if (m) addSymbol(m[1], "function", i);

            m = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\(([^)]+)\))?\s*:/);
            if (m) {
                const sym = addSymbol(m[1], "class", i);
                if (m[2]) extendsRels.push({ fromSymbolKey: sym.key, toName: m[2].trim() });
            }
        }
        else if (ext === ".java" || ext === ".cs") {
            let m = trimmed.match(/^(?:import|using)\s+([\w\.]+)\s*;/);
            if (m) imports.push(m[1]);

            m = trimmed.match(/(?:public|private|protected|static|final|virtual|override|\s)*\s+(class|interface)\s+([a-zA-Z0-9_]+)\s*(?:extends|implements|:)\s*([a-zA-Z0-9_]+)/);
            if (m) {
                const sym = addSymbol(m[2], m[1], i);
                extendsRels.push({ fromSymbolKey: sym.key, toName: m[3].trim() });
            } else {
                m = trimmed.match(/(?:public|private|protected|static|final|virtual|override|\s)*\s+(class|interface)\s+([a-zA-Z0-9_]+)/);
                if (m) addSymbol(m[2], m[1], i);
            }

            m = trimmed.match(/(?:public|private|protected|static|final|virtual|override|\s)+\s+[\w<>\[\]]+\s+([a-zA-Z0-9_]+)\s*\(/);
            if (m && !trimmed.includes("=")) addSymbol(m[1], "method", i);
        }
        else if (ext === ".go") {
            let m = trimmed.match(/^import\s+"([^"]+)"/);
            if (m) imports.push(m[1]);

            m = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
            if (m) addSymbol(m[1], "function", i);

            m = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
            if (m) addSymbol(m[1], m[2], i);
        }

        // Basic call heuristic (only counts if we are inside a symbol)
        if (currentSymbolKey) {
            const matches = trimmed.matchAll(/([a-zA-Z0-9_]+)\s*\(/g);
            for (const match of matches) {
                const callee = match[1];
                if (!["if", "for", "while", "switch", "catch", "return", "function", "def", "func"].includes(callee)) {
                    calls.push({ fromSymbolKey: currentSymbolKey, toName: callee });
                }
            }
        }
    });

    return {
        imports: [...new Set(imports)],
        exports: [],
        symbols,
        calls,
        extendsRels,
        parseOk: true
    };
};

export const analyzeGenericFile = (content, ext, snippetLines) => {
    // 1. Try Tree-Sitter
    const tsResult = analyzeWithTreeSitter(content, ext, snippetLines);
    if (tsResult) return tsResult;

    // 2. Fallback to Regex
    return analyzeWithRegex(content, ext, snippetLines);
};

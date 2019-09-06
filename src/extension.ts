import { dirname } from 'path';
import * as vscode from 'vscode';

import { escapeDoubleQuotedString } from './escape';
import { executeCode as _executeCode, injectCode } from './execute';
import { InclusionMode, parse, Statement, StatementType } from './parse';


const EXTENSION_PREFIX = 'pythonLiveCoding';

let mainDocumentPath: string | undefined;


class Configuration {
    static readonly CONFIG_KEY_INTERPRETER_PATH = `interpreterPath`;
    static readonly CONFIG_KEY_RESERVED_KEYWORD = `reservedKeyword`;
    static readonly CONFIG_KEY_EXECUTE_NOT_IMPORTED = 'executeNotImported';
    static readonly CONFIG_KEY_EXECUTE_UNTITLED = 'executeUntitled';

    private static config: vscode.WorkspaceConfiguration | undefined;

    private static get(): vscode.WorkspaceConfiguration {
        if (Configuration.config === undefined) {
            this.config = vscode.workspace.getConfiguration(EXTENSION_PREFIX);
        }
        return this.config!;
    }

    static get interpreterPath(): string {
        return this.get().get<string>(this.CONFIG_KEY_INTERPRETER_PATH)!;
    }

    static get reservedKeyword(): string {
        return this.get().get<string>(this.CONFIG_KEY_RESERVED_KEYWORD)!;
    }

    static get executeUntitled(): boolean {
        return this.get().get<boolean>(this.CONFIG_KEY_EXECUTE_UNTITLED)!;
    }

    static get executeNotImported(): boolean {
        return this.get().get<boolean>(this.CONFIG_KEY_EXECUTE_NOT_IMPORTED)!;
    }
}


class Terminal {
    static readonly TERMINAL_NAME = 'python-live-executor';

    static get(): vscode.Terminal {
        for (let terminal of vscode.window.terminals) {
            if (terminal.name === this.TERMINAL_NAME) {
                return terminal;
            }
        }

        return this.createTerminal();
    }

    private static createTerminal(): vscode.Terminal {
        mainDocumentPath = undefined;
        let term = vscode.window.createTerminal(Terminal.TERMINAL_NAME);

        let editor = vscode.window.activeTextEditor;
        if (editor !== undefined) {
            let document = editor.document;
            if (!document.isUntitled) {
                term.sendText(
                    `cd "${escapeDoubleQuotedString(dirname(document.uri.fsPath))}"`);
            }
        }

        term.sendText(Configuration.interpreterPath);
        injectCode(term, Configuration.reservedKeyword);
        term.sendText('\n\n\n');

        return term;
    }

    static sendText(text: string) {
        this.get().sendText(text);
    }

    static show() {
        this.get().show(true);
    }

    static dispose() {
        this.get().dispose();
    }
}


function unindent(document: vscode.TextDocument, statement: Statement, indentSizePerLevel: number): string {
    let code = '';

    for (let decorator of statement.decorators) {
        code += unindent(document, decorator, indentSizePerLevel);
    }

    code += document.getText(new vscode.Range(
        statement.definitionStart.line, indentSizePerLevel, statement.definitionEnd.line, statement.definitionEnd.character
    ));
    code += '\n';

    for (let child of statement.children) {
        code += unindent(document, child, indentSizePerLevel);
    }

    return code;
}


function prepareExecution(): [vscode.TextEditor, vscode.TextDocument, vscode.Position, vscode.Position, boolean] {
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        throw new Error(`No active editor found`);
    }
    let document = editor.document;
    let start = editor.selection.start;
    let end = editor.selection.end;

    Terminal.show();

    // resolve main document
    if (mainDocumentPath === undefined) {
        mainDocumentPath = document.fileName;
    }
    let isMain = document.fileName === mainDocumentPath;

    if (document.isUntitled) {
        if (Configuration.executeUntitled) {
            isMain = true;
        } else {
            throw new Error(`Cannot execute code in untitled documents (change the ${EXTENSION_PREFIX}.${Configuration.executeUntitled} setting to override this behavior)`); }
    }

    return [editor, document, start, end, isMain];
}


function executeCode(code: string, parentClassName?: string, path?: string) {
    _executeCode(Terminal.get(), Configuration.reservedKeyword, code, Configuration.executeNotImported, parentClassName, path);
}


export function activate(context: vscode.ExtensionContext) {
    let execute = vscode.commands.registerCommand(`${EXTENSION_PREFIX}.execute`, () => {
        try {
            let [editor, document, start, end, isMain] = prepareExecution();
            let statements = parse(document, start, end);

            // special case: first statement is a class, then we check whether its
            // start is before the selection start, if so, then we wants only a
            // subset of it
            if (statements.length >= 1 && statements[0].type === StatementType.Class && statements[0].start.line < start.line) {
                let classParent: Statement = statements.shift()!;

                let indentSizePerLevel = classParent.children[0].indentSize - classParent.indentSize;

                let code = '';

                for (let child of classParent.children) {
                    if ((child.start.line >= start.line && child.start.line <= end.line) || (child.end.line >= start.line && child.end.line <= end.line)) {
                        code += unindent(document, child, indentSizePerLevel);
                        code += '\n\n';
                    }
                }

                executeCode(code, classParent.name, (isMain ? undefined : document.fileName));
            }

            // the rest of the statements
            if (statements.length !== 0) {
                let code = '';
                for (let statement of statements) {
                    code += document.getText(new vscode.Range(statement.start, statement.end));
                    code += '\n\n';
                }

                executeCode(code, undefined, (isMain ? undefined : document.fileName));
            }
        } catch (error) {
            console.log(error);
            vscode.window.showErrorMessage(error.toString());
        }
    });


    let executeAll = vscode.commands.registerCommand(`${EXTENSION_PREFIX}.executeAll`, () => {
        try{
            let [editor, document, start, end, isMain] = prepareExecution();
            let lastLine = document.lineAt(Math.max(document.lineCount - 1, 0));

            let range = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length);
            executeCode(document.getText(range), undefined, (isMain ? undefined : document.fileName));
        }catch(error){
            console.log(error);
            vscode.window.showErrorMessage(error.toString());
        }
    });

    let executeChunk = vscode.commands.registerCommand(`${EXTENSION_PREFIX}.executeChunk`, () => {
        try {
            let [editor, document, start, end, isMain] = prepareExecution();
            let statements = parse(document, start, end, InclusionMode.Chunk);

            if (statements.length !== 0) {
                let code = '';
                for (let statement of statements) {
                    code += document.getText(new vscode.Range(statement.start, statement.end));
                    code += '\n\n';
                }

                executeCode(code, undefined, (isMain ? undefined : document.fileName));
            }
        } catch (error) {
            console.log(error);
            vscode.window.showErrorMessage(error.toString());
        }
    });

    let dispose = vscode.commands.registerCommand(`${EXTENSION_PREFIX}.dispose`, () => {
        try{
            let editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
            let document = editor === undefined ? undefined : editor.document;

            Terminal.dispose();

            if (document !== undefined) {
                vscode.window.showTextDocument(document);
            }
        }catch(error){
            console.log(error);
            vscode.window.showErrorMessage(error.toString());
        }
    });

    context.subscriptions.push(execute);
    context.subscriptions.push(executeAll);
    context.subscriptions.push(executeChunk);
    context.subscriptions.push(dispose);
}


export function deactivate() { }

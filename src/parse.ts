import * as vscode from "vscode";
import _ from 'lodash';


export class ParseError extends Error{}


export enum StatementType{
    Class,
    Function,
    Other
}


export enum InclusionMode{
    SelectionOnly,
    Chunk
}


const startLiteral: any = {
    ')': '(',
    ']': '[',
    '}': '{',
};


// decorators are considered part of a statement
export interface Statement{
    start: vscode.Position;
    end: vscode.Position;
    indentSize: number; // note different from indent level, this is simply the number of characters before the first non whitespace character on the start line
    children: Statement[];
    name: string;
    type: StatementType;
    decorators: Statement[];
    definitionStart: vscode.Position; // if not function / class definition then this is the same as start
    definitionEnd: vscode.Position; // if not function / class definition then this is the same as end
}


/**
 * @param args either a single argument line: TextLine, or two arguments document: TextDocument, startLineNo: number
 */
function lineIsNotEmptyNorCommentLine(...args: any[]): boolean{
    let line: vscode.TextLine;
    if(args.length === 1){
        line = args[0];
    }else if(args.length === 2){
        line = args[0].lineAt(args[1]);
    }else{
        throw new Error(`invalid arguments ${args}`);
    }

    return !line.isEmptyOrWhitespace && line.text[line.firstNonWhitespaceCharacterIndex] !== '#';
}


/**
 *
 * @param startLineNo the line to start with, must not be part of a previous statement
 * @returns -1 if not found
 */
function findNextNonEmptyOrCommentLine(document: vscode.TextDocument, startLineNo: number): number{
    for(let curLineNo = startLineNo; curLineNo < document.lineCount; ++curLineNo){
        if(lineIsNotEmptyNorCommentLine(document, curLineNo)) { return curLineNo; }
    }

    return -1;
}


/**
 * @returns -1 if not exist
 */
function nextSpaceOrTabPos(text: string, start: number): number{
    for(let i = start; i < text.length; ++i){
        if(text[i] === ' ' || text[i] === '\t') {
            return i;
        }
    }

    return -1;
}


/**
 * not responsible for dealing with multiline quotes
 * @returns name of the class, or null if the current line is not a class definition
 */
function getClassName(text: string): string | null {
    let tokens = _.split(text, /[ \t]+/);

    let firstNonEmptyTokenIndex = 0;
    for(let i = 0; i < tokens.length; ++i){
        if(tokens[i] !== '') { firstNonEmptyTokenIndex = i; break; }
    }

    if(tokens.length >= firstNonEmptyTokenIndex + 2 && tokens[firstNonEmptyTokenIndex] === 'class'){
        let lppos = tokens[firstNonEmptyTokenIndex + 1].indexOf('(');
        if(lppos === -1) {
            return tokens[firstNonEmptyTokenIndex + 1].slice(0, tokens[firstNonEmptyTokenIndex + 1].indexOf(':'));
        }else{
            return tokens[firstNonEmptyTokenIndex + 1].slice(0, lppos);
        }
    }

    return null;
}


/**
 * not responsible for dealing with multiline quotes
 * @returns name of the function, or null if the current line is not a function definition
 */
function getFunctionName(text: string): string | null {
    let tokens = _.split(text, /[ \t]+/);

    let firstNonEmptyTokenIndex = 0;
    for(let i = 0; i < tokens.length; ++i){
        if(tokens[i] !== '') { firstNonEmptyTokenIndex = i; break; }
    }

    if(tokens.length >= firstNonEmptyTokenIndex + 2 && tokens[firstNonEmptyTokenIndex] === 'def'){
        return tokens[firstNonEmptyTokenIndex + 1].slice(0, tokens[firstNonEmptyTokenIndex + 1].indexOf('('));
    }else if(tokens.length >= firstNonEmptyTokenIndex + 3 && tokens[firstNonEmptyTokenIndex] === 'async' && tokens[firstNonEmptyTokenIndex] === 'def'){
        return tokens[firstNonEmptyTokenIndex + 2].slice(0, tokens[firstNonEmptyTokenIndex + 2].indexOf('('));
    }

    return null;
}


/**
 * @param startLineNo first line of the statement to parse
 */
function parseStatement(document: vscode.TextDocument, startLineNo: number): Statement {
    let start = new vscode.Position(startLineNo, document.lineAt(startLineNo).firstNonWhitespaceCharacterIndex);
    let definitionStart: vscode.Position | null = null;
    let name = '';
    let type = StatementType.Other;
    let decorators: Statement[] = [];

    let isDecorator = false;
    let decoratorStart: vscode.Position;

    let inMultiLineQuote = false;
    let multiLineQuoteChars = '';

    let inQuote = false;
    let quoteChar = '';

    let indentSize = document.lineAt(startLineNo).firstNonWhitespaceCharacterIndex;

    let literalStack = [];

    for(let curLineNo = startLineNo; curLineNo < document.lineCount; ++curLineNo){
        let curLine = document.lineAt(curLineNo);

        let curText = curLine.text;
        let curOffset = 0;

        // multiline quote escapes everything, including line continuation charcter \ and comment #
        // skip to end of multiline (offset will be set to the character after the multi line quotations characters, w.r.t curText)
        if(inMultiLineQuote){
            let multiLineCharsOffset = curText.indexOf(multiLineQuoteChars);
            if(multiLineCharsOffset === -1) { continue; }
            inMultiLineQuote = false;
            curOffset = multiLineCharsOffset + 3;
        }

        // an empty can be part of a statement only if it is in the middle of a multi quote, which is already been handled above, thus

        // guarantee: we are not inside a multi line qutoe
        // guarantee: empty line means a separation of statements

        if(lineIsNotEmptyNorCommentLine(curLine)){
            let nextLine = false;

            let curName = getFunctionName(curText);
            if(curName !== null){
                definitionStart = new vscode.Position(curLineNo, curLine.firstNonWhitespaceCharacterIndex);
                name = curName;
                type = StatementType.Function;
            }else{
                curName = getClassName(curText);
                if(curName !== null) {
                    definitionStart = new vscode.Position(curLineNo, curLine.firstNonWhitespaceCharacterIndex);
                    name = curName;
                    type = StatementType.Class;
                }
            }

            // if first character is @ then its a decorator
            if(curText[curLine.firstNonWhitespaceCharacterIndex] === '@') {
                // we want decorators to be part of the next statement
                // do not continue immediately because there may be a multiline quote somewhere later in the line
                isDecorator = true;
                decoratorStart = new vscode.Position(curLineNo, curLine.firstNonWhitespaceCharacterIndex);
            }

            for(let i = Math.max(curOffset, curLine.firstNonWhitespaceCharacterIndex); i < curText.length; ++i){
                if(inQuote){
                    // if we are in quote then we just look for next quote character, because quotes escape everything except \, which is both an escape character and a line continuation character
                    if(curText[i] === quoteChar && (i === 0 || curText[i - 1] !== '\\')) {
                        inQuote = false;
                        continue;
                    }
                }else{ // not quoted
                    // if is ' then skip to next ', here only to make sure it is not in fact a multi line quote
                    if(curText[i] === "'" && (i > curText.length - 3 || curText[i + 1] !== "'" || curText[i + 2] !== "'")) {
                        inQuote = true;
                        quoteChar = "'";
                        continue;
                    }

                    // if is " then skip to next ", similar to '
                    if(curText[i] === '"' && (i > curText.length - 3 || curText[i + 1] !== '"' || curText[i + 2] !== '"')) {
                        inQuote = true;
                        quoteChar = '"';
                        continue;
                    }

                    // if is """ then enter multiline mode, and see if there is more """ later in the line
                    if(i <= curText.length - 3 && curText[i] === '"' && curText[i + 1] === '"' && curText[i + 2] === '"'){
                        let foundTerminating = false;
                        for(let j = i + 3; j <= curText.length - 3; ++j) {
                            if(curText[j - 1] !== '\\' && curText[j] === '"' && curText[j + 1] === '"' && curText[j + 2] === '"'){
                                i = j + 2;
                                foundTerminating = true;
                                break;
                            }
                        }

                        if(foundTerminating){
                            continue;
                        }else{
                            nextLine = true;
                            inMultiLineQuote = true;
                            multiLineQuoteChars = '"""';
                            break;
                        }
                    }

                    // if is ''' then enter multiline mode, and see if there is more ''' later in the line
                    if(i <= curText.length - 3 && curText[i] === "'" && curText[i + 1] === "'" && curText[i + 2] === "'") {
                        let foundTerminating = false;
                        for(let j = i + 3; j <= curText.length - 3; ++j) {
                            if(curText[j - 1] !== '\\' && curText[j] === "'" && curText[j + 1] === "'" && curText[j + 2] === "'"){
                                i = j + 2;
                                foundTerminating = true;
                                break;
                            }
                        }

                        if(foundTerminating){
                            continue;
                        }else{
                            nextLine = true;
                            inMultiLineQuote = true;
                            multiLineQuoteChars = "'''";
                            break;
                        }
                    }

                    // if it is one of ( [ { then push it onto the stack
                    if(curText[i] === '(' || curText[i] === '[' || curText === '{'){
                        literalStack.push(curText[i]);
                    }

                    // if it is one of ) ] } then pop it from the stack
                    if(curText[i] === ')' || curText[i] === ']' || curText === '}'){
                        if(literalStack[literalStack.length - 1] !== startLiteral[curText[i]]){ throw new ParseError(`unexpected end of literal character ${curText[i]} at line ${curLineNo + 1}`); }
                        literalStack.pop();
                    }

                    // if is # then terminate current statement
                    if(curText[i] === '#'){
                        break;
                    }

                }

                // if is \ and is the last character in the line then continue to next line
                if(i === curText.length - 1 && curText[i] === '\\'){
                    nextLine = true;
                    break;
                }
            }

            if(nextLine || literalStack.length !== 0){
                continue;
            }
        }else{
            throw new ParseError(`unexpected empty line ${curLineNo + 1}`);
        }

        let end = new vscode.Position(curLineNo, curText.length);

        // statement has ended in a natural way with the current line
        if(isDecorator){ // if current line is a decorator then incude next line as well
            isDecorator = false;
            decorators.push({
                start: decoratorStart!,
                end: end,
                children: [],
                indentSize: indentSize,
                name: '',
                type: StatementType.Other,
                decorators: [],
                definitionStart: decoratorStart!,
                definitionEnd: end,
            });
            continue;
        }

        return {
            start: start,
            end: end,
            children: [],
            indentSize: indentSize,
            name: name,
            type: type,
            decorators: decorators,
            definitionStart: (definitionStart === null) ? start : definitionStart,
            definitionEnd: end
        };
    }

    throw new ParseError(`end of statement not found for statement starting at ${startLineNo}`);
}


/**
 * @param startLineNo inclusive in the search
 */
function getNextStatement(document: vscode.TextDocument, startLineNo: number): Statement | null {
    let nextStatementStartingLineNo = findNextNonEmptyOrCommentLine(document, startLineNo);
    if(nextStatementStartingLineNo === -1) { return null; }
    else { return parseStatement(document, nextStatementStartingLineNo); }
}


/**
 * modifies blockStartStatement (end and children)
 * @param must be the starting line of a (possibly block) statement
 * @returns the same statement as blockStartStatement
 * @throws ParseError
 */
function parseBlock(document: vscode.TextDocument, blockStartStatement: Statement, firstChildStatement: Statement): Statement{
    blockStartStatement.children.push(firstChildStatement);

    let childrenIndentSize = firstChildStatement.indentSize;

    while(true){
        // is there new statements after the last statement in the block?
        let lastChild = blockStartStatement.children[blockStartStatement.children.length - 1];
        
        let nextStatementStartingLineNo = findNextNonEmptyOrCommentLine(document, lastChild.end.line + 1);

        // no, end the block statement
        if(nextStatementStartingLineNo === -1) { break; }

        // there is, does it belong to the block?
        let nextStatementLine = document.lineAt(nextStatementStartingLineNo);

        // no, end the block
        if(nextStatementLine.firstNonWhitespaceCharacterIndex < childrenIndentSize){ break; }

        // yes, is it direct child or previous children's child?
        if(nextStatementLine.firstNonWhitespaceCharacterIndex === childrenIndentSize) {
            blockStartStatement.children.push(parseStatement(document, nextStatementStartingLineNo));
        }else{
            let nextStatement = parseStatement(document, nextStatementStartingLineNo);
            parseBlock(document, blockStartStatement.children[blockStartStatement.children.length - 1], nextStatement); 
        }
    }

    blockStartStatement.end = blockStartStatement.children[blockStartStatement.children.length - 1].end;
    return blockStartStatement;
}


/**
 *
 * @param document if null then activeTextEditor.document is used
 * @param start if null then default to the first selection's start
 * @param end if null then default to the first selection's end
 */
export function parse(document?: vscode.TextDocument, start?: vscode.Position, end?: vscode.Position, inclusionMode: InclusionMode = InclusionMode.SelectionOnly): Statement[]{
    let editor = vscode.window.activeTextEditor;

    // resolve all arguments and defaults
    if(document === undefined){
        if(editor === undefined) { return []; }
        document = editor.document;
    }
    if(start === undefined){
        if(editor === undefined) { return []; }
        start = editor.selection.start;
    }
    if(end === undefined){
        if(editor === undefined) { return []; }
        end = editor.selection.end;
    }

    // get all the top level statements up until end specified
    let statements: Statement[] = [];

    let curStatement = getNextStatement(document, 0);

    while(true){
        if(curStatement === null) { break; }

        if(inclusionMode === InclusionMode.SelectionOnly) {
            if(curStatement.start.line > end.line) { break; }
        }else if(inclusionMode === InclusionMode.Chunk){
            if(curStatement.start.line > end.line) {
                if(statements.length > 0 && curStatement.start.line > statements[statements.length - 1].end.line + 1) {
                    break;
                }
            }
        }

        statements.push(curStatement);

        let nextStatement = getNextStatement(document, curStatement.end.line + 1);
        if(nextStatement === null){ break; }

        if(curStatement!.indentSize !== nextStatement.indentSize){
            let block = parseBlock(document, curStatement!, nextStatement);
            curStatement = getNextStatement(document, block.end.line + 1);
        }else{
            curStatement = nextStatement;
        }
    }

    let firstStatementIndex = statements.length;
    for(let i = 0; i < statements.length; ++i) {
        if(statements[i].end.line >= start.line) {
            firstStatementIndex = i;
            break;
        }
    }

    if(inclusionMode === InclusionMode.SelectionOnly){
        statements = statements.slice(firstStatementIndex); 
    }else if(inclusionMode === InclusionMode.Chunk){
        for(let i = firstStatementIndex - 1; i >= 0; --i){
            if(statements[i].end.line + 1 !== statements[i + 1].start.line) {
                statements = statements.slice(i + 1);
                break;
            }
        }        
    }

    return statements;
}
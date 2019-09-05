import { loadFunc } from './gzipped-python-code';
import { Terminal } from './types';
import { escapeSingleQuotedString } from './escape';

/**
 * must be called before the execution of any code through below functions
 */
export function injectCode(term: Terminal, reservedKeyword: string){
    term.sendText(`from gzip import decompress as ${reservedKeyword}`);
    term.sendText(`${reservedKeyword} = {'source': ${reservedKeyword}(b'${loadFunc}') };`);
    term.sendText(`exec(${reservedKeyword}['source'], ${reservedKeyword})`);
}

export function deleteCode(term: Terminal, reservedKeyword: string){
    term.sendText(`del ${reservedKeyword}`);
}

/**
 * @param code unescaped
 * @param path unescaped
 */
export function executeCode(term: Terminal, reservedKeyword: string, code: string, executeNotImported: boolean, parentClassName?: string, path?: string){
    term.sendText(`${reservedKeyword}['load']('''${escapeSingleQuotedString(code)}'''${parentClassName === undefined? '' : ', parent_class_name=\'' + parentClassName + '\''}${path === undefined? '' : ', path=\'' + escapeSingleQuotedString(path) + '\''}, execute_not_imported=${executeNotImported ? 'True': 'False'})\\\n\n`);
}
const _singleQuoteRegex = /'/g;
const _doubleQouteRegex = /"/g;
const _backwardSlashRegex = /\\/g;

export function escapeBackwardSlash(str: string): string{
	return str.replace(_backwardSlashRegex, '\\\\');
}

export function escapeSingleQuote(str: string): string{
	return str.replace(_singleQuoteRegex, '\\\'');
}

export function escapeSingleQuotedString(str: string): string{
    return escapeSingleQuote(escapeBackwardSlash(str));
}

export function escapeDoubleQuote(str: string): string{
	return str.replace(_doubleQouteRegex, '\\"');
}

export function escapeDoubleQuotedString(str: string): string{
    return escapeDoubleQuote(escapeBackwardSlash(str));
}
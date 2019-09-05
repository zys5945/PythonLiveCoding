import gzip

with open('src/load.py') as f:
	comp_str = gzip.compress(f.read().encode('utf8')).hex()

hex_str = ''.join(['\\\\x' + comp_str[i:i + 2] for i in range(0, len(comp_str), 2)])

with open('src/gzipped-python-code.ts', 'w') as f:
	f.write('export const loadFunc = `')
	f.write(hex_str)
	f.write('`;')
# python-live-coding README

Execute code without re-running the entire script with a click of a button, instead of copying code from editor to shell.

Supports live reloading of classes, class methods, class members and more.
Supports reloading portions of code from other modules.

## Features

Run python code and hot-reload functions and classes in the interpreter from vscode.

## Caveats

### Effects on running code

Imports and uses sys, copy, gzip and pathlib, without polluting the global namespace.

### Other

Documents are resolved by their file path.

Semicolons are treated as part of a statement.

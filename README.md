# python-live-coding

Inspired by IPython / Jupyter Notebook.

Supports execution of python code with shortcuts, instead of copying code from editor to shell.

Enables live reloading of classes, class members, or portions of code from other imported modules, without re-running all the code from the main script of the target module, while preserving name bindings.

## Commands

You can find demos in gifs folder.

They are left out of this readme because of their file size.

### pythonLiveCoding.execute

Executes the currently selected, or the current line of python code.

#### Execute a Single Statement

Simply place your cursor at the line you want to execute, or select the lines that you want to execute. Then run the command.

A demo can be found in gifs/single.gif

Note that this command is only capable of executing module level statements, so if a statement belongs to a module level block, the entire block of code will be executed.

A demo can be found in gifs/block.gif

#### Reload module level variables (including functions)

Module level variables can be reloaded by using the "execute" command just like if they are code blocks.

A demo can be found in gifs/func.gif

#### Reload methods and class fields

Class members can be reloaded by using the "execute" command just like if they are regular statements.

Note that already existing instances will also receive this update.

A demo can be found in gifs/method.gif

#### Reload class

Class can only be reloaded when the line of class definition is selected for reload, otherwise only members of the class will be reloaded.

Existing instances will **NOT** be updated. They are still instances of the old class.

Demos can be found in gifs/class.gif and gifs/class-wrong.gif

### pythonLiveCoding.executeAll

Execute all statements in current file.

A demo can be found in gifs/all.gif

### pythonLiveCoding.executeChunk

Execute a chunk of code. This is similar to a block of code in IPython / Jupyter Notebook.

A demo can be found in gifs/chunk.gif

## How does this work

Source code is parsed for the selected statements. Here a statement refers to a complete python statement that might span multiple lines, similar to that outlined in [the python grammar specification](https://docs.python.org/3/reference/grammar.html).

It takes into consideration of things such as multiline string ''' and """, line continuation character \\, or tokens such () [] {} that spans multiple lines.

Selected source code is then passed into python interpreter, which executes the code against the correct globals, observes changes to the globals and reassign things if necessary.

## Caveats

### Effects on running code

Imports and uses sys, copy, gzip and pathlib, without polluting the global namespace.

### Other

Documents are resolved by their file path.

Semicolons are treated as part of a statement.
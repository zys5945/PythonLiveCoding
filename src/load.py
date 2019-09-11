def load(code, parent_class_name=None, path=None, execute_not_imported=False):
    import sys
    import copy
    from pathlib import Path

    is_main_module = True
    module_to_use = None

    if path is None:
        module_to_use = sys.modules['__main__']
    else:
        path = Path(path)

        for module_name in sys.modules:
            module = sys.modules[module_name]

            if hasattr(module, '__file__') and Path(module.__file__) == path:
                is_main_module = False
                module_to_use = module

    if module_to_use is None:
        if execute_not_imported:
            module_to_use = sys.modules['__main__']
        else:
            print('Cannot execute code in non imported modules(change the setting to override this behavior)')
            return

    g = module_to_use.__dict__
    gc = copy.copy(g)
    exec(code, g)
    changed = {}
    deleted = []

    for key in g:
        if key not in gc or id(g[key]) != id(gc[key]):
            changed[key] = g[key]

    for key in gc:
        if key not in g:
            deleted.append(key)

    if len(deleted) != 0:
        for key in deleted:
            delattr(module_to_use, key)

    if len(changed.keys()) != 0:
        if parent_class_name is not None:
            try:
                class_obj = getattr(module_to_use, parent_class_name)

                for key in changed:
                    setattr(class_obj, key, changed[key])

                    if gc.get(key) is not None:
                        g[key] = gc[key]
                    else:
                        del g[key]

            except:
                print(f'module {module_to_use.__name__} does not have class {parent_class_name}')
                return
        else:
            for key in changed:
                setattr(module_to_use, key, changed[key])

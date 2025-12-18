import deepgram
import inspect

def search_module(module, name):
    for attr in dir(module):
        try:
            val = getattr(module, attr)
            if attr == name:
                print(f"FOUND: {module.__name__}.{attr}")
            if inspect.ismodule(val) and val.__name__.startswith('deepgram'):
                try:
                    search_module(val, name)
                except RecursionError:
                    pass
        except:
            pass

print("Searching for LiveTranscriptionEvents...")
try:
    search_module(deepgram, "LiveTranscriptionEvents")
except Exception as e:
    print(e)

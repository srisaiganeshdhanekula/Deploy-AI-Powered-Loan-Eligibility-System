with open("app/routes/voice_realtime_v2.py", "rb") as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if 640 <= i + 1 <= 660:
            print(f"{i+1}: {repr(line)}")

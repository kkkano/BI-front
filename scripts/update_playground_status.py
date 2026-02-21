#!/usr/bin/env python3
from datetime import datetime, timezone
from pathlib import Path
import subprocess

status_file = Path('PLAYGROUND_STATUS.md')
if not status_file.exists():
    raise SystemExit('PLAYGROUND_STATUS.md not found')

sha = subprocess.check_output(['git','rev-parse','--short','HEAD'], text=True).strip()
subject = subprocess.check_output(['git','log','-1','--pretty=%s'], text=True).strip()
now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

text = status_file.read_text(encoding='utf-8')
text = text.replace('{{AUTO_PING}}', now)
text = text.replace('{{AUTO_SHA}}', sha)
text = text.replace('{{AUTO_SUBJECT}}', subject)

status_file.write_text(text, encoding='utf-8')
print('updated status board')

#!/usr/bin/env python3
from datetime import datetime, timezone, timedelta
from pathlib import Path
import re
import subprocess

status_file = Path('PLAYGROUND_STATUS.md')
if not status_file.exists():
    raise SystemExit('PLAYGROUND_STATUS.md not found')

sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], text=True).strip()
subject = subprocess.check_output(['git', 'log', '-1', '--pretty=%s'], text=True).strip()

# 使用中国时间（UTC+8）
cn_tz = timezone(timedelta(hours=8))
now_cn = datetime.now(cn_tz).strftime('%Y-%m-%d %H:%M CST (UTC+8)')

text = status_file.read_text(encoding='utf-8')
text = re.sub(r'- Auto ping: \*\*.*\*\*', f'- Auto ping: **{now_cn}**', text)
text = re.sub(r'- Latest commit: \*\*.*\*\*', f'- Latest commit: **{sha}**', text)
text = re.sub(r'- Message: \*\*.*\*\*', f'- Message: **{subject}**', text)

status_file.write_text(text, encoding='utf-8')
print('updated status board (China time)')

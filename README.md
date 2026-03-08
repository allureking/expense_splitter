# SplitEase - Expense Splitter

A web-based AA bill splitting tool with MOZE accounting software CSV import/export support.

## Features

- **Smart Settlement** — Automatically calculates minimum transfers ("Alice pays Bob ¥66.67")
- **Flexible Splitting** — Equal, ratio-based, or custom amount per person
- **Payer Tracking** — Track who paid for each expense
- **MOZE CSV Import/Export** — Import from MOZE bank CSV, export per-person splits for MOZE import
- **Multi-currency** — ¥ / $ / € / £ / ₩
- **Real-time Collaboration** — Share a link for multi-person editing
- **Mobile-first Design** — Optimized for phone use
- **Dark Mode + i18n** — English & Chinese, light & dark themes
- **Project History** — Archive and reload past projects

## Quick Start

```bash
pip install -r requirements.txt
python server.py
```

Open http://localhost:8000

## Tech Stack

- **Backend**: FastAPI + SQLite + uvicorn
- **Frontend**: Vanilla HTML/CSS/JS (no build step)

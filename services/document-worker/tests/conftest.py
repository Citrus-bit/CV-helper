from __future__ import annotations

import io
import sys
from pathlib import Path

import pytest
from reportlab.pdfgen import canvas


WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))


@pytest.fixture
def digital_pdf() -> bytes:
    output = io.BytesIO()
    document = canvas.Canvas(output, pagesize=(595, 842), pageCompression=1)
    document.setFont("Helvetica-Bold", 18)
    document.drawString(54, 780, "Taylor Chen - Product Engineer")
    document.setFont("Helvetica", 10)
    document.drawString(54, 750, "Built a workflow used by 120 teams and reduced review time by 35 percent.")
    document.drawString(54, 730, "TypeScript, Python, SQL, product analytics, and cross-functional delivery.")
    document.save()
    return output.getvalue()

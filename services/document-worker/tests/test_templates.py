from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from pypdf import PdfReader

import app.config as config
from app.config import project_root, typst_binary
from app.errors import DocumentError
from app.rendering import _template_path


TEMPLATE_NAMES = ("professional", "minimal", "compact")


def test_project_root_supports_shallow_container_layout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "app").mkdir()
    (tmp_path / "templates" / "typst").mkdir(parents=True)
    monkeypatch.setattr(config, "__file__", str(tmp_path / "app" / "config.py"))

    assert config.project_root() == tmp_path


@pytest.mark.parametrize("template_name", TEMPLATE_NAMES)
def test_template_exists_and_reads_structured_json(template_name: str) -> None:
    template = project_root() / "templates" / "typst" / f"{template_name}.typ"
    source = template.read_text(encoding="utf-8")
    assert template.is_file()
    assert 'json("resume.json")' in source
    assert "sys.inputs" not in source


def test_template_selection_rejects_path_traversal() -> None:
    with pytest.raises(DocumentError) as captured:
        _template_path("../../etc/passwd")
    assert captured.value.code == "UNKNOWN_TEMPLATE"


@pytest.mark.parametrize("template_name", TEMPLATE_NAMES)
def test_template_compiles_independently_and_keeps_user_text_inert(
    tmp_path: Path,
    template_name: str,
) -> None:
    binary = typst_binary()
    if binary is None:
        pytest.skip("Typst is not installed")

    source = project_root() / "templates" / "typst" / f"{template_name}.typ"
    shutil.copyfile(source, tmp_path / f"{template_name}.typ")
    payload = {
        "profile": {
            "name": '#read("/etc/passwd")',
            "headline": "Security test",
            "email": "test@example.com",
            "phone": "",
            "location": "",
            "summary": "Literal user text must never be evaluated as Typst code.",
        },
        "sections": [],
    }
    (tmp_path / "resume.json").write_text(json.dumps(payload), encoding="utf-8")
    output = tmp_path / "resume.pdf"
    completed = subprocess.run(
        [
            str(binary),
            "compile",
            "--root",
            str(tmp_path),
            str(tmp_path / f"{template_name}.typ"),
            str(output),
        ],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert output.read_bytes().startswith(b"%PDF-")
    extracted = "\n".join((page.extract_text() or "") for page in PdfReader(output).pages)
    assert "root:x:" not in extracted


@pytest.mark.parametrize("template_name", TEMPLATE_NAMES)
def test_dense_resume_keeps_first_and_last_content_across_pages(
    tmp_path: Path,
    template_name: str,
) -> None:
    binary = typst_binary()
    if binary is None:
        pytest.skip("Typst is not installed")

    shutil.copyfile(project_root() / "templates" / "typst" / f"{template_name}.typ", tmp_path / "main.typ")
    shutil.copyfile(project_root() / "tests" / "fixtures" / "resume-dense.json", tmp_path / "resume.json")
    output = tmp_path / "resume.pdf"
    completed = subprocess.run(
        [str(binary), "compile", "--root", str(tmp_path), "main.typ", "resume.pdf"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    reader = PdfReader(output)
    assert 1 <= len(reader.pages) <= 3
    extracted = "\n".join((page.extract_text() or "") for page in reader.pages)
    assert "AI 知识库产品从 0 到 1" in extracted
    assert "PMP 项目管理专业人士" in extracted
    for page in reader.pages:
        assert round(float(page.mediabox.width)) == 595
        assert round(float(page.mediabox.height)) == 842

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PIPELINE = Path(__file__).resolve().parents[1]


class IntegrationTests(unittest.TestCase):
    def test_cli_loads_from_another_working_directory(self):
        with tempfile.TemporaryDirectory() as work:
            result = subprocess.run(
                [sys.executable, str(PIPELINE / 'run_pipeline.py'), '--help'],
                cwd=work, text=True, capture_output=True,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--images', result.stdout)

    def test_builder_keeps_both_spread_pages_in_generated_viewer(self):
        with tempfile.TemporaryDirectory() as work:
            work = Path(work)
            (work / 'cards.json').write_text(json.dumps([
                {'id': 'spread-1', 'badge': '22–23쪽', 'title': '검증용 펼침면', 'img_path': 'scan.png'}
            ]))
            (work / 'scan.png.json').write_text(json.dumps([
                {'text': '왼쪽 원문', 'x': 0.10, 'y': 0.30, 'w': 0.20, 'h': 0.03},
                {'text': '오른쪽 원문', 'x': 0.65, 'y': 0.30, 'w': 0.20, 'h': 0.03},
            ]))
            output = work / 'viewer.html'
            result = subprocess.run([
                sys.executable, str(PIPELINE / 'src/builder.py'),
                '--cards', str(work / 'cards.json'), '--cache', str(work),
                '--template', str(PIPELINE / 'template/smart_viewer_template.html'),
                '--output', str(output), '--title', '테스트 교재',
            ], cwd=work, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            html = output.read_text()
            for expected in ['왼쪽 원문', '오른쪽 원문', '22쪽', '23쪽', '테스트 교재']:
                self.assertIn(expected, html)
            self.assertNotIn('{{CARDS_CONTAINER}}', html)

    def test_native_ocr_compiler_uses_bundled_source(self):
        spec = importlib.util.spec_from_file_location('batch_ocr', PIPELINE / 'src/batch_ocr.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as work, patch.object(module.subprocess, 'run') as run:
            binary = str(Path(work) / 'bin/ocr_tool')
            self.assertEqual(module.ensure_ocr_tool(bin_path=binary), binary)
            command = run.call_args.args[0]
            self.assertTrue(Path(command[2]).is_absolute())
            self.assertTrue(Path(command[2]).is_file())
            self.assertEqual(command[-1], binary)


if __name__ == '__main__':
    unittest.main()

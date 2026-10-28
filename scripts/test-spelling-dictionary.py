"""Regression checks for imported spelling rules; no source workbook is edited."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('dictionary', Path(__file__).with_name('build-spelling-dictionary.py'))
dictionary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dictionary)


class DictionaryImportTests(unittest.TestCase):
    def test_numeric_descriptors_keep_their_values_and_codes(self):
        self.assertTrue(dictionary.safe_rule('tawcs kee nowr 3 canhs', 'tắc kê nở 3 cánh'))
        self.assertTrue(dictionary.safe_rule('tawcs kee nhuwaj gai 6 khias', 'tắc kê nhựa gai 6 khía'))
        self.assertTrue(dictionary.safe_rule('tắc kê nở ba cánh', 'tắc kê nở 3 cánh'))
        self.assertTrue(dictionary.safe_rule('tắc kê nhựa gai sáu khía', 'tắc kê nhựa gai 6 khía'))
        self.assertTrue(dictionary.safe_rule('tans khoong rawng', 'tán không răng'))
        for wrong, correct in [('m10', 'm12'), ('m10', '10'), ('kt 421 25', 'kt 4212.5'), ('6 khia', '3 khía')]:
            self.assertFalse(dictionary.safe_rule(wrong, correct))

    def test_keyword_headers_are_reference_terms_and_synonyms_are_corrections(self):
        test_root = Path(__file__).resolve().parents[1] / 'output' / 'spelling'
        test_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=test_root) as temporary:
            folder = Path(temporary)
            self.assertTrue(folder.resolve().is_relative_to(test_root.resolve()))
            workbook = folder / 'new-rules.xlsx'
            workbook.write_bytes(b'fixture')
            rows = [
                ('KEYWORD', {'A':'Keyword TB5 ', 'B':'category_id', 'C':'Danh mục TB5 '}),
                ('KEYWORD', {'A':'ê cu cánh', 'B':'123', 'C':'Tán cánh chuồn'}),
                ('CHINH TA', {'A':'synonym', 'B':'correct_word'}),
                ('CHINH TA', {'A':'tawcs kee 3 canhs', 'B':'tắc kê 3 cánh'}),
                ('CHINH TA', {'A':'m10', 'B':'m12'}),
            ]
            with patch.object(dictionary, 'read_rows', return_value=iter(rows)):
                frequency, rules, sources = dictionary.catalog_vocabulary(folder)
            self.assertIn('ê cu cánh', frequency)
            self.assertIn('tán cánh chuồn', frequency)
            self.assertEqual(rules['tawcs kee 3 canhs'], {'tắc kê 3 cánh'})
            self.assertNotIn('m10', rules)
            self.assertNotIn('ê cu cánh', rules, 'Category labels must not become forced synonym mappings')
            self.assertEqual(sources[0]['usedRows'], 2)
            self.assertEqual(workbook.read_bytes(), b'fixture')


if __name__ == '__main__':
    unittest.main()

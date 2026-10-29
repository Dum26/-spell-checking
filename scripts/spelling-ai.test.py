"""Check that combined inference compares independent corrections of the original."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, call

spec = importlib.util.spec_from_file_location('spelling_worker', Path(__file__).with_name('spelling-ai.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class CombinedInferenceTest(unittest.TestCase):
    def test_warmup_loads_all_three_models_and_reports_individual_errors(self):
        with patch.object(worker, 'correct', return_value=[]) as correct:
            self.assertEqual(worker.warm_models()['models'], {'vn-base':'ready', 'bartpho':'ready', 'protonx':'ready'})
            self.assertEqual([args.args[1] for args in correct.call_args_list], ['vn-base','bartpho','protonx'])
        with patch.object(worker, 'correct', side_effect=[[], ValueError('missing'), []]):
            result = worker.warm_models()
            self.assertEqual(result['models']['bartpho'], 'error')
            self.assertEqual(result['models']['protonx'], 'ready')
            self.assertEqual(result['errors']['bartpho'], 'missing')

    def test_both_models_receive_original_text(self):
        original_correct = worker.correct
        first = [{'model': 'bartpho', 'text': 'tôi muốn'}]
        second = [{'model': 'protonx', 'text': 'tôi muộn'}]
        with patch.object(worker, 'correct', side_effect=[first, second]) as correct:
            self.assertEqual(original_correct('tôi muón', 'bartpho-protonx'), first + second)
            self.assertEqual(correct.call_args_list, [call('tôi muón', 'bartpho'), call('tôi muón', 'protonx')])


if __name__ == '__main__':
    unittest.main()

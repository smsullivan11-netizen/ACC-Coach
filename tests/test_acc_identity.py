"""Regression: AC and ACC share acpmf_*; prove identity before recording, preserve old ACC files."""
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import acc_identity as identity
import acc_shm as shm
import accrec
import recording
import recorder
import upload


class AccIdentityTests(unittest.TestCase):
    def test_process_identity_is_positive_and_unambiguous(self):
        for processes in (None, [], ['acs.exe'], ['acs_x86.exe'], ['AssettoCorsa.exe'], ['AC2.exe'], ['AC2-Win64-Shipping.exe', 'acs.exe']):
            self.assertIsNone(identity.identify_processes(processes))
        self.assertEqual(identity.identify_processes(['AC2-Win64-Shipping.EXE'])['simulator'], 'acc')
        self.assertIsNotNone(identity.identify_processes(['AC2-WinGDK-Shipping.exe', 'ContentManager.exe']))

    def test_probe_rechecks_and_fails_closed(self):
        now = [0.0]
        processes = Mock(side_effect=[['AC2-Win64-Shipping.exe'], ['acs.exe'], OSError('unavailable')])
        probe = identity.GameProbe(processes, lambda: now[0])
        self.assertIsNotNone(probe())
        now[0] = 0.1
        self.assertIsNotNone(probe()); self.assertEqual(processes.call_count, 1)
        now[0] = 0.3
        self.assertIsNone(probe())
        now[0] = 0.6
        self.assertIsNone(probe())

    def test_existing_views_cannot_bypass_game_check(self):
        mem = object.__new__(shm.SharedMemory)
        mem.prefix, mem.game_probe, mem._k = shm.DEFAULT_PREFIX, lambda: None, Mock()
        mem.views = {'physics': (1, 2, 3)}
        self.assertFalse(mem.open()); self.assertEqual(mem.views, {})
        mem._k.UnmapViewOfFile.assert_called_once_with(2)

    def test_recorder_ends_file_on_identity_loss(self):
        with tempfile.TemporaryDirectory() as out:
            rec = recorder.Recorder(out, log=lambda *a, **k: None)
            rec.writer = object()
            stop = threading.Event()
            mem = Mock(); mem.open.return_value = False
            def finish(): rec.writer = None
            def wait(_): stop.set()
            with patch.object(shm, 'SharedMemory', return_value=mem), patch.object(rec, '_finish', side_effect=finish), patch.object(stop, 'wait', side_effect=wait):
                rec.run(stop)
            self.assertIsNone(rec.writer); self.assertEqual(rec.state, 'waiting')

    def recording(self, path, track, car='ford_mustang_gt3', **header):
        raw = np.zeros(1, dtype=shm.PAGES['static'][2])
        for key, text in {'track': track, 'carModel': car, 'acVersion': '1.10.2'}.items():
            chars = np.frombuffer(text.encode('utf-16-le'), dtype='<u2')
            raw[0][key][:len(chars)] = chars
        writer = accrec.Writer(path, raw.tobytes(), header); writer.close()

    def test_legacy_acu_recordings_are_refused_before_network(self):
        with tempfile.TemporaryDirectory() as out:
            for track in ('acu_unitedstates', 'ACU Mexico 2021', 'ks_nordschleife'):
                path = Path(out) / (track + '.accrec'); self.recording(path, track)
                with self.assertRaisesRegex(ValueError, 'not ACC'):
                    recording.load_recording(str(path))
                with patch.object(upload, 'request') as request:
                    result = upload.upload_file(path, 'https://example.com', 'dummy-test-token')
                    self.assertEqual(result['status'], 'refused'); request.assert_not_called()

    def test_old_acc_cota_and_new_verified_acc_remain_readable(self):
        with tempfile.TemporaryDirectory() as out:
            path = Path(out) / 'cota.accrec'; self.recording(path, 'cota')
            head, laps, _ = recording.load_recording(str(path))
            self.assertEqual(head.venue, 'cota'); self.assertEqual(laps, [])
            self.recording(path, 'cota', simulator='acc', simulator_identity=identity.identify_processes(['AC2-Win64-Shipping.exe']))
            self.assertEqual(recording.load_recording(str(path))[0].simulator_identity['simulator'], 'acc')

    def test_explicit_foreign_provenance_rejected_even_on_same_named_track(self):
        with self.assertRaises(ValueError): identity.validate_source('cota', 'ford_mustang_gt3', 'ac')
        with self.assertRaises(ValueError): identity.validate_source('cota', 'ford_mustang_gt3', 'acc', {'simulator': 'acc', 'method': 'windows-process', 'executable': 'acs.exe'})

if __name__ == '__main__': unittest.main()

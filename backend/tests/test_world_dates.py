import unittest
from backend.worlds import provider_datetime


class ProviderDates(unittest.TestCase):
    def test_postgres_trimmed_fraction_is_not_a_failed_world(self):
        for fraction in ['1', '12', '123', '1234', '12345', '123456']:
            value=provider_datetime('2026-10-31T12:55:32.'+fraction+'+00:00')
            self.assertEqual(value.microsecond,int(fraction.ljust(6,'0')))

    def test_zulu_and_missing_timezone(self):
        self.assertIsNotNone(provider_datetime('2026-10-31T12:55:32Z').tzinfo)
        with self.assertRaises(ValueError):
            provider_datetime('2026-10-31T12:55:32')

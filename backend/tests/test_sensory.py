import re
import unittest
from fastapi.testclient import TestClient
from backend.main import app
from backend.sensory import SensoryRequest, build_response


def normalized(text):
    return re.sub(r'\s+', ' ', text).strip()


class SensoryTests(unittest.TestCase):
    def cues(self, story='', anchors=None, mood='Nostalgic'):
        return build_response(SensoryRequest.model_validate({'story': story, 'anchors': anchors or [], 'mood': mood})).cues

    def test_copied_quote_from_story(self):
        story = 'It rained all afternoon. I read by the window.'
        cue = next(c for c in self.cues(story) if c.engine == 'rain')
        self.assertEqual(cue.kind, 'sound')
        self.assertEqual(cue.source, 'story')
        self.assertIsNone(cue.anchorId)
        self.assertIn(cue.quote, normalized(story))
        self.assertIn('rained', cue.quote)

    def test_anchor_cue_keeps_its_owner(self):
        cues = self.cues('A quiet room.', [{'id': 'anchor-1', 'memory': 'The woodsmoke stayed in my coat.'}])
        smoke = next(c for c in cues if c.label == 'Woodsmoke')
        self.assertEqual((smoke.source, smoke.anchorId), ('anchor', 'anchor-1'))
        self.assertIn('woodsmoke', smoke.quote.lower())

    def test_repeated_hit_stays_single_and_stronger(self):
        cues = self.cues('Rain on the roof. Rain in the street. Rain again.')
        rain = [c for c in cues if c.engine == 'rain']
        self.assertEqual(len(rain), 1)
        self.assertAlmostEqual(rain[0].intensity, 0.7)

    def test_unmentioned_senses_are_absent(self):
        self.assertEqual(self.cues('I wrote a letter and mailed it.'), [])

    def test_modes_are_separate(self):
        # One word may legitimately support two kinds; each keeps its own cue.
        cues = self.cues('The sea was loud and the air tasted of salt.')
        self.assertTrue(any(c.kind == 'sound' and c.engine == 'waves' for c in cues))
        self.assertTrue(any(c.kind == 'scent' and c.label == 'Salt air' for c in cues))

    def test_limits_and_determinism(self):
        story = ('Rain, fire, waves, birds, wind and music filled the cold, warm, '
                 'woolly, wooden, sunny and lamplit room with coffee, flowers, pine, '
                 'soap and woodsmoke, while sand gritted underfoot.')
        cues = self.cues(story)
        self.assertLessEqual(len(cues), 12)
        for kind in ('sound', 'scent', 'temperature', 'texture', 'light'):
            self.assertLessEqual(sum(c.kind == kind for c in cues), 4)
        again = self.cues(story)
        self.assertEqual([c.model_dump() for c in cues], [c.model_dump() for c in again])

    def test_long_sentence_is_windowed_around_the_hit(self):
        story = ('I walked through the long hallway remembering every summer, the '
                 'heat rising from the old road, until the woodsmoke found me again '
                 'and I stopped beside the door, listening to the rain begin on the '
                 'roof of the house we left behind so many years before that evening.')
        smoke = next(c for c in self.cues(story) if c.label == 'Woodsmoke')
        self.assertLessEqual(len(smoke.quote), 240)
        self.assertIn('woodsmoke', smoke.quote.lower())
        self.assertIn(smoke.quote, normalized(story))

    def test_endpoint_rejects_extra_and_never_echoes_story(self):
        client = TestClient(app)
        secret = 'A private sentence nobody should see in an error.'
        response = client.post('/api/sensory-cues', json={'story': secret, 'anchors': [], 'mood': 'Nostalgic', 'extra': True})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(secret, response.text)

    def test_endpoint_payload(self):
        client = TestClient(app)
        response = client.post('/api/sensory-cues', json={
            'story': 'It rained all afternoon.',
            'anchors': [{'id': 'a1', 'memory': 'The floorboards were cold.'}],
            'mood': 'Nostalgic',
        })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual((body['version'], body['source']), (1, 'lexicon'))
        self.assertTrue(body['cues'])
        self.assertTrue(all('anchorId' not in cue for cue in body['cues'] if cue['source'] == 'story'))
        self.assertTrue(any(cue.get('anchorId') == 'a1' for cue in body['cues']))


if __name__ == '__main__':
    unittest.main()

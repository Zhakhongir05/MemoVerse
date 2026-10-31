import test from 'node:test'
import assert from 'node:assert/strict'
import {isLegacyPodcast} from './podcastVersion.js'
test('old generic recordings cannot masquerade as personalized narration',()=>{
 assert.equal(isLegacyPodcast({version:1,chapters:[{narration:'Take a breath.'}]}),true)
 assert.equal(isLegacyPodcast({chapters:[{narration:'A saved recording.'}]}),true)
 assert.equal(isLegacyPodcast({version:3,chapters:[{narration:'A literal room tour.'}]}),true)
 assert.equal(isLegacyPodcast({version:4,chapters:[{narration:'Take a deep breath.'}]}),true)
 assert.equal(isLegacyPodcast({version:4,chapters:[{narration:'The window you remember frames the view beyond the purple cushions.'}]}),false)
})

# Personalized MemoryCast narration

New tours use high-detail OpenAI photo understanding, an evidence-linked three-chapter script, and `gpt-4o-mini-tts` with the Coral voice. Script generation defaults to the configured `OPENAI_MODEL`. Set server-only `MEMORYCAST_SCRIPT_PROVIDER=deepseek` to use the existing Lablup client instead. No provider fallback or paid retry happens automatically.

The writer uses visible photo details, saved journal text and existing anchor stories. It must distinguish visible observations from personal history and only attribute emotions supplied by the writer. Exact source excerpts are validated; this validates references, not the factual accuracy of every generated sentence. Subjective quality still requires review.

The version-2 fingerprint makes older generic tours stale without deleting them. The Guided Journey panel offers an explicit updated-podcast action. Replaying uses saved audio and never generates again; updating uses the narration allowance and provider billing. Existing RPCs and private audio storage are unchanged; no migration is required. World Labs world generation and its three-per-account allowance are unaffected.

A technical or sparse journal entry cannot support a rich personal narrative. The script should focus on visible details rather than invent relationships, events or feelings. Missing spatial anchors never become inferred camera coordinates.

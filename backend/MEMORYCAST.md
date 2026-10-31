# Personalized MemoryCast narration

New tours use high-detail OpenAI photo understanding, an evidence-linked three-chapter script followed by an evidence-edit pass, and `gpt-4o-mini-tts` with the Coral voice. Script generation defaults to `gpt-4.1` (server override: `MEMORYCAST_SCRIPT_MODEL`). Set server-only `MEMORYCAST_SCRIPT_PROVIDER=deepseek` to use the existing Lablup client instead. No provider fallback or paid retry happens automatically.

The writer uses visible photo details, saved journal text and existing anchor stories. It must distinguish visible observations from personal history and only attribute emotions supplied by the writer. The script plan selects known source IDs and the server attaches their text. A journal interpretation must cite the written entry. Both writing and editing use the selected script provider. Each request has a bounded 12-second timeout inside a 27-second script step; neither is automatically retried. Exact evidence references are validated; this validates references, not the factual accuracy of every generated sentence. Subjective quality still requires review.

The version-3 fingerprint makes older generic tours stale without deleting them. The Guided Journey panel offers an explicit updated-podcast action. Replaying uses saved audio and never generates again; updating uses the narration allowance and provider billing. Existing RPCs and private audio storage are unchanged; no migration is required. World Labs world generation and its three-per-account allowance are unaffected.

A technical or sparse journal entry cannot support a rich personal narrative. The script should focus on visible details rather than invent relationships, events or feelings. Missing spatial anchors never become inferred camera coordinates.

Older generic recordings are hidden by default and can only be replayed through an explicitly labelled previous-recording action. A failed obsolete version can be explicitly updated; uncertain billing states still require owner review. No automatic paid retries are introduced.

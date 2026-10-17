# Message packs

Each `.json` file is one pack:

```json
{
  "collection": "Little Interruptions",
  "version": 1,
  "locale": "en",
  "status": "published",
  "messages": [
    { "id": "li-001", "category": "body", "text": "Unclench your jaw." }
  ]
}
```

Rules (enforced by `pnpm validate:packs` and by the app when it downloads a pack):

- `id`: unique, never reused, matching `li-###`-style ids; changing text under an existing id updates it on users' machines.
- `text`: at most 100 characters, no control characters.
- `category`: one of the categories defined in `packages/core/src/types.ts`.
- At most 2000 messages per pack.
- Messages are only ever added or updated on users' machines, never deleted.

## Content license

The license for pack content has not been decided yet (CC0 is the suggested default so anyone can reuse and translate the messages). Until the owner decides, treat it as all rights reserved.

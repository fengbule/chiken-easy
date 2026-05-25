# Memos

## Overview

The memos workspace is designed for infra and node operations. It supports:

- create, edit, delete
- archive and pin
- tags and search
- Markdown authoring
- Markdown preview
- linked files
- linked server references

## Memo Fields

Each memo can store:

- `title`
- `content`
- `tags`
- `visibility`
- `pinned`
- `archived`
- `agentId`
- `nodeId`
- `forwardRuleId`
- `attachments`

Visibility values:

- `private`
- `public`
- `link`

## Attachments

Upload API:

- `POST /api/files/upload`

File APIs:

- `GET /api/files`
- `GET /api/files/:id/download`
- `DELETE /api/files/:id`

Behavior:

- uploads are stored below `data/uploads`
- file names are sanitized
- download requires authenticated access
- deletes are audited
- MIME type and max size are controlled by:
  - `CHIKEN_UPLOAD_MAX_MB`
  - `CHIKEN_UPLOAD_TYPES`

## Linked Operations Data

Memos can be linked to:

- an agent
- a node-pool item
- a forward rule

The current server detail API also returns linked memos for that machine.

## Suggested Operations Templates

Typical memo categories for this panel:

- server handoff record
- node config record
- incident postmortem
- SSH access notes
- renewal record
- provider contact record
- forwarding record
- subscription change record

## Real Acceptance Notes

The current build was validated with real memo flows:

- create memo
- search by text
- upload attachment
- download attachment
- delete attachment
- link note to a real server

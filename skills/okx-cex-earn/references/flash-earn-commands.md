# Flash Earn (闪赚) Command Reference

## earn flash-earn projects

Browse upcoming or in-progress Flash Earn projects.

```bash
okx --profile live earn flash-earn projects                  # all (upcoming + in-progress)
okx --profile live earn flash-earn projects --status 0       # upcoming only
okx --profile live earn flash-earn projects --status 100     # in-progress only
okx --profile live earn flash-earn projects --status 0,100   # both (explicit)
okx --profile live earn flash-earn projects --json
```

| Parameter | Required | Description |
|---|---|---|
| `--status` | No | Filter by status: `0`=upcoming, `100`=in-progress. Comma-separated for multiple. Defaults to both |
| `--json` | No | Output raw JSON |

### Output fields

`id` · `status` (0=upcoming, 100=in-progress) · `canPurchase` (boolean) · `beginTime` (formatted) · `endTime` (formatted) · `rewards` (array of reward objects with `amt` and `ccy`)

### Edge cases

- **No projects available**: outputs "No flash earn projects" (table mode) or empty JSON array (`[]` in `--json` mode)
- **Invalid status value**: CLI rejects with error message; only `0` and `100` are accepted
- **Empty `--status` flag**: CLI rejects (e.g. `--status ""` is not allowed)
- **Trailing comma**: CLI rejects (e.g. `--status 0,` is not allowed)

---

## MCP Tool Reference

| CLI Command | MCP Tool | Parameters |
|---|---|---|
| `earn flash-earn projects` | `earn_get_flash_earn_projects` | `status` (optional, integer array) — defaults to `[0, 100]` |

### MCP-specific behavior

- The MCP tool accepts `status` as an integer array (e.g. `[0, 100]`), not a comma-separated string
- If `status` is omitted or invalid, the tool defaults to `[0, 100]`
- Response includes enriched `beginTime` / `endTime` fields (formatted from raw `beginTs` / `endTs` timestamps)

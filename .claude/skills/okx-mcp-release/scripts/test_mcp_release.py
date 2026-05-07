"""Tests for mcp_release.py — uses stdlib unittest, no external deps."""

import json
import unittest
from unittest.mock import MagicMock, patch

import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from mcp_release import fetch_remote_tools, RemoteFetchError, compare, normalize_remote_tool


class TestFetchRemote(unittest.TestCase):
    def test_fetch_success(self):
        fake_response = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "tools": [
                    {
                        "name": "spot_place_order",
                        "description": "Place a spot order.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "instId": {"type": "string", "description": "Instrument ID"}
                            },
                            "required": ["instId"]
                        }
                    }
                ]
            }
        }).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = fake_response
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            tools = fetch_remote_tools("http://fake/mcp")

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0]["name"], "spot_place_order")

    def test_fetch_http_error_raises(self):
        with patch("urllib.request.urlopen", side_effect=OSError("conn refused")):
            with self.assertRaises(RemoteFetchError):
                fetch_remote_tools("http://fake/mcp")


class TestCompare(unittest.TestCase):
    def _local_doc(self, tools_per_module):
        """Build a minimal docs/tools.json structure."""
        return {
            "generatedAt": "2026-05-07T00:00:00Z",
            "gitCommit": "abc",
            "modules": {
                mod: {"tools": tools}
                for mod, tools in tools_per_module.items()
            },
        }

    def test_identical_no_delta(self):
        local = self._local_doc({
            "spot": [{
                "name": "spot_place_order",
                "description": "Place a spot order.",
                "params": {
                    "instId": {"type": "string", "required": True}
                },
                "isWrite": True,
                "source": ["cli", "mcp"],
            }],
        })
        remote = [{
            "name": "spot_place_order",
            "description": "Place a spot order.",
            "inputSchema": {
                "type": "object",
                "properties": {"instId": {"type": "string"}},
                "required": ["instId"],
            },
        }]
        delta = compare(local, remote)
        self.assertEqual(delta["add"], [])
        self.assertEqual(delta["modify"], [])
        self.assertEqual(delta["remove"], [])

    def test_remote_missing_tool_goes_to_add(self):
        local = self._local_doc({
            "spot": [{
                "name": "spot_place_order",
                "description": "x",
                "params": {"instId": {"type": "string", "required": True}},
                "isWrite": True,
                "source": ["cli", "mcp"],
            }],
        })
        delta = compare(local, [])
        self.assertEqual(len(delta["add"]), 1)
        self.assertEqual(delta["add"][0]["name"], "spot_place_order")

    def test_remote_extra_tool_goes_to_remove(self):
        local = self._local_doc({"spot": []})
        remote = [{
            "name": "stale_tool",
            "description": "x",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        }]
        delta = compare(local, remote)
        self.assertEqual(len(delta["remove"]), 1)
        self.assertEqual(delta["remove"][0]["name"], "stale_tool")

    def test_description_diff_goes_to_modify(self):
        local = self._local_doc({
            "spot": [{
                "name": "spot_place_order",
                "description": "NEW description",
                "params": {"instId": {"type": "string", "required": True}},
                "isWrite": True,
                "source": ["cli", "mcp"],
            }],
        })
        remote = [{
            "name": "spot_place_order",
            "description": "OLD description",
            "inputSchema": {
                "type": "object",
                "properties": {"instId": {"type": "string"}},
                "required": ["instId"],
            },
        }]
        delta = compare(local, remote)
        self.assertEqual(len(delta["modify"]), 1)
        self.assertEqual(delta["modify"][0]["name"], "spot_place_order")
        self.assertIn("description", delta["modify"][0]["fields"])


if __name__ == "__main__":
    unittest.main()
